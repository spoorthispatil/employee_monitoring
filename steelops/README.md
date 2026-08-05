# SteelOps — HR & Operations Platform

Full-stack platform for a steel imports company managing HR, Sales, Logistics,
Manufacturing, Procurement, Paperwork and Finance.

## Stack
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL 15
- **Frontend:** Next.js 14 + React + Tailwind CSS
- **Auth:** JWT (access 15m + refresh 7d)
- **Jobs:** node-cron (weekly scoring, AWOL check, expiry check)

## Quick start

```bash
# 1. Open Docker Desktop and wait for the whale icon to stop animating
# 2. cd into the steelops folder (where docker-compose.yml is)
cd steelops

# 3. Start everything
docker-compose up --build

# 4. In a second terminal — seed the database (first time only)
cd backend
npm install
npm run db:seed

# 5. Open the app
open http://localhost:3000
```

## Login credentials (all password: SteelOps@2025)

| Role                | Email                        |
|---------------------|------------------------------|
| HR Admin (full)     | admin@steelops.com           |
| Sales contractor    | j.wilson@contractor.com      |
| Logistics manager   | o.hassan@steelops.com        |
| Sourcing agent      | rajesh.k@agent.com           |
| Procurement officer | a.mehta@steelops.com         |
| Accountant India    | m.iyer@steelops.com          |
| Accountant Canada   | d.chen@steelops.com          |
| Compliance officer  | p.krishnan@steelops.com      |

## Starting again next time

```bash
# Docker Desktop must be open first, then:
docker-compose up

# No --build and no seed needed after the first time
```

## Project structure

```
steelops/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile.dev
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example          ← copy to .env and fill in secrets
│   └── src/
│       ├── index.ts          ← Express app entry
│       ├── db/
│       │   ├── schema.sql    ← full PostgreSQL schema
│       │   ├── pool.ts       ← connection pool
│       │   └── seed.ts       ← run once to create demo data
│       ├── modules/
│       │   ├── hr/           ← auth + HR routes
│       │   ├── sales/        ← sales routes
│       │   └── shared.routes.ts ← logistics, finance, procurement, manufacturing
│       └── shared/
│           ├── middleware/auth.ts
│           ├── events/bus.ts
│           ├── jobs/scoring.ts
│           └── utils/alerts.ts
└── frontend/
    ├── Dockerfile.dev
    ├── package.json
    └── src/
        ├── pages/            ← 9 pages: login, dashboard, hr, sales,
        │                        logistics, finance, manufacturing,
        │                        procurement, paperwork
        ├── components/shared ← layout, KPI cards, modals, badges
        ├── hooks/useAuth.tsx
        ├── lib/api.ts
        └── styles/globals.css
```
