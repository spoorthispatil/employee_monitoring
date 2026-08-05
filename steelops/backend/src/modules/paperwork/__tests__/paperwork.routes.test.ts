import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../../../db/pool', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

process.env.JWT_SECRET = 'test_secret_at_least_this_long_for_signing_1234567890';

import { query, queryOne } from '../../../db/pool';
import { eventBus } from '../../../shared/events/bus';
import paperworkRoutes from '../paperwork.routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/paperwork', paperworkRoutes);
  return app;
}

function authHeader(role = 'dept_manager') {
  const token = jwt.sign({ user_id: 'u1', email: 'u1@steelops.com', role, contract_type: 'employee' }, process.env.JWT_SECRET!, { expiresIn: '15m' });
  return `Bearer ${token}`;
}

describe('POST /api/paperwork/documents', () => {
  it('rejects a document with missing required fields', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/paperwork/documents')
      .set('Authorization', authHeader())
      .send({ title: 'Only a title' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('creates a document with no file attached (draft status)', async () => {
    (queryOne as jest.Mock).mockResolvedValueOnce({ id: 'doc-1', status: 'draft' });
    const app = buildApp();
    const res = await request(app)
      .post('/api/paperwork/documents')
      .set('Authorization', authHeader())
      .send({ doc_type: 'certificate_of_origin', ref_id: 'shp-1', ref_type: 'shipment', title: 'CoO — SHP-2025-0001' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft');
  });
});

describe('POST /api/paperwork/sgs-inspections', () => {
  it('requires manager access', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/paperwork/sgs-inspections')
      .set('Authorization', authHeader('contractor'))
      .send({ batch_id: 'b1', inspection_date: '2026-01-01', result: 'pass' });
    expect(res.status).toBe(403);
  });

  it('emits sgs.result on the event bus so downstream handlers fire (previously this never happened)', async () => {
    (queryOne as jest.Mock).mockResolvedValueOnce({ id: 'insp-1', batch_id: 'b1', result: 'fail' });
    (query as jest.Mock).mockResolvedValueOnce([]); // the batches UPDATE

    const emitSpy = jest.spyOn(eventBus, 'emit');
    const app = buildApp();
    const res = await request(app)
      .post('/api/paperwork/sgs-inspections')
      .set('Authorization', authHeader('dept_manager'))
      .send({ batch_id: 'b1', inspection_date: '2026-01-01', result: 'fail', failure_notes: 'Chemical composition out of spec' });

    expect(res.status).toBe(201);
    expect(emitSpy).toHaveBeenCalledWith('sgs.result', expect.objectContaining({ batch_id: 'b1', result: 'fail' }));
    emitSpy.mockRestore();
  });
});
