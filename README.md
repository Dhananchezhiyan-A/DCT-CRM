# DCT-CRM

Enterprise Multi-Tenant CRM with dynamic object management, role-based access control, and permission-based authorization.

## Tech Stack

- **Frontend:** Next.js 14 (App Router), shadcn/ui, TypeScript
- **Backend:** Express.js, TypeScript
- **Database:** PostgreSQL, Prisma ORM
- **Auth:** JWT (HTTP-only cookies)

## Features

- Multi-tenant architecture with Super Admin
- Dynamic Object Manager (create custom objects/fields at runtime)
- Role-based access control (RBAC) with profiles, permission sets, and direct permissions
- 100 granular permissions across 20 modules
- Standard Lead fields (27 fields with picklists)
- Dynamic forms, tables, and detail views
- CRM workflow engine with status transitions
- Audit logging and activity tracking

## Getting Started

```bash
# Install dependencies
npm install

# Set up database
cd packages/db
npx prisma db push
npx ts-node src/seed-super-admin.ts
npx ts-node src/seed.ts
npx ts-node src/seed-lead-fields.ts

# Start API server
cd apps/api
npm run dev

# Start Web server
cd apps/web
npm run dev
```

## Login Credentials

| Email                   | Password    | Role        |
| ----------------------- | ----------- | ----------- |
| superadmin@dctcrm.com   | password123 | Super Admin |
| admin@dctcrm.com        | password123 | Admin       |
| salesmanager@dctcrm.com | password123 | Manager     |
| priya@dctcrm.com        | password123 | Sales       |
| amit@dctcrm.com         | password123 | Sales       |
| neha@dctcrm.com         | password123 | Presales    |
| finance@dctcrm.com      | password123 | Finance     |

## Test Users

The profile seed command creates or reuses these local test users in the
`dct-re` tenant. The password is hashed in the database and is intended only
for local testing.

| Profile | Username | Password |
|---|---|---|
| Admin | admin.test1@dctcrm.com | DctTest@123 |
| Admin | admin.test2@dctcrm.com | DctTest@123 |
| Admin | admin.test3@dctcrm.com | DctTest@123 |
| Presales | presales.test1@dctcrm.com | DctTest@123 |
| Presales | presales.test2@dctcrm.com | DctTest@123 |
| Presales | presales.test3@dctcrm.com | DctTest@123 |
| SVC | svc.test1@dctcrm.com | DctTest@123 |
| SVC | svc.test2@dctcrm.com | DctTest@123 |
| SVC | svc.test3@dctcrm.com | DctTest@123 |
| Sales | sales.test1@dctcrm.com | DctTest@123 |
| Sales | sales.test2@dctcrm.com | DctTest@123 |
| Sales | sales.test3@dctcrm.com | DctTest@123 |
| CRM | crm.test1@dctcrm.com | DctTest@123 |
| CRM | crm.test2@dctcrm.com | DctTest@123 |
| CRM | crm.test3@dctcrm.com | DctTest@123 |
| Finance | finance.test1@dctcrm.com | DctTest@123 |
| Finance | finance.test2@dctcrm.com | DctTest@123 |
| Finance | finance.test3@dctcrm.com | DctTest@123 |
| Manager | manager.test1@dctcrm.com | DctTest@123 |
| Manager | manager.test2@dctcrm.com | DctTest@123 |
| Manager | manager.test3@dctcrm.com | DctTest@123 |
| Recovery | recovery.test1@dctcrm.com | DctTest@123 |
| Recovery | recovery.test2@dctcrm.com | DctTest@123 |
| Recovery | recovery.test3@dctcrm.com | DctTest@123 |

## Test Login

1. Start the application with `npm run dev`.
2. Open `http://localhost:3000/login`.
3. Use a profile-specific test user above.
4. Verify the displayed profile and test its effective permissions.

### Channel Partner Portal

The CP portal runs separately at `http://localhost:3002/login`. Its accounts
are separate from CRM users and are not created by the CRM test-user seed.
Sign in to the CRM as an administrator, open **Setup → CP Portal Accounts**,
and create a portal account before signing in with its username or email and
password.

Local service URLs:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- AI: `http://localhost:8001`
- CP Portal: `http://localhost:3002`

### Lead API test users

Lead creation is allowed for:

- `admin.test1@dctcrm.com`
- `admin.test2@dctcrm.com`
- `admin.test3@dctcrm.com`
- `presales.test1@dctcrm.com`
- `presales.test2@dctcrm.com`
- `presales.test3@dctcrm.com`

Lead creation is denied for negative API tests using:

- `sales.test1@dctcrm.com`
- `svc.test1@dctcrm.com`
- `crm.test1@dctcrm.com`
- `finance.test1@dctcrm.com`
- `manager.test1@dctcrm.com`
- `recovery.test1@dctcrm.com`

## Project Structure

```
dct-crm/
├── apps/
│   ├── api/          # Express.js backend
│   └── web/          # Next.js frontend
├── packages/
│   ├── db/           # Prisma schema & migrations
│   └── shared/       # Shared Zod schemas
```
