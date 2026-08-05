import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface JWTPayload {
  user_id: string;
  email: string;
  role: string;
  dept_id?: string;
  contract_type: string;
}

declare global {
  namespace Express {
    interface Request { user?: JWTPayload; }
  }
}

export function signAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '15m' });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ user_id: userId }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '7d' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer '))
    return res.status(401).json({ success: false, error: 'No token provided' });
  try {
    req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as JWTPayload;
    next();
  } catch (e: any) {
    return res.status(401).json({ success: false, error: e.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthenticated' });
    if (!roles.includes(req.user.role))
      return res.status(403).json({ success: false, error: `Required role: ${roles.join(' or ')}` });
    next();
  };
}

export function requireManager(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Unauthenticated' });
  if (!['hr_admin', 'dept_manager'].includes(req.user.role))
    return res.status(403).json({ success: false, error: 'Manager access required' });
  next();
}

export function requireHR(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Unauthenticated' });
  if (req.user.role !== 'hr_admin')
    return res.status(403).json({ success: false, error: 'HR admin required' });
  next();
}

export function deptFilter(req: Request, alias = 'e') {
  const u = req.user!;
  if (u.role === 'hr_admin') return { sql: '1=1', params: [] };
  if (u.role === 'dept_manager' && u.dept_id)
    return { sql: `${alias}.department_id = $1`, params: [u.dept_id] };
  return { sql: `${alias}.id = $1`, params: [u.user_id] };
}
