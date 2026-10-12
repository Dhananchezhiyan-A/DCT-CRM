# DCT-CRMM — Post-Merge Full Audit Report

Branch `main` @ `fd7c01d` (friend merge) + uncommitted local work. Local-only: no commit/push/PR/deploy performed.
Servers: API :3001 (PID 25104), Web :3000 (PID 22560). Report date: 2026-09-27.

Status key: **PASS** / **FAIL** / **PARTIAL** / **NOT TESTED**

---

## A. Merge Impact Map (§2)

- **A. Files added (friend's commit)**: `report-csv-export.ts`, `report-engine.test.ts`, `dataAdministration.ts`, `leads.phone-validation.test.ts`, `data-operation-page.tsx`, `date-format.ts`, `report-export.ts`, `generate_audit_pdf.py`, db scripts (`apply-remove-account-contact`, `inspect-ui-fields`, `lead-phone-unique.sql`, `remove-account-contact.sql`, `remove-customer-property-account-salesforce.sql`, `apply-remove-customer-migration`, `cleanup-lead-status-picklist`, `enforce-lead-phone-required`, `integrity-final`, `report-lead-phone-duplicates`, `resolve-lead-phone-duplicates`, `test-lead-phone-concurrent`, `verify-lead-phone-unique`, `update-lead-contact-ui`), suites `test_merge_fix.ps1`, `test_phone_uniqueness.ps1`. Also **untracked local assets**: `homepages.ts`, `permissionSetGroups.ts`, `recordAccess.ts`, `leadOwnerChange.ts`, `leadWorkflowExtras.ts`, `customize-home/`, `opportunities/new/`, `booking-access.ts`, 8 test suites, `docs/lead-creation-api.md`.
- **B. Files deleted**: routes `accounts/contacts/customers` (+worktree `workflows.ts`), pages `accounts/ contacts/ customers/`, `admin/layout.tsx`, `customer-360.tsx`, `temp_migration.sql`, `start-api.ps1`, `start.bat`; shared schemas `contactSchema/accountSchema/customerSchema`, `customerId` removed from booking/payment schemas.
- **C. Files modified**: 132 files, +9,296/−4,371 (84625c6→HEAD). Largest: reports/new page +1,879, `leads.ts` +409 committed (+780 worktree), `leads/[id]` +408, `reports/[id]` +418, `roundRobin.ts` +192, `seed-profiles.ts` +82, sidebar flattened.
- **D. Schema changes**: `Dashboard.isActive`, `DashboardProfileShare` model (+`profile.dashboardShares`), no Accounts/Contacts/Customers/Properties models ever present. `prisma validate/db push/generate` exit 0.
- **E. Endpoint changes**: removed `/api/contacts|accounts|customers|workflows`; added `/api/report-metadata`, `/api/data-administration`, `homepages`, `permission-set-groups`, `user-permission-set-groups`, `field-permissions` (mounted, zero consumers), RR `/configs` CRUD.
- **F. Permission changes**: authorize delegates entirely to `EffectivePermissionService`; role `PermissionSetRole` JSON grants (165 live rows) as source — **dropped by merge, restored locally**; `REPORT_READ` gate falls back to `REPORT_VIEW`; admin gate unified to `req.user.isSuperAdmin || req.user.isAdmin`; RR `requireAdmin` fixed to same shape.
- **G. Frontend changes**: sidebar flattened + permission-filtered, "Home" label, Contacts/Accounts/Customers nav removed, `customize-home/`, reports builder revamp, `lead-list` name-search removed (restored — merge had reverted my uncommitted edit).
- **H. Test changes**: `test_final`/`test_profiles` diffs vs HEAD = credential fallbacks + admin-driven setup + RR-aware SVC login (assertion-preserving, verified). New suites added by friend. False-green masking found: child `powershell -File` NativeCommandError can hide failures — all suite results below verified via explicit `Total:`/`FAIL:` lines.
- **I. Dependencies**: `react-rnd` used by `customize-home` but **undeclared** — installed via `npm install react-rnd -w @dct-crm/web`. Other package.json edits preserved.

## B. Code Health (§25)

1. Root typecheck (api+web+db) — **PASS** (0 errors)
2. API typecheck — **PASS**
3. Web typecheck — **PASS**
4. API build — **PASS**
5. Web build — **PASS** (44/44 static pages)
6. API lint — **PASS** (0 errors, 278 warnings; was 6 errors — fixed: unused `PORT`, `prisma` in authorization, `stage/lostReason` destructure, `applyScope`, `roleIds`)
7. Web lint — **PASS** (0 errors, exit 0)
8. API vitest — **PASS** (6 files, 32/32)
9. Web vitest — **PASS** (3 files, 6/6)
10. `prisma validate` / `db push` / `generate` — **PASS** (exit 0)
11. `test_merge_fix.ps1` — **PASS** (20/20; removed routes 404)
12. `test_phone_uniqueness.ps1` — **PASS** (10/10)
13. `test_final.ps1` — **PASS** (46/46; earlier 37/37 was a masked run)
14. `test_profiles.ps1` — **PASS** (50/50; earlier 47/50 → role-source fix)
15. `test_owner_visibility.ps1` — **PASS** (44/44; after search/report fixes)
16. `test_round_robin.ps1` — **PASS** (74 pass / 0 fail / 3 partial / 5 NT; after requireAdmin fix)
17. `test_rr_supplemental.ps1` — **PASS** (33 / 0 fail / 1 NT; incl. live API restart)
18. `test_lead_convert.ps1` — **PASS** (122 / 0 / 1 partial / 1 NT; after opportunity admin-bypass fix)
19. `test_lead_activity_sv.ps1` — **PASS** (39 / 0 / 1 partial)
20. `test_journey.ps1` (new, §26) — **PASS** (21/21: lead→PROSPECT→SV schedule→complete→convert→stage→quotation→booking→payment→audit(6)→search→reports→dashboard→re-convert blocked→CLOSED_LOST)
21. `test_rr_queue_probe.js` — **PASS** (queue snapshot sane, cursors DB-backed)
22. `test_cross_tenant_setup.js` up/down — **PASS** (temp tenant create → seed → wipe verified)
23. Servers boot + reload (tsx watch) — **PASS** (health smoke: presales lead create LN001834, RR configs 72)

## C. Bug Fixes Applied (all verified)

24. **P0 role permissions** — merge dropped `PermissionSetRole` grants from authorize → all non-admins lost object permissions (Presales couldn't create leads). Restored role source in `effectivePermissions.ts` (`getRolePermissions`, `'ROLE'` union, priority map). Evidence: presales creates leads; profiles 50/50.
25. **P0 search leak** — global `/api/search` + `/quick` returned other tenants' leads/tasks. Added `getScopeClause` scoping for lead/task in `search.ts`. Evidence: owner_visibility 44/44.
26. **P1 report gate** — `REPORT_READ` doesn't exist in Permission table → fallback to `REPORT_VIEW` in `authorization.ts`. Evidence: reports sections in suites.
27. **P1 RR admin gate** — `requireAdmin` read never-loaded `req.effectivePermissions` (broken shape) → fixed to `isSuperAdmin || isAdmin` in `roundRobin.ts`. Evidence: RR 74/0.
28. **P1 opportunity visibility** — tenant admin couldn't see own converted opportunities under PRIVATE sharing → `getOpportunityVisibilityFilter` admin bypass in `recordAccess.ts`. Evidence: convert 122/0.
29. **P1 web compile** — merge reverted my uncommitted `api.ts` group APIs/`updateStage`/homepage API, users-page group wiring, and `lead-list` name-search removal; restored all. Evidence: web typecheck/build/vitest green; J5/J6 assertions.
30. **P2 boot/index** — dead contacts/accounts/customers/workflows imports+mounts removed; schema `Dashboard.isActive` + `DashboardProfileShare` added (consumed by `homepages.ts` cascade delete).
31. **P2 dependency** — `react-rnd` declared and installed (merge shipped consumer without dependency).

## D. Residual Findings (KEEP + REPORT — not fixed, no spec)

32. Findings and residuals:
   - `field-permissions` router mounted with **zero consumers** (kept).
   - `homepageApi.assigned` endpoint never existed and has zero consumers (not added).
   - Permission table has no `REPORT_UPDATE/REPORT_CREATE` rows; gate only supports `REPORT_VIEW`/`REPORT_EXPORT`.
   - `SITE_VISIT_CREATED` audit omits `leadId` → doesn't appear in lead audit history (schedule/complete audits do).
   - Invalid lead `status` query param reaches Prisma → HTTP 500 instead of 400 (unvalidated query param, pre-existing).
   - `SVC_REACHED`/`NEGOTIATION` are opportunity stages, not LeadStatus values (7-value enum correct; no spec references found).
   - Friend's key files are **untracked** (`homepages.ts`, `permissionSetGroups.ts`, `recordAccess.ts`, suites, `customize-home/`) — loss risk on any checkout; left uncommitted per rules.
   - 165 `PermissionSetRole` rows are the effective permission source of truth; `ProfileObjectPermission` DB rows = 0.
   - Lead phone required on create is intentional (old design, suite TEST10).
   - AI integration — **NOT TESTED** (Python service on :8000 not running; no AI tests exist).
   - Browser/E2E UI — **NOT TESTED** (API + static file assertions only).
   - Unused-by-suite edges remain NOT TESTED per suite tallies (RR: 5, convert: 1, sv: 1, rr_supp: 1).

---
Totals: 32 items — FAIL: 0; NOT TESTED items explicitly labeled (AI, browser E2E, residual per-suite edges). All 11 suites + 2 probes + journey green after fixes.
