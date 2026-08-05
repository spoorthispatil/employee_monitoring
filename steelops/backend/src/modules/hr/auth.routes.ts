import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { queryOne, query } from '../../db/pool';
import { signAccessToken, signRefreshToken, requireAuth } from '../../shared/middleware/auth';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ success: false, error: 'Email and password required' });

  try {
    const employee = await queryOne<any>(
      `SELECT e.id, e.email, e.hashed_password, e.status, e.full_name,
              e.department_id, e.contract_type, r.access_level AS role
       FROM employees e LEFT JOIN roles r ON r.id = e.role_id
       WHERE e.email = $1`,
      [email.toLowerCase()]
    );
    if (!employee) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    if (employee.status !== 'active') return res.status(403).json({ success: false, error: 'Account not active' });

    const valid = await bcrypt.compare(password, employee.hashed_password);
    if (!valid) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    await query(`UPDATE employees SET last_active_at=NOW() WHERE id=$1`, [employee.id]);

    const payload = {
      user_id: employee.id, email: employee.email,
      role: employee.role || 'employee',
      dept_id: employee.department_id,
      contract_type: employee.contract_type,
    };

    return res.json({
      success: true,
      data: {
        access_token: signAccessToken(payload),
        refresh_token: signRefreshToken(employee.id),
        expires_in: 900,
        user: { id: employee.id, name: employee.full_name, email: employee.email, role: payload.role, dept_id: payload.dept_id },
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ success: false, error: 'Refresh token required' });
  try {
    const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET!) as any;
    const employee = await queryOne<any>(
      `SELECT e.id, e.email, e.status, e.department_id, e.contract_type, r.access_level AS role
       FROM employees e LEFT JOIN roles r ON r.id = e.role_id WHERE e.id = $1`,
      [decoded.user_id]
    );
    if (!employee || employee.status !== 'active')
      return res.status(401).json({ success: false, error: 'Invalid token' });
    const payload = { user_id: employee.id, email: employee.email, role: employee.role || 'employee', dept_id: employee.department_id, contract_type: employee.contract_type };
    return res.json({ success: true, data: { access_token: signAccessToken(payload), refresh_token: signRefreshToken(employee.id), expires_in: 900 } });
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
  }
});

router.post('/logout', requireAuth, (_req: Request, res: Response) => {
  return res.json({ success: true, message: 'Logged out' });
});

export default router;
