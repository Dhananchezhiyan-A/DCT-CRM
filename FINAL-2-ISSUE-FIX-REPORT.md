# Final Report — Round Robin Delete Bug + Customize Home Access

## 1. Round Robin Delete

**Root cause.** The backend delete worked correctly the whole time: `DELETE /api/round-robin/configs/:id` finds the config in the caller's tenant, rejects the delete with `400 "Cannot delete: N active member(s)"` when active members exist, otherwise **soft-deletes** (`isActive: false`), writes an audit log, and returns success. The bug was one line downstream: `GET /api/round-robin/configs` (`apps/api/src/routes/roundRobin.ts:34`) queried with **no `isActive` filter**, while the sibling `GET /api/round-robin` route and pool-type validation already filtered on it. The page's `handleDeleteConfig` shows the success toast and calls `loadAll()`; the refetch returned the soft-deleted row — plus every historically soft-deleted row (DB held **89 configs, only 4 active**) — so the card reappeared immediately and on every refresh: "delete does nothing."

**Fix (1 line).** `where: { tenantId: req.tenantId! }` → `where: { tenantId: req.tenantId!, isActive: true }` in the `GET /configs` handler, matching the existing pattern at `roundRobin.ts:186`. No business logic changed: soft-delete (no hard delete / no FK issue), the active-member 400 guard, and re-create-reactivates semantics are all untouched.

