# DCT CRM Final Release-Candidate Audit

**Audit date:** 2026-09-28
**Result:** **PASS (local release-candidate verification)** — full static battery, all unit tests, the complete 10-suite integration battery, and a production (`next start`) smoke check are green. This is a local sign-off only: no Git commit/push, no deployment, no database migration (see §33–§35 for explicit carve-outs).

**Git/deployment:** No commit, push, pull request, or deployment was performed. Worktree remains at HEAD `fd7c01d` with 182 modified/deleted tracked entries plus the untracked additions listed below.

## Scope and evidence

Evidence levels used below:

- **Verified (this audit):** commands executed against the local worktree during this pass; live means against locally running dev or production servers with real database data.
- **Historical:** recorded in [POST-MERGE-AUDIT-REPORT.md](./POST-MERGE-AUDIT-REPORT.md) or [FINAL-CLEANUP-VERIFICATION-REPORT.md](./FINAL-CLEANUP-VERIFICATION-REPORT.md); repeated only where re-verified.
- **NOT TESTED:** requires browser automation, export-format validation, or a migration decision that was deliberately not taken.

## 1. Merge summary

**PARTIAL (provenance) / PASS (state).** The repository, routes, pages, manifests, Prisma schema, and candidate-junk levels were fully inventoried. Per-file attribution of friend-merge work versus local fixes cannot be established from the worktree alone; however the current state of every area below was verified in this pass by live tests. HEAD was not changed.

## 2. Files added

- `apps/web/src/app/(dashboard)/home/page.tsx` — re-exports the canonical dashboard implementation (single source of truth for `/home`).
- New API routes/services (untracked, prior work, all covered by typecheck/build/tests): `routes/homepages.ts`, `routes/permissionSetGroups.ts`, `services/leadOwnerChange.ts`, `services/leadWorkflowExtras.ts`, `services/recordAccess.ts`.
- New tests: `apps/api/src/index.test.ts`, `routes/users.capacity.test.ts`, `services/effectivePermissions.field.test.ts`, `apps/web/src/test/header-homepage-refresh.test.tsx`, `apps/web/src/test/homepage-selection.test.tsx`, `components/crm/lead-list.test.tsx`, `components/layout/sidebar.test.ts`, `app/(dashboard)/bookings/page.test.ts`.
- New pages/migrations/docs: `admin/customize-home/`, `opportunities/new/`, `profiles/[profileName]/`, `bookings/booking-access.ts`, `packages/db/migrations/add_homepage_*.sql`, `packages/db/migrate-sitevisit-status.ts`, `packages/db/src/backfill-sv-numbers.ts`, `docs/lead-creation-api.md`, the three report files.
- Test suites: `test_journey.ps1`, `test_lead_activity_sv.ps1`, `test_lead_convert.ps1`, `test_owner_visibility.ps1`, `test_round_robin.ps1`, `test_rr_supplemental.ps1`, `test_cross_tenant_setup.js`.

## 3. Files modified

Changes verified/added during this audit (this session), on top of the pre-existing worktree edits:

