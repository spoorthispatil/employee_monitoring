import 'dotenv/config';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

// ── When running seed OUTSIDE Docker, connect to localhost:5432
// ── When running INSIDE Docker, the hostname is 'postgres'
// ── We default to localhost so npm run db:seed works from your terminal

const connectionString = process.env.DATABASE_URL ||
  'postgresql://steelops:steelops_dev_password@localhost:5432/steelops_db';

const pool = new Pool({ connectionString });

async function q(text: string, params: any[] = []) {
  return (await pool.query(text, params)).rows;
}

const DEPARTMENTS = [
  { name:'HR',            module_key:'hr'            },
  { name:'Sales',         module_key:'sales'         },
  { name:'Logistics',     module_key:'logistics'     },
  { name:'Manufacturing', module_key:'manufacturing' },
  { name:'Procurement',   module_key:'procurement'   },
  { name:'Finance',       module_key:'finance'       },
  { name:'Paperwork',     module_key:'paperwork'     },
];

const ROLES = [
  { name:'HR Administrator',      dept:'hr',            level:'hr_admin'     },
  { name:'Sales Manager',         dept:'sales',         level:'dept_manager' },
  { name:'Sales Contractor',      dept:'sales',         level:'contractor'   },
  { name:'Logistics Manager',     dept:'logistics',     level:'dept_manager' },
  { name:'Logistics Crew',        dept:'logistics',     level:'employee'     },
  { name:'Manufacturing Manager', dept:'manufacturing', level:'dept_manager' },
  { name:'Business Partner',      dept:'manufacturing', level:'dept_manager' },
  { name:'Sourcing Agent',        dept:'manufacturing', level:'agent'        },
  { name:'Procurement Manager',   dept:'procurement',   level:'dept_manager' },
  { name:'Procurement Officer',   dept:'procurement',   level:'employee'     },
  { name:'Finance Manager',       dept:'finance',       level:'dept_manager' },
  { name:'Accountant India',      dept:'finance',       level:'employee'     },
  { name:'Accountant Canada',     dept:'finance',       level:'employee'     },
  { name:'Paperwork Manager',     dept:'paperwork',     level:'dept_manager' },
  { name:'Compliance Officer',    dept:'paperwork',     level:'employee'     },
];

const USERS = [
  { name:'Admin User',     email:'admin@steelops.com',        pw:'SteelOps@2025', role:'HR Administrator',      dept:'hr',            type:'employee',   loc:'india',  joined:'2024-01-01' },
  { name:'James Wilson',   email:'j.wilson@contractor.com',   pw:'SteelOps@2025', role:'Sales Contractor',      dept:'sales',         type:'contractor', loc:'canada', joined:'2024-02-01', end:'2026-01-31' },
  { name:'Sarah Mitchell', email:'s.mitchell@contractor.com', pw:'SteelOps@2025', role:'Sales Contractor',      dept:'sales',         type:'contractor', loc:'canada', joined:'2024-03-15', end:'2026-03-14' },
  { name:'Omar Hassan',    email:'o.hassan@steelops.com',     pw:'SteelOps@2025', role:'Logistics Manager',     dept:'logistics',     type:'employee',   loc:'india',  joined:'2024-01-15' },
  { name:'Ravi Kumar',     email:'r.kumar@steelops.com',      pw:'SteelOps@2025', role:'Logistics Crew',        dept:'logistics',     type:'employee',   loc:'field',  joined:'2024-04-01' },
  { name:'Vikram Mehta',   email:'v.mehta@steelops.com',      pw:'SteelOps@2025', role:'Business Partner',      dept:'manufacturing', type:'employee',   loc:'india',  joined:'2024-01-10' },
  { name:'Rajesh Kumar',   email:'rajesh.k@agent.com',        pw:'SteelOps@2025', role:'Sourcing Agent',        dept:'manufacturing', type:'agent',      loc:'field',  joined:'2024-02-15' },
  { name:'Deepak Rao',     email:'deepak.r@agent.com',        pw:'SteelOps@2025', role:'Sourcing Agent',        dept:'manufacturing', type:'agent',      loc:'field',  joined:'2024-02-20' },
  { name:'Anita Mehta',    email:'a.mehta@steelops.com',      pw:'SteelOps@2025', role:'Procurement Officer',   dept:'procurement',   type:'employee',   loc:'india',  joined:'2024-03-01' },
  { name:'Ramesh Nair',    email:'r.nair@steelops.com',       pw:'SteelOps@2025', role:'Procurement Officer',   dept:'procurement',   type:'employee',   loc:'india',  joined:'2024-04-10' },
  { name:'Meera Iyer',     email:'m.iyer@steelops.com',       pw:'SteelOps@2025', role:'Accountant India',      dept:'finance',       type:'employee',   loc:'india',  joined:'2024-01-20' },
  { name:'David Chen',     email:'d.chen@steelops.com',       pw:'SteelOps@2025', role:'Accountant Canada',     dept:'finance',       type:'employee',   loc:'canada', joined:'2024-02-01' },
  { name:'Priya Krishnan', email:'p.krishnan@steelops.com',   pw:'SteelOps@2025', role:'Compliance Officer',    dept:'paperwork',     type:'employee',   loc:'india',  joined:'2024-05-01' },
];

