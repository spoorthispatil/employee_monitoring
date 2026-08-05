import { Router, Request, Response } from 'express';
import { query, queryOne } from '../../db/pool';
import { requireAuth, requireHR, requireManager, deptFilter } from '../../shared/middleware/auth';
import bcrypt from 'bcryptjs';

const router = Router();
router.use(requireAuth);

router.get('/dashboard', requireHR, async (_req: Request, res: Response) => {
  try {
    const dashboard = await queryOne(`SELECT * FROM vw_hr_dashboard`);
    const recentPoor = await query(
      `SELECT e.full_name, e.id, d.name AS dept, ps.module, ps.raw_score
       FROM performance_scores ps
       JOIN employees e ON e.id = ps.employee_id
       JOIN departments d ON d.id = e.department_id
       WHERE ps.week_start = date_trunc('week', NOW())::DATE AND ps.tier = 'poor'
       ORDER BY ps.raw_score ASC LIMIT 10`
    );
    return res.json({ success: true, data: { ...dashboard, recent_poor: recentPoor } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/employees', requireManager, async (req: Request, res: Response) => {
  const { dept_id, status, page = '1', limit = '50' } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const filter = deptFilter(req);
  const conditions: string[] = [filter.sql];
  const params: any[] = [...filter.params];
  if (dept_id) { params.push(dept_id); conditions.push(`e.department_id = $${params.length}`); }
  if (status)  { params.push(status);  conditions.push(`e.status = $${params.length}`); }
  params.push(parseInt(limit), offset);
  try {
    const rows = await query(
      `SELECT e.id, e.employee_code, e.full_name, e.email, e.phone,
              e.contract_type, e.location, e.status, e.join_date,
              e.last_active_at, e.contract_end_date,
              d.name AS department_name, r.name AS role_name, m.full_name AS manager_name,
              (SELECT tier FROM performance_scores ps WHERE ps.employee_id=e.id
               AND ps.week_start=date_trunc('week',NOW())::DATE ORDER BY raw_score ASC LIMIT 1) AS current_tier
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN roles r ON r.id = e.role_id
       LEFT JOIN employees m ON m.id = e.manager_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY e.full_name
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const [{ count }] = await query(
      `SELECT COUNT(*) FROM employees e WHERE ${conditions.join(' AND ')}`,
      filter.params
    );
    return res.json({ success: true, data: rows, total: parseInt(count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/employees', requireHR, async (req: Request, res: Response) => {
  const { full_name, email, password, role_id, department_id, manager_id, contract_type, location, join_date, contract_end_date } = req.body;
  if (!full_name || !email || !password || !join_date)
    return res.status(400).json({ success: false, error: 'Required: full_name, email, password, join_date' });
  try {
    const hashed = await bcrypt.hash(password, 12);
    const [{ max_code }] = await query(`SELECT MAX(SUBSTRING(employee_code FROM 5)::INTEGER) AS max_code FROM employees WHERE employee_code LIKE 'EMP-%'`);
    const nextNum = (parseInt(max_code) || 0) + 1;
    const employee_code = `EMP-${String(nextNum).padStart(4, '0')}`;
    const employee = await queryOne(
      `INSERT INTO employees (employee_code, full_name, email, role_id, department_id, manager_id, contract_type, location, join_date, contract_end_date, hashed_password)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, employee_code, full_name, email, contract_type, status`,
      [employee_code, full_name, email.toLowerCase(), role_id, department_id, manager_id, contract_type || 'employee', location || 'india', join_date, contract_end_date || null, hashed]
    );
    return res.status(201).json({ success: true, data: employee });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/employees/:id', async (req: Request, res: Response) => {
  const user = req.user!;
  if (['contractor','employee'].includes(user.role) && user.user_id !== req.params.id)
    return res.status(403).json({ success: false, error: 'Access denied' });
  try {
    const employee = await queryOne(
      `SELECT e.*, d.name AS department_name, r.name AS role_name, m.full_name AS manager_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN roles r ON r.id = e.role_id
       LEFT JOIN employees m ON m.id = e.manager_id
       WHERE e.id = $1`,
      [req.params.id]
    );
    if (!employee) return res.status(404).json({ success: false, error: 'Not found' });
    return res.json({ success: true, data: employee });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/employees/:id/performance', async (req: Request, res: Response) => {
  const { weeks = '8' } = req.query as { weeks?: string };
  try {
    const scores = await query(
      `SELECT ps.*, e.full_name, d.name AS dept_name
       FROM performance_scores ps
       JOIN employees e ON e.id = ps.employee_id
       JOIN departments d ON d.id = e.department_id
       WHERE ps.employee_id = $1 ORDER BY ps.week_start DESC LIMIT $2`,
      [req.params.id, parseInt(weeks) * 6]
    );
    return res.json({ success: true, data: scores });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/warnings', requireManager, async (req: Request, res: Response) => {
  const { employee_id, level, reason, evidence_url } = req.body;
  if (!employee_id || !level || !reason)
    return res.status(400).json({ success: false, error: 'Required: employee_id, level, reason' });
  try {
    const warning = await queryOne(
      `INSERT INTO warnings (employee_id, issued_by, level, reason, evidence_url)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [employee_id, req.user!.user_id, level, reason, evidence_url || null]
    );
    return res.status(201).json({ success: true, data: warning });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/warnings', async (req: Request, res: Response) => {
  const { employee_id } = req.query as Record<string, string>;
  if (!employee_id) return res.status(400).json({ success: false, error: 'employee_id required' });
  try {
    const warnings = await query(
      `SELECT w.*, i.full_name AS issued_by_name
       FROM warnings w
       JOIN employees i ON i.id = w.issued_by
       WHERE w.employee_id = $1
       ORDER BY w.issued_at DESC`,
      [employee_id]
    );
    return res.json({ success: true, data: warnings });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/tasks', async (req: Request, res: Response) => {
  const { title, detail, module, ref_id, ref_type, due_date } = req.body;
  if (!title || !module)
    return res.status(400).json({ success: false, error: 'Required: title, module' });
  try {
    const task = await queryOne(
      `INSERT INTO task_logs (employee_id, module, title, detail, ref_id, ref_type, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user!.user_id, module, title, detail || null, ref_id || null, ref_type || null, due_date || null]
    );
    await query(`UPDATE employees SET last_active_at=NOW() WHERE id=$1`, [req.user!.user_id]);
    return res.status(201).json({ success: true, data: task });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/tasks', async (req: Request, res: Response) => {
  const { status, module, employee_id } = req.query as Record<string, string>;
  const user = req.user!;
  const conditions: string[] = [];
  const params: any[] = [];
  if (user.role === 'hr_admin') {
    if (employee_id) { params.push(employee_id); conditions.push(`tl.employee_id=$${params.length}`); }
  } else if (user.role === 'dept_manager') {
    params.push(user.dept_id);
    conditions.push(`e.department_id=$${params.length}`);
  } else {
    params.push(user.user_id);
    conditions.push(`tl.employee_id=$${params.length}`);
  }
  if (status) { params.push(status); conditions.push(`tl.status=$${params.length}`); }
  if (module) { params.push(module); conditions.push(`tl.module=$${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const tasks = await query(
      `SELECT tl.*, e.full_name AS employee_name FROM task_logs tl
       JOIN employees e ON e.id=tl.employee_id
       ${where} ORDER BY tl.logged_at DESC LIMIT 100`,
      params
    );
    return res.json({ success: true, data: tasks });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/tasks/:id', async (req: Request, res: Response) => {
  const { status, detail } = req.body;
  try {
    const updated = await queryOne(
      `UPDATE task_logs SET
         status=COALESCE($1,status), detail=COALESCE($2,detail),
         completed_at=CASE WHEN $1='done' THEN NOW() ELSE completed_at END
       WHERE id=$3 RETURNING *`,
      [status || null, detail || null, req.params.id]
    );
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/attendance/checkin', async (req: Request, res: Response) => {
  const today = new Date().toISOString().split('T')[0];
  try {
    const existing = await queryOne(`SELECT id FROM attendance WHERE employee_id=$1 AND date=$2`, [req.user!.user_id, today]);
    if (existing) return res.status(400).json({ success: false, error: 'Already checked in today' });
    const record = await queryOne(
      `INSERT INTO attendance (employee_id, date, check_in, status) VALUES ($1,$2,NOW(),'present') RETURNING *`,
      [req.user!.user_id, today]
    );
    await query(`UPDATE employees SET last_active_at=NOW() WHERE id=$1`, [req.user!.user_id]);
    return res.status(201).json({ success: true, data: record });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/attendance/checkout', async (req: Request, res: Response) => {
  const today = new Date().toISOString().split('T')[0];
  try {
    const updated = await queryOne(
      `UPDATE attendance SET check_out=NOW() WHERE employee_id=$1 AND date=$2 AND check_out IS NULL RETURNING *`,
      [req.user!.user_id, today]
    );
    if (!updated) return res.status(400).json({ success: false, error: 'No active check-in found' });
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/leave', async (req: Request, res: Response) => {
  const { leave_type, start_date, end_date, reason } = req.body;
  try {
    const request = await queryOne(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, reason) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user!.user_id, leave_type, start_date, end_date, reason || null]
    );
    return res.status(201).json({ success: true, data: request });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/leave/:id/approve', requireManager, async (req: Request, res: Response) => {
  const { status } = req.body;
  try {
    const updated = await queryOne(
      `UPDATE leave_requests SET status=$1, approved_by=$2 WHERE id=$3 RETURNING *`,
      [status, req.user!.user_id, req.params.id]
    );
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/reports/weekly', requireHR, async (req: Request, res: Response) => {
  const ws = (req.query.week_start as string) || new Date().toISOString().split('T')[0];
  try {
    const [summary, topPerformers, poorPerformers] = await Promise.all([
      queryOne(`SELECT * FROM vw_hr_dashboard`),
      query(
        `SELECT e.full_name, d.name AS dept, ps.module, ps.raw_score, ps.rank_in_dept
         FROM performance_scores ps
         JOIN employees e ON e.id=ps.employee_id
         JOIN departments d ON d.id=e.department_id
         WHERE ps.week_start=$1 AND ps.tier='top' ORDER BY ps.raw_score DESC LIMIT 10`,
        [ws]
      ),
      query(
        `SELECT e.full_name, d.name AS dept, ps.module, ps.raw_score
         FROM performance_scores ps
         JOIN employees e ON e.id=ps.employee_id
         JOIN departments d ON d.id=e.department_id
         WHERE ps.week_start=$1 AND ps.tier='poor' ORDER BY ps.raw_score ASC LIMIT 10`,
        [ws]
      ),
    ]);
    return res.json({ success: true, data: { week_start: ws, summary, top_performers: topPerformers, poor_performers: poorPerformers } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
