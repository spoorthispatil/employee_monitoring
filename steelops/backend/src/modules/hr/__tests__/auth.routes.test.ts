import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';

// Mock the DB layer so these tests run without a real Postgres instance.
jest.mock('../../../db/pool', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

import { queryOne, query } from '../../../db/pool';
import authRoutes from '../auth.routes';

process.env.JWT_SECRET = 'test_secret_at_least_this_long_for_signing_1234567890';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_also_long_enough_1234567890abcdef';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  return app;
}

describe('POST /api/auth/login', () => {
  it('rejects a request missing email/password', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects unknown credentials without leaking whether the email exists', async () => {
    (queryOne as jest.Mock).mockResolvedValueOnce(null);
    const app = buildApp();
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@steelops.com', password: 'x' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('rejects a login for a non-active account', async () => {
    (queryOne as jest.Mock).mockResolvedValueOnce({
      id: 'emp-1', email: 'inactive@steelops.com', status: 'inactive',
      hashed_password: 'irrelevant', full_name: 'Inactive Person',
      department_id: 'dept-1', contract_type: 'employee', role: 'employee',
    });
    const app = buildApp();
    const res = await request(app).post('/api/auth/login').send({ email: 'inactive@steelops.com', password: 'x' });
    expect(res.status).toBe(403);
  });

  it('logs in successfully with correct credentials and returns tokens', async () => {
    const hashed = await bcrypt.hash('SteelOps@2025', 4);
    (queryOne as jest.Mock).mockResolvedValueOnce({
      id: 'emp-1', email: 'admin@steelops.com', status: 'active',
      hashed_password: hashed, full_name: 'Admin User',
      department_id: 'dept-1', contract_type: 'employee', role: 'hr_admin',
    });
    (query as jest.Mock).mockResolvedValueOnce([]); // the last_active_at UPDATE

    const app = buildApp();
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@steelops.com', password: 'SteelOps@2025' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.access_token).toBeDefined();
    expect(res.body.data.refresh_token).toBeDefined();
    expect(res.body.data.user.email).toBe('admin@steelops.com');
  });

  it('rejects an incorrect password', async () => {
    const hashed = await bcrypt.hash('SteelOps@2025', 4);
    (queryOne as jest.Mock).mockResolvedValueOnce({
      id: 'emp-1', email: 'admin@steelops.com', status: 'active',
      hashed_password: hashed, full_name: 'Admin User',
      department_id: 'dept-1', contract_type: 'employee', role: 'hr_admin',
    });
    const app = buildApp();
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@steelops.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });
});
