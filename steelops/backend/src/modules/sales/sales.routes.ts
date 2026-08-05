import { Router, Request, Response } from 'express';
import { query, queryOne } from '../../db/pool';
import { requireAuth, requireManager } from '../../shared/middleware/auth';
import { eventBus } from '../../shared/events/bus';
import { format, startOfWeek } from 'date-fns';
import { computeCommission } from '../../shared/calculations';

const router = Router();
router.use(requireAuth);

const weekStart = () => format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

router.get('/contractors', requireManager, async (_req: Request, res: Response) => {
  const ws = weekStart();
  try {
    const rows = await query(
      `SELECT e.id, e.full_name, e.email, e.location, e.status, e.contract_end_date,
              COALESCE(COUNT(sal.id),0) AS contacts_this_week,
              COALESCE(COUNT(sal.id) FILTER (WHERE sal.outcome='closed'),0) AS deals_closed_this_week,
              CASE WHEN COUNT(sal.id)>0
                THEN ROUND(COUNT(sal.id) FILTER (WHERE sal.outcome='closed')::NUMERIC/COUNT(sal.id)*100,1)
                ELSE 0 END AS conversion_rate,
              CASE WHEN COUNT(sal.id)>=20 THEN 'on_target'
                   WHEN COUNT(sal.id)>=15 THEN 'on_track'
                   WHEN COUNT(sal.id)>=10 THEN 'lagging'
                   ELSE 'poor' END AS target_status,
              ps.raw_score AS performance_score, ps.tier AS performance_tier, ps.rank_in_dept
       FROM employees e
       JOIN departments d ON d.id=e.department_id
       LEFT JOIN sales_activity_log sal ON sal.contractor_id=e.id AND sal.week_start=$1
       LEFT JOIN performance_scores ps ON ps.employee_id=e.id AND ps.week_start=$1 AND ps.module='sales'
       WHERE d.module_key='sales' AND e.status='active'
       GROUP BY e.id,e.full_name,e.email,e.location,e.status,e.contract_end_date,ps.raw_score,ps.tier,ps.rank_in_dept
       ORDER BY COUNT(sal.id) DESC`,
      [ws]
    );
    return res.json({ success: true, data: rows, week_start: ws, target: 20 });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/activity', async (req: Request, res: Response) => {
  const user = req.user!;
  const { week, contractor_id } = req.query as Record<string, string>;
  const ws = week || weekStart();
  const params: any[] = [ws];
  let empFilter = '';
  if (user.role === 'hr_admin' || user.role === 'dept_manager') {
    if (contractor_id) { params.push(contractor_id); empFilter = `AND sal.contractor_id=$${params.length}`; }
  } else {
    params.push(user.user_id);
    empFilter = `AND sal.contractor_id=$${params.length}`;
  }
  try {
    const rows = await query(
      `SELECT sal.*, c.company_name, c.contact_name, e.full_name AS contractor_name
       FROM sales_activity_log sal
       JOIN clients c ON c.id=sal.client_id
       JOIN employees e ON e.id=sal.contractor_id
       WHERE sal.week_start=$1 ${empFilter}
       ORDER BY sal.logged_at DESC`,
      params
    );
    return res.json({ success: true, data: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/activity', async (req: Request, res: Response) => {
  const user = req.user!;
  const { client_id, contact_method, outcome, notes, follow_up_date } = req.body;
  if (!client_id || !contact_method || !outcome)
    return res.status(400).json({ success: false, error: 'Required: client_id, contact_method, outcome' });
  try {
    const ws = weekStart();
    const log = await queryOne(
      `INSERT INTO sales_activity_log (contractor_id,client_id,contact_method,outcome,notes,follow_up_date,week_start)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [user.user_id, client_id, contact_method, outcome, notes || null, follow_up_date || null, ws]
    );
    await query(`UPDATE employees SET last_active_at=NOW() WHERE id=$1`, [user.user_id]);
    if (outcome === 'closed') {
      await query(`UPDATE clients SET status='active' WHERE id=$1`, [client_id]);
    }
    return res.status(201).json({ success: true, data: log });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/clients', async (req: Request, res: Response) => {
  const user = req.user!;
  const params: any[] = [];
  let filter = '';
  if (!['hr_admin','dept_manager'].includes(user.role)) {
    params.push(user.user_id);
    filter = `WHERE c.assigned_to=$${params.length}`;
  }
  try {
    const clients = await query(
      `SELECT c.*, e.full_name AS assigned_to_name,
              COUNT(sal.id) AS total_interactions, MAX(sal.logged_at) AS last_contact
       FROM clients c
       LEFT JOIN employees e ON e.id=c.assigned_to
       LEFT JOIN sales_activity_log sal ON sal.client_id=c.id
       ${filter} GROUP BY c.id, e.full_name ORDER BY c.company_name`,
      params
    );
    return res.json({ success: true, data: clients });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/clients', async (req: Request, res: Response) => {
  const { company_name, contact_name, contact_email, contact_phone, country, industry, steel_grades_interest } = req.body;
  if (!company_name) return res.status(400).json({ success: false, error: 'company_name required' });
  try {
    const client = await queryOne(
      `INSERT INTO clients (company_name,contact_name,contact_email,contact_phone,country,industry,assigned_to,steel_grades_interest)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [company_name, contact_name || null, contact_email || null, contact_phone || null,
       country || 'canada', industry || null, req.user!.user_id, steel_grades_interest || []]
    );
    return res.status(201).json({ success: true, data: client });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/quotes', async (req: Request, res: Response) => {
  const { client_id, steel_grade, quantity_tonnes, price_per_tonne, currency, valid_until } = req.body;
  if (!client_id || !steel_grade || !quantity_tonnes || !price_per_tonne || !valid_until)
    return res.status(400).json({ success: false, error: 'All quote fields required' });
  try {
    const [{ count }] = await query(`SELECT COUNT(*) FROM quotes`);
    const quote_number = `QT-${new Date().getFullYear()}-${String(parseInt(count) + 1).padStart(4, '0')}`;
    const quote = await queryOne(
      `INSERT INTO quotes (quote_number,contractor_id,client_id,steel_grade,quantity_tonnes,price_per_tonne,currency,valid_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [quote_number, req.user!.user_id, client_id, steel_grade, quantity_tonnes, price_per_tonne, currency || 'USD', valid_until]
    );
    return res.status(201).json({ success: true, data: quote });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/quotes/:id/accept', requireManager, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const quote = await queryOne<any>(`SELECT * FROM quotes WHERE id=$1`, [id]);
    if (!quote) return res.status(404).json({ success: false, error: 'Quote not found' });
    const updated = await queryOne(`UPDATE quotes SET status='accepted' WHERE id=$1 RETURNING *`, [id]);
    const commissionAmount = computeCommission(quote.quantity_tonnes, quote.price_per_tonne);
    await queryOne(
      `INSERT INTO commissions (contractor_id,quote_id,amount,currency) VALUES ($1,$2,$3,$4)`,
      [quote.contractor_id, id, commissionAmount, quote.currency]
    );
    eventBus.emit('quote.accepted', { quote_id: id, contractor_id: quote.contractor_id, client_id: quote.client_id });
    return res.json({ success: true, data: updated, message: 'Quote accepted — procurement notified' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/commissions', async (req: Request, res: Response) => {
  const user = req.user!;
  const isHR = user.role === 'hr_admin';
  const filter = isHR ? '' : `WHERE c.contractor_id = $1`;
  const params = isHR ? [] : [user.user_id];
  try {
    const commissions = await query(
      `SELECT c.*, q.quote_number, q.steel_grade, q.quantity_tonnes,
              e.full_name AS contractor_name, cl.company_name AS client_name
       FROM commissions c
       JOIN quotes q ON q.id=c.quote_id
       JOIN employees e ON e.id=c.contractor_id
       JOIN clients cl ON cl.id=q.client_id
       ${filter} ORDER BY c.earned_at DESC NULLS LAST`,
      params
    );
    return res.json({ success: true, data: commissions });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