const MILLS = [
  { name:'Tata Steel Jamshedpur', city:'Jamshedpur',     state:'Jharkhand',      grades:['HR Coil IS2062','CR Sheet IS513','MS Plate IS2062'], batch:300, lead:7,  score:96, flag:false },
  { name:'JSW Steel Vijayanagar', city:'Bellary',        state:'Karnataka',      grades:['TMT Bar Fe500','HR Coil IS2062'],                    batch:250, lead:8,  score:91, flag:false },
  { name:'SAIL Bhilai',           city:'Bhilai',         state:'Chhattisgarh',   grades:['MS Plate IS2062','Rails IS3443'],                    batch:400, lead:10, score:74, flag:false },
  { name:'Vizag Steel',           city:'Visakhapatnam',  state:'Andhra Pradesh', grades:['CR Sheet IS513','Sections IS2062'],                  batch:200, lead:9,  score:88, flag:false },
  { name:'Shyam Metalics',        city:'Howrah',         state:'West Bengal',    grades:['TMT Bar Fe415'],                                     batch:120, lead:12, score:58, flag:true, reason:'Failed 3 SGS inspections Q1 2025' },
];

const CLIENTS = [
  'Pacific Steel Corp','Atlantic Metals Inc','Toronto Steel Ltd',
  'Vancouver Metals Co','Halifax Iron Works','Montreal Steel Group',
];

