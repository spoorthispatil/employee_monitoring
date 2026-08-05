import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../../../db/pool', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

process.env.JWT_SECRET = 'test_secret_at_least_this_long_for_signing_1234567890';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_also_long_enough_1234567890abcdef';

import { query } from '../../../db/pool';
import salesRoutes from '../sales.routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/sales', salesRoutes);
  return app;
}

function tokenFor(user: Partial<{ user_id: string; role: string }>) {
  return jwt.sign(
    { user_id: user.user_id ?? 'contractor-1', email: 'c@steelops.com', role: user.role ?? 'contractor', contract_type: 'contractor' },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' }
  );
}

describe('GET /api/sales/commissions', () => {
  it('rejects requests with no auth token', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/sales/commissions');
    expect(res.status).toBe(401);
  });

  it('scopes a contractor to their own commissions using a parameterized query (not string-interpolated SQL)', async () => {
    (query as jest.Mock).mockResolvedValueOnce([]);
    const app = buildApp();
    const maliciousUserId = "contractor-1' OR '1'='1"; // would leak everyone's commissions if interpolated
    const token = tokenFor({ user_id: maliciousUserId, role: 'contractor' });

    const res = await request(app).get('/api/sales/commissions').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const [sql, params] = (query as jest.Mock).mock.calls[0];
    // The filter must be a placeholder, never the raw value spliced into the SQL text.
    expect(sql).toContain('WHERE c.contractor_id = $1');
    expect(sql).not.toContain(maliciousUserId);
    expect(params).toEqual([maliciousUserId]);
  });

  it('does not filter by contractor for hr_admin', async () => {
    (query as jest.Mock).mockResolvedValueOnce([]);
    const app = buildApp();
    const token = tokenFor({ role: 'hr_admin' });

    const res = await request(app).get('/api/sales/commissions').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const [sql, params] = (query as jest.Mock).mock.calls[0];
    expect(sql).not.toContain('WHERE c.contractor_id');
    expect(params).toEqual([]);
  });
});
