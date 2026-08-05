import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { requireAuth, requireManager, requireHR } from '../shared/middleware/auth';

// ── DB pool (inline to avoid path issues) ────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
async function withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Event bus (lazy import) ───────────────────────────────────
async function getEventBus() {
  const { eventBus } = await import('../shared/events/bus');
  return eventBus;
}

import { startOfWeek, format } from 'date-fns';
import { computeDDUInsurance, computePortCharge } from '../shared/calculations';
const weekStartFn = () => format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

// ─────────────────────────────────────────────
// LOGISTICS ROUTER
// ─────────────────────────────────────────────
export const logisticsRouter = Router();
logisticsRouter.use(requireAuth);

logisticsRouter.get('/shipments', async (req: Request, res: Response) => {
  const { status } = req.query as { status?: string };
  try {
    const rows = await query(
      `SELECT s.*,
              e.escrow_code, e.status AS escrow_status, e.days_outstanding,
              ip.policy_number, ip.status AS insurance_status,
              po.po_number, po.steel_grade
       FROM shipments s
       LEFT JOIN escrows e ON e.shipment_id = s.id
       LEFT JOIN insurance_policies ip ON ip.shipment_id = s.id
       LEFT JOIN purchase_orders po ON po.id = s.po_id
       ${status ? 'WHERE s.status = $1' : ''}
       ORDER BY s.created_at DESC`,
      status ? [status] : []
    );
    return res.json({ success: true, data: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

logisticsRouter.post('/shipments', requireManager, async (req: Request, res: Response) => {
  const { po_id, origin_port, destination_port, weight_ordered_tonnes, etd, eta } = req.body;
  try {
    const [{ count }] = await query(`SELECT COUNT(*) FROM shipments`);
    const shipment_code = `SHP-${new Date().getFullYear()}-${String(parseInt(count) + 1).padStart(4, '0')}`;
    const shipment = await queryOne(
      `INSERT INTO shipments
         (shipment_code, po_id, status, origin_port, destination_port,
          weight_ordered_tonnes, etd, eta)
       VALUES ($1,$2,'loading',$3,$4,$5,$6,$7) RETURNING *`,
      [shipment_code, po_id, origin_port, destination_port, weight_ordered_tonnes, etd, eta]
    );
    return res.status(201).json({ success: true, data: shipment });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

logisticsRouter.patch('/shipments/:id/status', requireManager, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, ata, atd } = req.body;
  try {
    const updated = await queryOne(
      `UPDATE shipments
       SET status = $1,
           ata = COALESCE($2, ata),
           atd = COALESCE($3, atd),
           delivery_confirmed_at = CASE WHEN $1 = 'delivered' THEN NOW() ELSE delivery_confirmed_at END
       WHERE id = $4 RETURNING *`,
      [status, ata, atd, id]
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Shipment not found' });
    if (status === 'delivered') {
      const escrow = await queryOne<any>(`SELECT id FROM escrows WHERE shipment_id = $1`, [id]);
      const bus = await getEventBus();
      bus.emit('shipment.delivered', {
        shipment_id: id,
        client_id: (updated as any).client_id || '',
        escrow_id: escrow?.id,
      });
    }
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

logisticsRouter.post('/loading-jobs', requireManager, async (req: Request, res: Response) => {
  const { shipment_id, crew_ids, foreman_id, sea_can_number, excavator_operator, start_time } = req.body;
  try {
    const job = await queryOne(
      `INSERT INTO loading_jobs
         (shipment_id, crew_ids, foreman_id, sea_can_number,
          excavator_operator, start_time, status)
       VALUES ($1,$2,$3,$4,$5,$6,'in_progress') RETURNING *`,
      [shipment_id, crew_ids || [], foreman_id, sea_can_number,
       excavator_operator, start_time || new Date().toISOString()]
    );
    return res.status(201).json({ success: true, data: job });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

logisticsRouter.patch('/loading-jobs/:id/complete', requireManager, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { weight_loaded_tonnes, photo_urls, incidents } = req.body;
  try {
    const job = await queryOne(
      `UPDATE loading_jobs
       SET status = 'complete', end_time = NOW(),
           weight_loaded_tonnes = $1, photo_urls = $2, incidents = $3
       WHERE id = $4 RETURNING *`,
      [weight_loaded_tonnes, photo_urls, incidents, id]
    );
    if (job) {
      await query(`UPDATE shipments SET weight_loaded_tonnes = $1 WHERE id = $2`,
        [weight_loaded_tonnes, (job as any).shipment_id]);
    }
    return res.json({ success: true, data: job });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

logisticsRouter.post('/port-charges', requireManager, async (req: Request, res: Response) => {
  const { shipment_id, port_name, port_type, unload_start, rate_per_hour, currency } = req.body;
  try {
    const charge = await queryOne(
      `INSERT INTO port_charges
         (shipment_id, port_name, port_type, unload_start, rate_per_hour, currency)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [shipment_id, port_name, port_type || 'destination',
       unload_start || new Date().toISOString(), rate_per_hour, currency || 'USD']
    );
    return res.status(201).json({ success: true, data: charge });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

logisticsRouter.patch('/port-charges/:id/close', requireManager, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const charge = await queryOne(
      `UPDATE port_charges
       SET unload_end = NOW(),
           hours_billed = EXTRACT(EPOCH FROM (NOW() - unload_start)) / 3600.0,
           overtime_hours = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - unload_start)) / 3600.0 - 8),
           total_charge = rate_per_hour * EXTRACT(EPOCH FROM (NOW() - unload_start)) / 3600.0
       WHERE id = $1 RETURNING *`,
      [id]
    );
    if (charge && (charge as any).overtime_hours > 0) {
      const bus = await getEventBus();
      bus.emit('port.hour_8_overtime', {
        port_charge_id: id,
        shipment_id: (charge as any).shipment_id,
        hours: (charge as any).hours_billed,
        rate: (charge as any).rate_per_hour,
      });
    }
    return res.json({ success: true, data: charge });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// FINANCE ROUTER
// ─────────────────────────────────────────────
export const financeRouter = Router();
financeRouter.use(requireAuth);

financeRouter.get('/escrows', async (req: Request, res: Response) => {
  const { status } = req.query as { status?: string };
  try {
    const rows = await query(
      `SELECT e.*, s.shipment_code, s.origin_port, s.destination_port,
              c.company_name AS client_name
       FROM escrows e
       JOIN shipments s ON s.id = e.shipment_id
       JOIN clients c ON c.id = e.client_id
       ${status ? 'WHERE e.status = $1' : ''}
       ORDER BY e.days_outstanding DESC NULLS LAST, e.created_at DESC`,
      status ? [status] : []
    );
    return res.json({ success: true, data: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

financeRouter.post('/escrows', requireManager, async (req: Request, res: Response) => {
  const { shipment_id, client_id, value, currency, provider } = req.body;
  try {
    const [{ count }] = await query(`SELECT COUNT(*) FROM escrows`);
    const escrow_code = `ESC-${new Date().getFullYear()}-${String(parseInt(count) + 1).padStart(4, '0')}`;
    const escrow = await queryOne(
      `INSERT INTO escrows
         (escrow_code, shipment_id, client_id, value, currency, provider, status)
       VALUES ($1,$2,$3,$4,$5,$6,'open') RETURNING *`,
      [escrow_code, shipment_id, client_id, value, currency || 'USD', provider]
    );
    await query(`UPDATE shipments SET escrow_id = $1 WHERE id = $2`, [escrow && (escrow as any).id, shipment_id]);
    return res.status(201).json({ success: true, data: escrow });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

financeRouter.patch('/escrows/:id/open', requireManager, async (req: Request, res: Response) => {
  try {
    const updated = await queryOne(
      `UPDATE escrows SET status = 'open', opened_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

financeRouter.patch('/escrows/:id/sign', requireManager, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const escrow = await queryOne<any>(`SELECT * FROM escrows WHERE id = $1`, [id]);
    if (!escrow) return res.status(404).json({ success: false, error: 'Escrow not found' });
    const updated = await queryOne(
      `UPDATE escrows SET status = 'signed', signed_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    const bus = await getEventBus();
    bus.emit('escrow.signed', {
      escrow_id: id, shipment_id: escrow.shipment_id,
      client_id: escrow.client_id, value: escrow.value,
    });
    return res.json({ success: true, data: updated, message: 'Escrow signed — commissions released' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

financeRouter.get('/invoices', async (req: Request, res: Response) => {
  const { ledger, status } = req.query as { ledger?: string; status?: string };
  const conditions: string[] = [];
  const params: any[] = [];
  if (ledger) { params.push(ledger); conditions.push(`i.ledger = $${params.length}`); }
  if (status) { params.push(status); conditions.push(`i.status = $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const invoices = await query(
      `SELECT i.*, po.po_number, s.shipment_code, e.full_name AS approved_by_name
       FROM invoices i
       LEFT JOIN purchase_orders po ON po.id = i.po_id
       LEFT JOIN shipments s ON s.id = i.shipment_id
       LEFT JOIN employees e ON e.id = i.approved_by
       ${where} ORDER BY i.created_at DESC`,
      params
    );
    return res.json({ success: true, data: invoices });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

financeRouter.post('/invoices', requireManager, async (req: Request, res: Response) => {
  const { po_id, shipment_id, invoice_type, amount, currency, ledger } = req.body;
  try {
    const [{ count }] = await query(`SELECT COUNT(*) FROM invoices`);
    const invoice_number = `INV-${new Date().getFullYear()}-${String(parseInt(count) + 1).padStart(5, '0')}`;
    const invoice = await queryOne(
      `INSERT INTO invoices
         (invoice_number, po_id, shipment_id, invoice_type, amount, currency, ledger)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [invoice_number, po_id, shipment_id, invoice_type, amount, currency || 'USD', ledger || 'india']
    );
    return res.status(201).json({ success: true, data: invoice });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

financeRouter.patch('/invoices/:id/approve', requireManager, async (req: Request, res: Response) => {
  try {
    const updated = await queryOne(
      `UPDATE invoices SET status = 'approved', approved_by = $1
       WHERE id = $2 AND status = 'pending_approval' RETURNING *`,
      [req.user!.user_id, req.params.id]
    );
    if (!updated) return res.status(400).json({ success: false, error: 'Invoice not found or already processed' });
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

financeRouter.post('/insurance', requireManager, async (req: Request, res: Response) => {
  const { shipment_id, insurer_name, policy_number, shipment_value, coverage_start, coverage_end, currency } = req.body;
  try {
    const policy = await queryOne(
      `INSERT INTO insurance_policies
         (policy_number, shipment_id, insurer_name, policy_type,
          shipment_value, currency, coverage_start, coverage_end, status)
       VALUES ($1,$2,$3,'DDU',$4,$5,$6,$7,'issued') RETURNING *`,
      [policy_number, shipment_id, insurer_name, shipment_value, currency || 'USD', coverage_start, coverage_end]
    );
    return res.status(201).json({ success: true, data: policy });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// PROCUREMENT ROUTER
// ─────────────────────────────────────────────
export const procurementRouter = Router();
procurementRouter.use(requireAuth);

procurementRouter.get('/pos', async (req: Request, res: Response) => {
  const { status } = req.query as { status?: string };
  try {
    const rows = await query(
      `SELECT po.*, m.name AS mill_name,
              e.full_name AS raised_by_name, a.full_name AS approved_by_name
       FROM purchase_orders po
       JOIN mills m ON m.id = po.mill_id
       JOIN employees e ON e.id = po.raised_by
       LEFT JOIN employees a ON a.id = po.approved_by
       ${status ? 'WHERE po.status = $1' : ''}
       ORDER BY po.created_at DESC`,
      status ? [status] : []
    );
    return res.json({ success: true, data: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

procurementRouter.post('/pos', async (req: Request, res: Response) => {
  const { mill_id, steel_grade, quantity_tonnes, quoted_price_per_tonne,
          currency, required_by_date, linked_deal_id } = req.body;
  try {
    const [{ count }] = await query(`SELECT COUNT(*) FROM purchase_orders`);
    const po_number = `PO-${new Date().getFullYear()}-${String(parseInt(count) + 1).padStart(4, '0')}`;
    const ddu = computeDDUInsurance(parseFloat(quantity_tonnes), parseFloat(quoted_price_per_tonne));
    const po = await queryOne(
      `INSERT INTO purchase_orders
         (po_number, raised_by, mill_id, steel_grade, quantity_tonnes,
          quoted_price_per_tonne, currency, ddu_insurance_amount,
          required_by_date, status, linked_deal_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending_approval',$10) RETURNING *`,
      [po_number, req.user!.user_id, mill_id, steel_grade, quantity_tonnes,
       quoted_price_per_tonne, currency || 'USD', ddu, required_by_date, linked_deal_id || null]
    );
    return res.status(201).json({ success: true, data: po });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

procurementRouter.patch('/pos/:id/approve', requireManager, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const po = await queryOne(
      `UPDATE purchase_orders
       SET status = 'approved', approved_by = $1, approved_at = NOW()
       WHERE id = $2 RETURNING *`,
      [req.user!.user_id, id]
    );
    if (!po) return res.status(404).json({ success: false, error: 'PO not found' });
    const bus = await getEventBus();
    bus.emit('po.approved', {
      po_id: id, mill_id: (po as any).mill_id,
      steel_grade: (po as any).steel_grade,
      quantity: (po as any).quantity_tonnes,
    });
    return res.json({ success: true, data: po, message: 'PO approved — manufacturing notified' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// MANUFACTURING ROUTER
// ─────────────────────────────────────────────
export const manufacturingRouter = Router();
manufacturingRouter.use(requireAuth);

manufacturingRouter.get('/batches', async (req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT b.*, m.name AS mill_name, e.full_name AS agent_name,
              si.result AS sgs_result
       FROM batches b
       JOIN mills m ON m.id = b.mill_id
       LEFT JOIN employees e ON e.id = b.agent_id
       LEFT JOIN sgs_inspections si ON si.id = b.sgs_inspection_id
       ORDER BY b.created_at DESC`
    );
    return res.json({ success: true, data: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

manufacturingRouter.patch('/batches/:id/ready', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { confirmed_tonnes } = req.body;
  try {
    const batch = await queryOne(
      `UPDATE batches
       SET status = 'ready_at_mill', actual_ready_date = NOW()::DATE,
           confirmed_tonnes = $1
       WHERE id = $2 RETURNING *`,
      [confirmed_tonnes, id]
    );
    if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });
    const bus = await getEventBus();
    bus.emit('batch.ready_at_mill', {
      batch_id: id, mill_id: (batch as any).mill_id,
      po_id: (batch as any).po_id, agent_id: (batch as any).agent_id,
    });
    return res.json({ success: true, data: batch, message: 'Logistics team notified' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

manufacturingRouter.get('/agents', requireManager, async (req: Request, res: Response) => {
  const ws = weekStartFn();
  try {
    const agents = await query(
      `SELECT e.id, e.full_name, e.email, e.status,
              sa.region, sa.sgs_pass_rate, sa.avg_task_turnaround_days,
              sa.total_tonnes_this_month,
              ps.raw_score AS perf_score, ps.tier AS perf_tier,
              COUNT(at.id) FILTER (
                WHERE at.status != 'confirmed' AND at.deadline < NOW()::DATE
              ) AS overdue_tasks
       FROM employees e
       JOIN departments d ON d.id = e.department_id
       LEFT JOIN sourcing_agents sa ON sa.id = e.id
       LEFT JOIN performance_scores ps
         ON ps.employee_id = e.id AND ps.week_start = $1 AND ps.module = 'manufacturing'
       LEFT JOIN agent_tasks at ON at.agent_id = e.id
       WHERE d.module_key = 'manufacturing' AND e.status = 'active'
       GROUP BY e.id, e.full_name, e.email, e.status,
                sa.region, sa.sgs_pass_rate, sa.avg_task_turnaround_days,
                sa.total_tonnes_this_month, ps.raw_score, ps.tier
       ORDER BY ps.raw_score DESC NULLS LAST`,
      [ws]
    );
    return res.json({ success: true, data: agents });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

manufacturingRouter.post('/agent-tasks', requireManager, async (req: Request, res: Response) => {
  const { agent_id, steel_grade, quantity_tonnes, target_price_per_tonne, deadline, target_mill_id } = req.body;
  try {
    const task = await queryOne(
      `INSERT INTO agent_tasks
         (agent_id, assigned_by, steel_grade, quantity_tonnes,
          target_price_per_tonne, deadline, target_mill_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [agent_id, req.user!.user_id, steel_grade, quantity_tonnes,
       target_price_per_tonne, deadline, target_mill_id || null]
    );
    return res.status(201).json({ success: true, data: task });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