async function main() {
  console.log('\n  SteelOps — Database Seeder');
  console.log(`  Connecting to: ${connectionString.replace(/:[^:@]+@/, ':***@')}\n`);

  // Test connection
  try {
    await pool.query('SELECT 1');
    console.log('  ✓ Connected to PostgreSQL');
  } catch (err: any) {
    console.error(`\n  ✗ Cannot connect to database.\n`);
    console.error(`  Make sure Docker is running: docker-compose up --build`);
    console.error(`  Then wait 30 seconds and run this again.\n`);
    console.error(`  Error: ${err.message}\n`);
    process.exit(1);
  }

  // Check schema exists
  try {
    await pool.query('SELECT id FROM departments LIMIT 1');
    console.log('  ✓ Schema found\n');
  } catch {
    console.error('\n  ✗ Schema not found. Docker should auto-run schema.sql.');
    console.error('  If not, run manually:');
    console.error('  docker exec -i steelops_db psql -U steelops -d steelops_db < src/db/schema.sql\n');
    process.exit(1);
  }

  // Departments
  const deptIds: Record<string, string> = {};
  for (const d of DEPARTMENTS) {
    const rows = await q(`SELECT id FROM departments WHERE name=$1`, [d.name]);
    if (rows.length) { deptIds[d.module_key] = rows[0].id; continue; }
    const [r] = await q(
      `INSERT INTO departments(name,module_key) VALUES($1,$2) RETURNING id`,
      [d.name, d.module_key]
    );
    deptIds[d.module_key] = r.id;
    console.log(`  + dept: ${d.name}`);
  }
  console.log(`  ✓ ${DEPARTMENTS.length} departments ready`);

  // Roles
  const roleIds: Record<string, string> = {};
  for (const r of ROLES) {
    const rows = await q(`SELECT id FROM roles WHERE name=$1`, [r.name]);
    if (rows.length) { roleIds[r.name] = rows[0].id; continue; }
    const dId = deptIds[r.dept];
    const [row] = await q(
      `INSERT INTO roles(name,department_id,access_level) VALUES($1,$2,$3) RETURNING id`,
      [r.name, dId, r.level]
    );
    roleIds[r.name] = row.id;
    console.log(`  + role: ${r.name} [${r.level}]`);
  }
  console.log(`  ✓ ${ROLES.length} roles ready`);

  // Employees
  const empIds: Record<string, string> = {};
  let counter = 1;
  for (const u of USERS) {
    const rows = await q(`SELECT id FROM employees WHERE email=$1`, [u.email]);
    if (rows.length) { empIds[u.email] = rows[0].id; continue; }
    const hashed = await bcrypt.hash(u.pw, 12);
    const prefix = u.type === 'agent' ? 'AGT' : u.type === 'contractor' ? 'CTR' : 'EMP';
    const code   = `${prefix}-${String(counter++).padStart(4,'0')}`;
    const dId    = deptIds[u.dept];
    const rId    = roleIds[u.role];
    const [row]  = await q(
      `INSERT INTO employees(employee_code,full_name,email,role_id,department_id,contract_type,location,join_date,contract_end_date,hashed_password,last_active_at,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),'active') RETURNING id`,
      [code, u.name, u.email, rId, dId, u.type, u.loc, u.joined, (u as any).end || null, hashed]
    );
    empIds[u.email] = row.id;
    if (u.type === 'agent') {
      await q(
        `INSERT INTO sourcing_agents(id,region) VALUES($1,'Field') ON CONFLICT(id) DO NOTHING`,
        [row.id]
      );
    }
    console.log(`  + ${u.type}: ${u.name} <${u.email}>`);
  }
  console.log(`  ✓ ${USERS.length} users ready`);

  // Mills
  for (const m of MILLS) {
    const rows = await q(`SELECT id FROM mills WHERE name=$1`, [m.name]);
    if (rows.length) continue;
    await q(
      `INSERT INTO mills(name,city,state,steel_grades,typical_batch_tonnes,lead_time_days,quality_score,is_flagged,flag_reason)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [m.name, m.city, m.state, m.grades, m.batch, m.lead, m.score, m.flag, (m as any).reason || null]
    );
    console.log(`  + mill: ${m.name}`);
  }
  console.log(`  ✓ ${MILLS.length} mills ready`);

  // Clients
  const contractorId = empIds['j.wilson@contractor.com'];
  if (contractorId) {
    for (const name of CLIENTS) {
      const rows = await q(`SELECT id FROM clients WHERE company_name=$1`, [name]);
      if (rows.length) continue;
      await q(
        `INSERT INTO clients(company_name,country,assigned_to,status) VALUES($1,'canada',$2,'prospect')`,
        [name, contractorId]
      );
      console.log(`  + client: ${name}`);
    }
    console.log(`  ✓ ${CLIENTS.length} demo clients ready`);
  }

  // Print credentials
  console.log('\n  ══════════════════════════════════════════════');
  console.log('  ✅ Seed complete! Login credentials:');
  console.log('  ══════════════════════════════════════════════');
  const logins = [
    ['HR Admin (full access)',  'admin@steelops.com'],
    ['Sales contractor',        'j.wilson@contractor.com'],
    ['Sales contractor',        's.mitchell@contractor.com'],
    ['Logistics manager',       'o.hassan@steelops.com'],
    ['Business partner',        'v.mehta@steelops.com'],
    ['Sourcing agent',          'rajesh.k@agent.com'],
    ['Procurement officer',     'a.mehta@steelops.com'],
    ['Accountant India',        'm.iyer@steelops.com'],
    ['Accountant Canada',       'd.chen@steelops.com'],
    ['Compliance officer',      'p.krishnan@steelops.com'],
  ];
  for (const [role, email] of logins) {
    console.log(`  ${role.padEnd(26)} ${email}  (SteelOps@2025)`);
  }
  console.log('\n  Open: http://localhost:3000\n');

  await pool.end();
}

main().catch(e => { console.error('\n  Error:', e.message); process.exit(1); });
