import { query } from '../../db/pool';
import { eventBus } from '../events/bus';
import { format, startOfWeek, subWeeks } from 'date-fns';
import { computeSalesScore } from '../calculations';

export async function runWeeklyScoring(): Promise<void> {
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  console.log(`[Scoring] Running for week: ${weekStart}`);
  await scoreSales(weekStart);
  await checkConsecutivePoor(weekStart);
  console.log(`[Scoring] Week ${weekStart} complete`);
}

async function scoreSales(weekStart: string) {
  const contractors = await query(
    `SELECT e.id, e.department_id FROM employees e
     JOIN departments d ON d.id = e.department_id
     WHERE d.module_key = 'sales' AND e.status = 'active'`
  );
  for (const emp of contractors) {
    const [stats] = await query(
      `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE outcome='closed') AS closed
       FROM sales_activity_log WHERE contractor_id=$1 AND week_start=$2`,
      [emp.id, weekStart]
    );
    const total = parseInt(stats.total) || 0;
    const closed = parseInt(stats.closed) || 0;
    const { score, tier } = computeSalesScore(total, closed);
    await query(
      `INSERT INTO performance_scores (employee_id, week_start, module, raw_score, tier, kpi_breakdown)
       VALUES ($1,$2,'sales',$3,$4,$5)
       ON CONFLICT (employee_id, week_start, module)
       DO UPDATE SET raw_score=$3, tier=$4, kpi_breakdown=$5, calculated_at=NOW()`,
      [emp.id, weekStart, score, tier, JSON.stringify({ contacts: total, closed })]
    );
  }
}

async function checkConsecutivePoor(weekStart: string) {
  const prevWeek = format(subWeeks(new Date(weekStart), 1), 'yyyy-MM-dd');
  const poorThisWeek = await query(
    `SELECT ps.employee_id, ps.module, e.department_id,
            (SELECT tier FROM performance_scores
             WHERE employee_id=ps.employee_id AND week_start=$2 AND module=ps.module LIMIT 1) AS prev_tier
     FROM performance_scores ps JOIN employees e ON e.id=ps.employee_id
     WHERE ps.week_start=$1 AND ps.tier='poor'`,
    [weekStart, prevWeek]
  );
  for (const row of poorThisWeek) {
    if (row.prev_tier === 'poor') {
      eventBus.emit('performance.poor_flag', {
        employee_id: row.employee_id,
        dept_id: row.department_id,
        module: row.module,
        consecutive_weeks: 2,
      });
    }
  }
}

export async function runAWOLCheck(): Promise<void> {
  const inactive = await query(
    `SELECT e.id, e.department_id, e.last_active_at FROM employees e
     WHERE e.last_active_at < NOW() - INTERVAL '3 days'
       AND e.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM leave_requests lr
         WHERE lr.employee_id=e.id AND lr.status='approved'
           AND NOW()::DATE BETWEEN lr.start_date AND lr.end_date
       )`
  );
  for (const emp of inactive) {
    eventBus.emit('employee.inactive_3days', {
      employee_id: emp.id,
      dept_id: emp.department_id,
      last_active: emp.last_active_at,
    });
  }
  console.log(`[AWOL] ${inactive.length} inactive employees flagged`);
}

export async function runExpiryCheck(): Promise<void> {
  const expiring = await query(
    `SELECT id, doc_type, expiry_date, (expiry_date - NOW()::DATE) AS days_left
     FROM documents
     WHERE expiry_date IS NOT NULL
       AND expiry_date BETWEEN NOW()::DATE AND NOW()::DATE + 30
       AND status NOT IN ('expired')`
  );
  for (const doc of expiring) {
    eventBus.emit('document.expiring_soon', {
      document_id: doc.id,
      doc_type: doc.doc_type,
      expiry_date: doc.expiry_date,
      days_left: doc.days_left,
    });
  }
  console.log(`[Expiry] ${expiring.length} documents expiring within 30 days`);
}
