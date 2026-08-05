import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { query, queryOne } from '../../db/pool';
import { requireAuth, requireManager } from '../../shared/middleware/auth';
import { eventBus } from '../../shared/events/bus';

const router = Router();
router.use(requireAuth);

// ── File storage (local disk; swap for S3/GCS in prod by changing this block only) ──
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'documents');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safeExt = path.extname(file.originalname).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Unsupported file type'));
    }
    cb(null, true);
  },
});

// ─────────────────────────────────────────────
// DOCUMENTS
// ─────────────────────────────────────────────
router.get('/documents', async (req: Request, res: Response) => {
  const { doc_type, status, ref_type, ref_id, expiring_within_days } = req.query as Record<string, string>;
  const conditions: string[] = [];
  const params: any[] = [];
  if (doc_type) { params.push(doc_type); conditions.push(`d.doc_type = $${params.length}`); }
  if (status)   { params.push(status);   conditions.push(`d.status = $${params.length}`); }
  if (ref_type) { params.push(ref_type); conditions.push(`d.ref_type = $${params.length}`); }
  if (ref_id)   { params.push(ref_id);   conditions.push(`d.ref_id = $${params.length}`); }
  if (expiring_within_days) {
    params.push(parseInt(expiring_within_days));
    conditions.push(`d.expiry_date IS NOT NULL AND d.expiry_date <= NOW()::DATE + $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const docs = await query(
      `SELECT d.*, e.full_name AS uploaded_by_name,
              (d.expiry_date - NOW()::DATE) AS days_until_expiry
       FROM documents d
       LEFT JOIN employees e ON e.id = d.uploaded_by
       ${where}
       ORDER BY d.created_at DESC`,
      params
    );
    return res.json({ success: true, data: docs });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/documents/:id', async (req: Request, res: Response) => {
  try {
    const doc = await queryOne(
      `SELECT d.*, e.full_name AS uploaded_by_name,
              (d.expiry_date - NOW()::DATE) AS days_until_expiry
       FROM documents d LEFT JOIN employees e ON e.id = d.uploaded_by
       WHERE d.id = $1`,
      [req.params.id]
    );
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });
    return res.json({ success: true, data: doc });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Create a document record. Accepts an optional file in the same request
// (multipart field name "file"); falls back to a plain JSON body with no file.
router.post('/documents', upload.single('file'), async (req: Request, res: Response) => {
  const { doc_type, ref_id, ref_type, title, expiry_date, issued_date, issuing_authority } = req.body;
  if (!doc_type || !ref_id || !ref_type || !title)
    return res.status(400).json({ success: false, error: 'Required: doc_type, ref_id, ref_type, title' });
  const file_url = req.file ? `/uploads/documents/${req.file.filename}` : '';
  try {
    const doc = await queryOne(
      `INSERT INTO documents (doc_type, ref_id, ref_type, title, file_url, uploaded_by, status, expiry_date, issued_date, issuing_authority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [doc_type, ref_id, ref_type, title, file_url, req.user!.user_id,
       req.file ? 'submitted' : 'draft', expiry_date || null, issued_date || null, issuing_authority || null]
    );
    return res.status(201).json({ success: true, data: doc });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Attach/replace a file on an existing document
router.post('/documents/:id/upload', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file provided (field name must be "file")' });
  try {
    const file_url = `/uploads/documents/${req.file.filename}`;
    const updated = await queryOne(
      `UPDATE documents SET file_url = $1, status = 'submitted' WHERE id = $2 RETURNING *`,
      [file_url, req.params.id]
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Document not found' });
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/documents/:id', requireManager, async (req: Request, res: Response) => {
  const { status, expiry_date, issued_date, issuing_authority, title } = req.body;
  try {
    const updated = await queryOne(
      `UPDATE documents SET
         status = COALESCE($1, status),
         expiry_date = COALESCE($2, expiry_date),
         issued_date = COALESCE($3, issued_date),
         issuing_authority = COALESCE($4, issuing_authority),
         title = COALESCE($5, title)
       WHERE id = $6 RETURNING *`,
      [status || null, expiry_date || null, issued_date || null, issuing_authority || null, title || null, req.params.id]
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Document not found' });
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// SGS INSPECTIONS
// ─────────────────────────────────────────────
router.get('/sgs-inspections', async (req: Request, res: Response) => {
  const { batch_id, result } = req.query as Record<string, string>;
  const conditions: string[] = [];
  const params: any[] = [];
  if (batch_id) { params.push(batch_id); conditions.push(`si.batch_id = $${params.length}`); }
  if (result)   { params.push(result);   conditions.push(`si.result = $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const rows = await query(
      `SELECT si.*, b.batch_code, m.name AS mill_name
       FROM sgs_inspections si
       JOIN batches b ON b.id = si.batch_id
       JOIN mills m ON m.id = b.mill_id
       ${where}
       ORDER BY si.inspection_date DESC`,
      params
    );
    return res.json({ success: true, data: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/sgs-inspections', requireManager, async (req: Request, res: Response) => {
  const { batch_id, shipment_id, inspector_name, inspection_date, result, failure_notes, re_inspection_required, re_inspection_date } = req.body;
  if (!batch_id || !inspection_date || !result)
    return res.status(400).json({ success: false, error: 'Required: batch_id, inspection_date, result' });
  try {
    const inspection = await queryOne<any>(
      `INSERT INTO sgs_inspections
         (batch_id, shipment_id, inspector_name, inspection_date, result, failure_notes, re_inspection_required, re_inspection_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [batch_id, shipment_id || null, inspector_name || null, inspection_date, result,
       failure_notes || null, !!re_inspection_required, re_inspection_date || null]
    );
    await query(`UPDATE batches SET sgs_inspection_id = $1, sgs_status = $2 WHERE id = $3`,
      [inspection!.id, result, batch_id]);

    // This is the event the rest of the system already listens for, but nothing
    // used to emit it — wiring it here is what actually drives sgs.status on the
    // batch and (on failure) flips the batch into 'sgs_failed'.
    eventBus.emit('sgs.result', {
      batch_id, inspection_id: inspection!.id, result, shipment_id: shipment_id || null,
    });

    return res.status(201).json({ success: true, data: inspection });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// EXPIRY CALENDAR
// ─────────────────────────────────────────────
router.get('/expiry-calendar', async (req: Request, res: Response) => {
  const { within_days = '30' } = req.query as Record<string, string>;
  try {
    const expiring = await query(
      `SELECT id, doc_type, title, ref_type, ref_id, expiry_date, issuing_authority,
              (expiry_date - NOW()::DATE) AS days_until_expiry
       FROM documents
       WHERE expiry_date IS NOT NULL AND status != 'expired'
         AND expiry_date <= NOW()::DATE + $1::INTEGER
       ORDER BY expiry_date ASC`,
      [parseInt(within_days)]
    );
    const expired = await query(
      `SELECT id, doc_type, title, ref_type, ref_id, expiry_date, issuing_authority,
              (expiry_date - NOW()::DATE) AS days_until_expiry
       FROM documents
       WHERE expiry_date IS NOT NULL AND expiry_date < NOW()::DATE AND status != 'expired'
       ORDER BY expiry_date ASC`
    );
    return res.json({ success: true, data: { expiring, expired } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
