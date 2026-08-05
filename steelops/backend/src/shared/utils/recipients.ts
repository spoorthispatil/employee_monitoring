import { query } from '../../db/pool';

// Returns the email(s) that should be notified for events in a given module —
// the department's manager(s) plus HR admin (HR admin is the fallback/CC for
// every module since they own the cross-department dashboard).
export async function getModuleRecipients(moduleKey: string): Promise<string[]> {
  const rows = await query<{ email: string }>(
    `SELECT DISTINCT e.email
     FROM employees e
     JOIN roles r ON r.id = e.role_id
     JOIN departments d ON d.id = e.department_id
     WHERE e.status = 'active'
       AND (
         (d.module_key = $1 AND r.access_level = 'dept_manager')
         OR r.access_level = 'hr_admin'
       )`,
    [moduleKey]
  );
  return rows.map(r => r.email);
}

export async function getEmployeeEmail(employeeId: string): Promise<string | null> {
  const row = await query<{ email: string }>(`SELECT email FROM employees WHERE id = $1`, [employeeId]);
  return row[0]?.email ?? null;
}