**API**
- `services/effectivePermissions.ts` — added per-request permission cache (`requestCaches` WeakMap keyed by the request's `req.user`, `getEffectivePermissionsCached`, `hasPermissionIn`); zero cross-request staleness by construction.
- `middleware/permissions.ts`, `middleware/authorization.ts`, `services/recordAccess.ts`, `routes/search.ts`, `routes/dashboards.ts`, `routes/dynamicCrud.ts`, `services/metadata.ts` — all permission/authorization lookups now reuse the per-request cache instead of re-querying the permission triple per check (A1/A2).
- `routes/analytics.ts` — `/projects` rewritten from per-project N+1 to three grouped queries; `/pipeline` from ~12 queries to one `groupBy` (A3).
- `routes/reports.ts` — folder GET hoists duplicate `userRole`/`reportFolderShare` queries (A14).
- `services/leadOwnerChange.ts` — eligible-owner lookups parallelized.
- `routes/leads.ts` — GET now honors `from`/`to` date filters (was silently ignored).
- `routes/dynamicCrud.ts` — passes `req.user` as cache owner into `getUserObjectPermissions`.

**Web**
- `components/crm/data-table.tsx` + every DataTable call site (`bookings`, `payments`, `projects`, `quotations`, `opportunities`, `site-visits`, `tasks`, `lead-list.tsx`, `dynamic-table.tsx`) — `serverPagination` actually enabled; server-side pagination was previously declared but never passed.
- `components/layout/header.tsx` — `isSuperAdmin` destructured; Customize Home submenu gated to superadmin; Profile/Settings menu items routed by role (superadmin → `/admin/users` + `/admin`; admin → `/setup/general/users` + `/setup`; otherwise hidden); removed dead `pathname` dependency that refetched homepage data on every navigation (refresh now on mount and on dropdown open); removed debug logs.
- `app/(dashboard)/dashboard/page.tsx` — Add Component CTA gated to superadmin; homepage debug logs removed; dead `/activities` link removed.
- `app/(dashboard)/setup/page.tsx` — Object Manager tile filtered to superadmin; redirect normalized to `/home`.
- `components/layout/breadcrumb.tsx` — `/objects/*` and `/profiles/*` deep links no longer generate broken intermediate hrefs (non-final segments render as plain text).
- `app/(dashboard)/payments/page.tsx` — `bookingId` added to the payment type/mapping; list link uses the real id instead of a nonexistent field.
- `app/(dashboard)/profiles/[profileName]/page.tsx` — rewritten against real APIs; fake KPIs, hardcoded pipeline stages, and mocked activity removed; unused imports/state dropped.
- `components/crm/search-dialog.tsx` — 300 ms debounce plus stale-response guard (previously fired a request per keystroke with an unusable abort reference).
- `app/(dashboard)/setup/general/users/page.tsx` — redirect normalized to `/home`.
- `(dashboard)/layout.tsx`, `setup/layout.tsx`, `contexts/auth-context.tsx` — all remaining `/dashboard` redirects normalized to `/home`.
- `app/page.tsx` — **deleted** (route-group `/` conflict with `(dashboard)/page.tsx`, which redirects `/home`; unauthenticated users are sent to `/login` by the guard, so the old login redirect was dead code).
- `setup/section-page.tsx`, `components/crm/dashboard-widgets.tsx` — redundant `"use client"` directives removed (verified hook-free).
- `test/header-homepage-refresh.test.tsx` — updated to the intentional new contract: refetch on mount + on dropdown open, and **not** on route change (asserted), with jsdom polyfills (`ResizeObserver`, pointer-capture stubs).
- `apps/ai/requirements.txt` — trimmed to actually-imported packages.
- Package manifests (root/web/api) — see §8.

Encoding incident (self-inflicted, fixed): PowerShell 5.1 `Set-Content` wrote one file in cp1252, producing invalid UTF-8 that failed `next build` ("stream did not contain valid UTF-8"). The file was repaired (cp1252-decoded and rewritten as UTF-8, strict-UTF-8 verified, redirect edit preserved), the other PowerShell-written files were audited clean, and the build was re-verified green.

## 4. Files removed

Prior pass: `packages/tmp-check.js`, `test_rr_queue_probe.js`, 24 stale log files, 2 Python bytecode files.

This pass: `apps/web/src/app/page.tsx` (see §3), `apps/web/web-dev.log`, `apps/web/logs/`, `apps/ai/__pycache__/`, `packages/db/migrations/check_perms.sql`, `packages/db/migrations/final_cleanup.sql` (both confirmed unreferenced), stale compiled `apps/api/dist/`, empty `setup/general/[item]` directory, all temporary audit-run logs.

No business source, Prisma migration, required script, or assertion-based regression suite was removed.

## 5. Folders removed

- `logs/`, `apps/web/logs/`, `apps/ai/__pycache__/`, `apps/api/dist/` (stale build output), `setup/general/[item]/` (empty).

## 6. Duplicate code removed

**PARTIAL.** Removed: unreferenced API client wrappers for retired object routes; the `/` route duplicate (§3); duplicate homepage implementations collapsed to a single re-export. A full semantic duplicate-code audit of business logic was not completed.

## 7. Test files removed

**PASS.** No regression/unit/integration suite was deleted. Only a standalone probe (`test_rr_queue_probe.js`) and a temporary helper (`packages/tmp-check.js`) were removed.

## 8. Dependencies removed

**PASS** (all removals verified unused immediately before removal, followed by typecheck/lint/tests/builds):

- web: `recharts`, `react-hook-form`, `@hookform/resolvers`, `@radix-ui/react-tooltip`, `zod` (no imports in source or tests; the earlier "keep zod" recommendation was overturned by direct verification).
- api: `cookie`, `@types/cookie` (no imports). Added missing devDeps actually required by the lint script: `eslint@^8`, `@typescript-eslint/parser@^7`.
- root: `typescript` and `@types/bcrypt` (all four workspaces already declare their own; `bcrypt`/`@types/bcrypt` are legitimately declared in `packages/db`, which the seeds import).
- web: `tailwindcss-animate` moved from dependencies to devDependencies.
- `apps/ai/requirements.txt`: removed `pydantic-settings`, `openai`, `sqlalchemy`, `asyncpg`, `passlib`, `python-multipart` (no imports); kept `fastapi`, `uvicorn`, `python-dotenv`, `pydantic`, `httpx`, `python-jose`.

## 9. Dependencies retained and why

**PASS.** `npm ls --depth=0` clean; lockfile untouched. Retained by verified import: `react-rnd` (homepage editor), all radix primitives in use, `lucide-react`, `bcrypt` chain in `packages/db`. Deprecation advisories were not "fixed" by speculative major upgrades (see §35).

## 10. API routes verified

**PASS.** Route registrations inventoried (268 matches across 44 files). Retired mounts (`contacts`, `accounts`, `customers`, `workflows`) assert HTTP 404 in `index.test.ts` and were re-confirmed live by `test_merge_fix.ps1`. Live suites exercised against running servers: auth/login, leads (CRUD, push-to-svc, transitions, convert, validation), site visits, opportunities, quotations, bookings, payments, round-robin config/pools, reports (run + folders), dashboards, homepages, global/quick search, audit, notifications, profiles/roles/permission-sets, metadata/object permissions, multi-tenant provisioning endpoints. Typecheck + build pass. Not every individually registered endpoint was called; coverage is by workflow rather than exhaustive enumeration.

## 11. Frontend pages verified

**PASS (HTTP/build; no browser automation).** Production build compiles and emits every route (68 app-path manifest entries; all static ○ / dynamic ƒ). Live HTTP: `/login`, `/home`, `/leads`, `/opportunities`, `/tasks`, `/site-visits`, `/payments`, `/reports`, `/setup`, `/admin` → 200. `/settings` and bare `/profiles` → 404 by design (no such routes exist and no code links to them). Suites confirmed 200 for `/login`, `/leads`, `/setup/customization/round-robin`, and the round-robin UI page. Client rendering of individual widgets is covered by web unit tests, not by browser E2E.

## 12. Database verified

**PARTIAL — migration deliberately skipped.** `prisma validate` and `prisma generate` pass. **`prisma db push` was NOT run:** the schema currently differs from the live database in ways where a push would drop still-populated legacy tables; running it requires an explicit data-retention decision (§35). No destructive SQL was executed. Physical absence of legacy `Contacts`/`Accounts`/`Customers` tables is therefore **NOT TESTED**.

## 13. Permissions verified

**PASS (behavioral; full deny-matrix still NOT TESTED).** Live: admin vs non-admin create gates, forged-`tenantId` rejection, unauthenticated rejections, superadmin cross-tenant bypass, report scope forcing, owner-visibility matrix (`test_owner_visibility.ps1`, 44/44), profile validation suites (50/50), plus permission unit tests (36 API tests incl. `effectivePermissions.field.test`). The exhaustive permission-set deny matrix for round-robin assignees remains NOT TESTED by documented design (RR eligibility is profile-name based, not permission-set based).

## 14. Tenant isolation verified

**PASS.** Live two-tenant evidence: cross-tenant lead access allowed only for assigned SVC during scheduled state and revoked on cancel; global search does not leak tenant B leads to tenant A; phone uniqueness enforced within tenant but allowed across tenants; temp-tenant provisioning/wipe round-trip; superadmin bypass behaves as designed; 100+100 concurrent creates in both tenants produce no cross-tenant owners and no null owners (`test_rr_supplemental.ps1`).

## 15. Record Access verified

**PASS.** Owner vs non-owner vs admin visibility exercised live across leads/site-visits/search/reports; reports force OWNER scope even when `showMe=all`; audit history endpoints tie entries to records (`test_owner_visibility.ps1`, `test_final.ps1`, `test_lead_convert.ps1`).

## 16. Lead workflow verified

**PASS.** End-to-end journey `test_journey.ps1` 21/21: create → NEW → PROSPECT → schedule SV → complete → SITE_VISIT_HAPPENED → convert (OPP number visible) → BOOKED → stage moves → CLOSED_LOST terminal; re-convert blocked with 400. `test_lead_convert.ps1` 122/0 (+1 PARTIAL browser-only, 1 NOT TESTED) covers conversion gating, audit, opportunity number/owner, duplicate-callers, dead-code checks.

## 17. Site Visit verified

**PASS.** Scheduling/completion/cancellation transitions, invalid-project rejection, revisit/previous-visit display, concurrency burst creates, activity/SV numbering, and audit presence all pass live (`test_journey.ps1`, `test_lead_activity_sv.ps1` 39/0/1 PARTIAL, `test_final.ps1`).

## 18. Opportunity verified

**PASS.** Creation with generated `OPP` number, stage progression to CLOSED_LOST terminal, list/detail access, and reports grouped over opportunity data verified live (`test_journey.ps1`, `test_merge_fix.ps1`).

## 19. Quotation verified

**PASS.** Quotation creation with valid unit discovery verified end-to-end in `test_journey.ps1` (4.1–4.2); validation cases covered by `test_final.ps1`. Approval-workflow UI clicks were not browser-automated.

## 20. Booking verified

**PASS.** Booking creation from a quotation with unit availability verified live (`test_journey.ps1` 4.3) plus booking list unit tests (2). Confirmation-click browser automation not performed.

## 21. Payment verified

**PASS.** Payment creation against the booking verified live (`test_journey.ps1` 4.4); payments list pagination/link fix typechecked and built.

## 22. Reports verified

**PASS.** Report engine unit tests 13/13; live report runs (Lead by Source/Status with correct group counts), report listing 200, folder/share endpoints exercised (`test_merge_fix.ps1`, `test_journey.ps1` 5.3, `test_rr_supplemental.ps1`). CSV/Excel export formats remain NOT TESTED (§25).

## 23. Dashboard verified

**PASS.** Dashboards list 200 live (`test_journey.ps1` 5.4); homepage selection/widget unit tests (4) pass; homepage API CRUD live-tested by `test_rr_supplemental.ps1` SP0–SP9; header refresh contract covered by `header-homepage-refresh.test.tsx`.

## 24. Search verified

**PASS.** Global search and quick search by `leadNumber` (count=1 each), leads list search, tenant non-leak of B's leads, and superadmin cross-tenant results verified live (`test_merge_fix.ps1`, `test_owner_visibility.ps1`, `test_journey.ps1` 5.2). Search dialog debounce fix shipped with a stale-response guard.

## 25. Export verified

**NOT TESTED.** No suite calls the CSV/Excel export endpoints against live report data; no export-format assertions exist. Must be exercised before release if exports are in scope.

**Final junk-scan classification**

- **KEEP:** production source, docs, manifests + lockfile, env templates, Prisma migrations, seed/repair scripts, all assertion-based suites, the three audit reports.
- **REMOVED:** §4–§5 items plus this pass's temporary logs.
- **NEEDS REVIEW:** `generate_audit_pdf.py` (no in-repo caller; retained because intent is unclear); `packages/db/migrations/remove-customer-property-account-salesforce.sql` (currently a no-op); other pre-existing untracked merge additions whose external provenance cannot be established from this worktree.

## 26. Performance improvements

**PASS (implemented and verified by tests/build; live profiling NOT TESTED).**

- Server-side pagination enabled across every DataTable (`serverPagination` was previously never passed — every list loaded unbounded).
- Per-request permission caching (WeakMap keyed by `req.user`): eliminates duplicate permission/profile/set queries across `authorize`, `requirePermission`, `getRecordScope`, search, dashboards, and object-permission checks within a request; no cross-request staleness.
- Analytics N+1 removed: `/projects` 3 grouped queries instead of per-project fan-out; `/pipeline` one `groupBy` instead of ~12.
- Reports folder GET query hoist; round-robin eligible-owner lookups parallelized.
- Search dialog debounced (300 ms) with stale-response suppression; header no longer refetches homepage data on every route change.
- No speculative index/architecture rewrites; no bundle profiling or response-time measurement was run.

## 27. Errors found

Historical (prior pass): stale retired router mounts breaking API build; missing `/home` route; `useSearchParams()` prerender failures; reintroduced Account/Contact/Customer schema models; malformed `.gitignore` tail bytes; stale logs/bytecode/temp scripts.

This pass:

1. **FAIL before fix:** `serverPagination` declared but never passed at any call site — pagination was dead everywhere.
2. **FAIL before fix:** breadcrumb generated broken intermediate links for `/objects` and `/profiles` detail pages.
3. **FAIL before fix:** payments list typed/mapped no `bookingId`, so the booking link could never render.
4. **FAIL before fix:** profile detail page presented fabricated KPIs/pipeline/activity data.
5. **FAIL before fix:** global search issued a request per keystroke with a non-functional abort reference (race-prone).
6. **FAIL before fix:** mixed `/dashboard` and `/home` redirect targets (6 sites) and a `/` route-group conflict (`app/page.tsx` vs `(dashboard)/page.tsx`).
7. **FAIL before fix:** header/dashboard UI gates keyed off `isAdmin` only — Customize Home, Object Manager, and Add Component were reachable by non-superadmins; menu items pointed to routes below their access level.
8. **FAIL before fix:** `leads` GET `from`/`to` parameters silently ignored (report date filtering was fictional).
9. **FAIL before fix (build-blocking):** cp1252/UTF-8 corruption in `setup/general/users/page.tsx` from a PowerShell write — `next build` failed "stream did not contain valid UTF-8"; repaired (§3).
10. **FAIL before fix (test quality):** `test_rr_supplemental.ps1` SP5h counted a failed request as "no residue" (false PASS), and its cleanup could not survive PowerShell 5.1's 2-connection ServicePoint limit after the 100-concurrent SP5 phase (30 dropped client-side DELETEs with the API answering 200/200 for every request it received).
11. **FAIL before fix (test quality):** header refresh test asserted the old refetch-on-every-navigation behavior that was intentionally removed.

## 28. Errors fixed

All §27 items fixed and re-verified: pagination live everywhere (10 call sites), breadcrumb/payments/profile/search fixes shipped, redirect normalization + route-conflict resolution (`app/page.tsx` deleted, `home/page.tsx` re-export), role gating added at header/dashboard/setup, `leads` date filtering implemented, `users/page.tsx` re-encoded to strict UTF-8, suite hardened (`DefaultConnectionLimit=1000`, one-shot delete retry, `-1` sentinel so SP5h errors FAIL, then re-run **32/0/2**), header test re-scoped to the new contract (then 10/10 green). Residue from the earlier failed suite runs (31 + 30 leads) was deleted and re-verified zero.

## 29. Remaining warnings

**PASS with warnings (no suppression).** Root `npm run lint` exits 0. Remaining warnings are pre-existing `react-hooks/exhaustive-deps` and style warnings plus Vitest's CJS-deprecation and React `act()` environment notices. No lint rule was disabled and no error was hidden.

## 30. Tests executed

Static battery (final runs, all after the last code change):

- `npm run typecheck` — PASS (all 4 workspaces)
- `npm run lint` — PASS (exit 0, warnings only)
- `npm run test --workspace=apps/api` — PASS
- `npm run test --workspace=apps/web` — PASS
- `npm run build --workspace=apps/api` (`tsc`) — PASS
- `npm run build --workspace=apps/web` (`next build`) — PASS (fresh production `.next`)
- `prisma generate` / `prisma validate` — PASS

Integration battery (live servers, real database): `test_final.ps1`, `test_profiles.ps1`, `test_merge_fix.ps1`, `test_lead_activity_sv.ps1`, `test_owner_visibility.ps1`, `test_round_robin.ps1`, `test_rr_supplemental.ps1` (hardened), `test_lead_convert.ps1`, `test_phone_uniqueness.ps1`, `test_journey.ps1` — all exit 0.

Smoke checks:

- Production mode (`npx next start` + API): `/login`, `/home`, `/leads`, `/setup` → 200; API login token OK; hashed CSS asset → 200.
- Dev mode: 10 pages → 200; `GET /api/leads`, `/api/opportunities`, `/api/reports`, `/api/dashboards` → 200; AI `GET /health` → 200.

## 31. Exact test counts

| Suite / layer | Pass | Fail | Partial | Not tested |
|---|---:|---:|---:|---:|
| API Vitest (6 files) | 36 | 0 | 0 | 0 |
| Web Vitest (5 files) | 10 | 0 | 0 | 0 |
| test_final.ps1 | 46 | 0 | 0 | 0 |
| test_profiles.ps1 | 50 | 0 | 0 | 0 |
| test_merge_fix.ps1 | 20 | 0 | 0 | 0 |
| test_lead_activity_sv.ps1 | 39 | 0 | 1 | 0 |
| test_owner_visibility.ps1 | 44 | 0 | 0 | 0 |
| test_round_robin.ps1 | 74 | 0 | 3 | 5 |
| test_rr_supplemental.ps1 | 32 | 0 | 0 | 2 |
| test_lead_convert.ps1 | 122 | 0 | 1 | 1 |
| test_phone_uniqueness.ps1 | 10 | 0 | 0 | 0 |
| test_journey.ps1 | 21 | 0 | 0 | 0 |
| **Total** | **504** | **0** | **5** | **8** |

Integration total: 458 pass / 0 fail / 5 PARTIAL / 8 NOT TESTED (471 assertions across 10 suites).

- PARTIAL items: browser-only checks (convert-button E2E, notification-delivery visibility, NEW→BOOKED profile attempt) — statically verified where possible.
- NOT TESTED items: browser automation, forced mid-transaction fault injection, mid-test restart of RR cursor snapshot, permission-set deny matrix (documented design reason), second-tenant probes that depend on provisioning branches.

## 32. Build results

- API TypeScript build (`tsc`): **PASS**.
- Next.js production build: **PASS** (fresh build is the current state of `.next`).
- All-workspace typecheck: **PASS**.
- Root lint: **PASS (exit 0)** with pre-existing warnings.
- Prisma validate/generate: **PASS**.
- AI service: Python syntax **PASS**; live `GET /health` → **200 (PASS)**; full AI feature runtime **NOT TESTED**.
- Production server (`next start`) smoke: **PASS**.

## 33. Remaining PARTIAL items

1. Merge provenance/attribution cannot be reconstructed from the worktree (§1).
2. Semantic duplicate-code audit incomplete (§6).
3. DB migration/`db push` deliberately deferred pending a data-retention decision (§12).
4. 5 suite PARTIALs — all browser- or data-condition-dependent (§31).
5. API route coverage is workflow-based, not an exhaustive per-endpoint sweep (§10).

## 34. NOT TESTED items

1. CSV/Excel export endpoints and output formats (§25).
2. Browser E2E (no automation framework): UI click-paths for convert, booking confirmation, quotation approval, notification visibility.
3. `prisma db push` outcome and physical absence of legacy tables.
4. AI service feature runtime beyond `/health`.
5. Forced DB fault injection / mid-transaction failure behavior.
6. Full permission-set deny matrix for RR assignee (documented as unreachable by design).
7. Expired/suspended/pending-tenant session states.
8. Live load/latency profiling (bundle, query plans, response times).

## 35. Remaining risks

1. **No Git operation was performed.** 182 modified/deleted tracked entries + untracked adds are local only; the release process must include them deliberately.
2. **Database schema drift:** schema differs from the live DB; `db push` would drop still-populated legacy tables — needs an explicit decision before any environment sync.
3. **npm audit: 15 advisories (1 critical)** — report-only; no speculative major-version upgrades were applied (§9).
4. Known product findings retained (previously reported, unchanged): presales seed PermissionSet over-grant; superadmin impersonate returns 404; dead `checkRecordAccess` export; RR GET endpoints unauthenticated-by-design review; 36/148 opportunities lack `opportunityNumber`; report nav shows VIEW-only while backend accepts VIEW||READ; `/admin/customize-home` has no sidebar entry; create path does not send presales LEAD_ASSIGNMENT notification (architecture gap).
5. Test-harness note: PowerShell 5.1 client flakiness under 100-concurrent load was mitigated in `test_rr_supplemental.ps1` (connection limit + retry + error-path sentinel); other suites do not run comparable concurrency and were stable across repeated runs.
6. ESLint/React warnings remain visible by design (§29).

**Final disposition: PASS for local release-candidate verification.** Static validation, unit tests, the full integration battery, and production smoke checks are green after the fixes above. This report does not claim export correctness, browser-E2E coverage, or a migrated production database — those remain open per §34.