**DB verification (direct Prisma queries).**
- After delete: row still exists with `isActive: false` (data preserved, no `NOT_FOUND`).
- Re-create of the same `poolType` returns **the same row id** with `isActive: true` — only possible if the row persisted as inactive (and would have 409'd had it stayed active).
- Active-config count returned to baseline (4) after cleanup; `GET /configs` now returns only `isActive: true` rows.

**API verification matrix — 30/30 PASS.** Same-tenant admin delete succeeds and the config is absent from `GET /configs` on first refetch and on refresh; nonexistent id → 404; invalid/encoded id → 404 (no 500); unauthenticated → 401; non-admin (`neha@dctcrm.com`) → 403 with config untouched; config with active members → 400 with reason and NOT deleted; cross-tenant both directions → 404 with rows untouched (temp tenant provisioned and wiped); unauthenticated 401; cleanup restored baseline counts.

## 2. Customize Home

**Root causes — there were three (not one):**

1. **Menu gate wrong** — `apps/web/src/components/layout/header.tsx:229` rendered the "Customize Home page → Standard" submenu only when `isSuperAdmin`. Tenant Admin `admin@dctcrm.com` has `isAdmin: true, isSuperAdmin: false`, so the item never appeared. **Fix:** gate on the canonical `isAdmin` (the same derivation the Admin Home dropdown itself uses; non-admins still don't see it).
2. **Route was a redirect stub** — `apps/web/src/app/(dashboard)/admin/customize-home/page.tsx` was `redirect("/home")`, so even direct navigation bounced to Home. **Fix:** the existing route now renders the existing builder by re-exporting `./[profileName]/page`. No new page, route, header, or navigation was created. `useParams()` returns `{}` on the index route, so the builder's existing `profileName === "create"` logic treats it as the standard (new) designer; `/admin/customize-home/create` is unchanged.
3. **Access guard bounced all non-superadmins** — `DashboardAccessGuard` in `apps/web/src/app/(dashboard)/layout.tsx` (`:55`, `:63`) redirected every non-superadmin away from **any** `/admin/*` path, so a plain Admin reaching the URL would land back on `/home`. **Fix:** narrow rule — `/admin/customize-home` (exact + children) is allowed for `isAdmin || isSuperAdmin`; every other `/admin/*` route stays superadmin-only; non-admins are blocked from customize-home as well.

**Verification.**
- Route compiles and serves: dev log `Compiled /admin/customize-home` + `GET /admin/customize-home 200`; HTTP 200 with the correct breadcrumb (no redirect); RSC payload shows server component `CustomizeHomePage` mounting the client builder.
- All builder data APIs return 200 for plain admin (`/api/profiles`, `/api/homepages`, `/api/reports`, `/api/auth/me`).
- New automated suite `customize-home-access.test.tsx` — **6/6 PASS**: index route renders the builder (name input "Untitled Homepage"), `/create` still renders, plain Admin allowed with no `/home` redirect, non-admin blocked + redirected, other `/admin` routes still superadmin-only, superadmin allowed.
- Note: raw SSR HTML for all dashboard pages is shell-only (pre-existing — `DashboardAccessGuard` returns `null` until client auth hydrates; identical for `/home`); page content renders on hydration, unchanged behavior.

## 3. Files Changed

| File | Change |
|---|---|
| `apps/api/src/routes/roundRobin.ts` | +`isActive: true` filter on `GET /configs` (1 line) |
| `apps/web/src/components/layout/header.tsx` | Customize Home submenu gate `isSuperAdmin` → `isAdmin` (1 line) |
| `apps/web/src/app/(dashboard)/admin/customize-home/page.tsx` | `redirect("/home")` stub → re-export of existing builder (+ React import) |
| `apps/web/src/app/(dashboard)/layout.tsx` | Guard: allow `isAdmin` on `/admin/customize-home` only; all other `/admin/*` unchanged (superadmin-only) |
| `apps/web/src/test/customize-home-access.test.tsx` | **New** — 6 regression tests for both Issue-2 behaviors |

`apps/web/tsconfig.tsbuildinfo` is a typecheck build artifact (restored). **Nothing was committed** — HEAD remains `71eab3f`, all changes are local working-tree only (no commit / push / PR / deploy).

## 4. Regression Tests

| Suite | Result | Notes |
|---|---|---|
| Typecheck (4 workspaces) | **0 errors** | |
| Lint | **0 errors**, 279 warnings | all pre-existing |
| Web unit tests | **16/16 PASS** | 10 baseline + 6 new |
| API unit tests | **36/36 PASS** | |
| `test_round_robin.ps1` | **74 PASS / 0 FAIL / 3 PARTIAL / 5 NOT TESTED** | identical to baseline 74/0/3/5 |
| `test_rr_supplemental.ps1` | **32 PASS / 0 FAIL / 0 PARTIAL / 2 NOT TESTED** | identical to baseline |
| `test_final.ps1` (broad E2E) | **46/46 PASS** | |
| Fix-verification matrix (new) | **30/30 PASS** | DB-state + HTTP cases in §1 |
| `next build` / `tsc` (api) | **PASS** | |
| Live smoke | **PASS** | `/` 200; `/admin/customize-home` 200 + breadcrumb; create→delete→absent after server restart; ports 3000/3001/8001 up |

The 8 untouched regression suites (profiles, merge-fix, lead-activity, owner-visibility, lead-convert, phone-uniqueness, journey, combined) were not re-run: changes touch only an admin list endpoint, two menu/guard conditions, and one route file — covered above by the RR suites, final E2E, and the new tests.

## 5. Remaining Issues

1. **Delete-dialog copy vs member guard (known mismatch, intentionally not changed):** the confirm dialog says "Its members will be removed from this pool," but the backend's existing rule returns `400` until members are removed first. The copy is asserted by `test_round_robin.ps1:508`, so changing it would break the suite — flagging it as a product decision for you (copy fix vs. behavior change), not fixed under "no business-logic changes."
2. **No real-browser E2E:** this environment has no browser automation, so the Admin Home → Customize Home → Standard click-through was verified via jsdom tests, route/HTTP/RSC checks, and the guard matrix rather than a live browser session.
3. **Commit/push/PR/deploy intentionally not done** — changes are local on `main` at `71eab3f`, awaiting your instruction.
4. **Pre-existing RR PARTIAL/NOT TESTED items unchanged** (empty-pool forcing with production-like membership, notification-on-create gap, fault injection, permission-set matrix, AD/AE restart items) — same as baseline, unrelated to this fix.
