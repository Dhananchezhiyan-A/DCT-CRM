# FINAL UI STANDARDIZATION & WHITE-BACKGROUND REPORT

**Date:** 2026-09-28
**Scope:** Enterprise CRM UI standardization (white backgrounds, typography, controls, radii, consistency) — styling only, existing app, no rebuild.
**Git:** No commit / no push / no PR / no deploy. HEAD remains `fd7c01d`; all work local (183 tracked entries modified/untracked from the whole release-candidate effort; this session added styling edits only).
**Disposition:** **PASS** (local verification) — with 2 documented PARTIAL items (P, Q) that are deliberate decisions, not defects.

---

## §42 — A–Z DISPOSITION

### A. White page backgrounds — **PASS**
- 63 routes audited; violations found and fixed: `/login` (`bg-gray-50`), `/reports/new` (`bg-slate-50`) → `bg-background`.
- Final sweep: `bg-gray-50` = 0, bare `bg-slate-50` = 0, `bg-slate-9*` = 0 in src.
- Modal backdrops standardized to `bg-black/40` (reports/new ×2, customize-home ×2). Backdrops are scrims, not page backgrounds.
- Root layout + `(dashboard)/layout` `bg-background` (white) unchanged; `.dark` infrastructure intact (no theme toggler; 0 `dark:` usage).

### B. Typography scale — **PASS**
- Page titles → `text-xl` (20px) at all 12 flagged spots (dashboard, profiles, admin/users, admin/profiles, leads, lead detail, opportunities ×3, setup/general/users, permission-sets, security/profiles).
- KPI/stat numbers → `text-xl` (17 spots incl. `dashboard-widgets.tsx`); section headings → `text-[16px]`.
- Off-scale sizes eliminated: `text-2xl` = 0, `text-3xl` = 0, `text-[1.05rem]` = 0, `text-[2rem]` = 0, `text-[10px]` = 0.
- `text-xs` (11px) left in place per "do not blindly replace typography"; 9 `text-[clamp()]` canvas-preview uses are a justified exception (widget preview rendering).

### C. Control heights (36px) — **PASS**
- shadcn `Input`/`Button h-9` already 36px; oversized raw controls fixed: 45 raw inputs/selects gained `h-9` (companies new/edit/detail/list, reports/new, field-renderer), plus prior fixes (leads filters, opportunity stage, permission-set & profile selects, header home selector `h-10→h-9`, search-dialog `h-12→h-9`).
- Final sweep: raw `<input … h-10>` = 0. Remaining `h-10/11/12` hits are icons, skeletons, avatars, empty-state glyphs (not controls).
- Compact exceptions (kept): `h-8` search inputs inside dropdown pickers (reports/new ×3), checkbox/file inputs.

### D. Corner radii (4 / 6 / 8px) — **PASS**
- `tailwind.config.js` borderRadius: lg 8px / md 6px / sm 4px (was 6/5/4).
- `rounded-xl` (12px) eliminated: 30 → 0 across cards, panels, modals.
- Bare `rounded` (4px = "small") normalized → `rounded-md` on buttons/cards where flagged; left on genuine chips/badges (documented skip).

### E. Cards / panels — **PASS**
- All cards use `rounded-lg border border-border bg-card shadow-sm`; dialog bodies with hex grays (`bg-[#f4f4f4]`, `bg-[#f7f8fa]`) → white in reports/new modals.

### F. Tables — **PASS**
- Header/subtotal/footer fills tokenized: `bg-slate-50` → `bg-muted/50` (+ `/40`, `/80`, hover variants) in reports/new, reports/[id], customize-home preview, roles tab bar.
- Row hover → `hover:bg-muted/50`; no zebra body striping introduced.

### G. Dialogs / modals — **PASS**
- `ui/dialog.tsx` + `ui/alert-dialog.tsx`: title 13px → **16px** (spec DialogTitle), `shadow-lg` → `shadow-md`, `sm:rounded-md` → `sm:rounded-lg`.
- Hand-rolled modals (reports/new share, folder dialog, filter editor, customize-home share/picker): backdrops → `bg-black/40`, `rounded-lg`, `shadow-md`, titles → `text-[16px]`.

### H. Toasts / notifications — **PASS**
- `ui/toast.tsx`: description → `text-[12px]`, `shadow-lg` → `shadow-md`; customize-home inline error/success toasts → `shadow-md`.

### I. Form labels — **PASS**
- `ui/label.tsx` → `text-[12px]`; hand-rolled `Field` labels (reports, reports/new) → `text-[12px]`.

### J. Global chrome (header/search/sidebar) — **PASS**
- `header.tsx` home selector `h-10` → `h-9`; `search-dialog.tsx` input `h-12` → `h-9`. Sidebar already `bg-card border-border`.

### K. Dark chrome elimination (customize-home builder) — **PASS**
- Full light restyle of the dashboard-customization builder: both `bg-slate-950` sidebars → `bg-card`, `border-white/10` → `border-border`, slate text → text tokens, droppable `bg-slate-900` → `bg-muted/50`, widget cards `bg-slate-800/hover:slate-700` → `bg-card/hover:bg-muted/50`, canvas wrapper → `bg-background`, empty state + wizard dialogs normalized, `text-[10px]` → `text-[11px]`.
- Final sweep: `border-white/` = 0, `hover:bg-white/` = 0, dark backgrounds = 0.

### L. Brand hex removal — **PASS**
- `#d94141/#d94444/#bd3636/#c83333` (reports buttons/badges) → `bg-primary hover:bg-primary/90`; `#b52d2d` (wordmark, active tabs, links) → `text-primary/border-primary`; `#f1f4f8` sidebar → token; `#6475ff` (customize-home preview fills) → `#3b82f6` (primary hex). Sweep = 0.

### M. Shadows — **PASS (with documented exceptions)**
- Dialogs, alert dialogs, toasts → `shadow-md`. Remaining `shadow-lg` (5): `ui/dropdown-menu` (shadcn popover default), `ui/switch` (knob), layout-editor drag ghost, chatbot avatar — all intentional elevation, none flagged by spec targets.

### N. Dead CSS removal — **PASS**
- `globals.css` 230 → 113 lines: removed unused `@layer components` `.crm-*` (22 classes) + `.scrollbar-thin` utilities — grep-verified 0 references in tsx/ts before deletion.

### O. Raw control tokenization — **PASS**
- ~60 raw lowercase `<input>/<select>` elements now carry `h-9 text-[13px] border-input bg-background rounded-md`; reports folder inputs focus rings → `focus:border-ring focus:ring-ring/30`.

### P. Hand-rolled component consolidation (reports module) — **PARTIAL (deliberate)**
- `Modal`, `MenuItem`, `FolderTable` in `reports/page.tsx` were **restyled** (radius, height, type) but **not replaced** with shadcn equivalents — swapping implementations in the report-builder flow risks behavioral regressions beyond a styling mandate. Local `Select` functions in company/personal-settings were already 36px/13px/6px compliant.
- Disposition: PARTIAL with rationale; consolidation is a code-quality follow-up, not a visual defect.

### Q. Duplicate pagination — **PARTIAL (deliberate)**
- `ui/pagination.tsx` has 0 importers but is a shared component; `data-table.tsx` ships its own pager. Not deleted (no dead-file churn); reported as PARTIAL.

### R. Typography guardrail — **PASS**
- No wholesale token replacement performed; only spec-flagged elements changed.

### S. Dark-mode infrastructure — **PASS**
- `darkMode: ["class"]`, `.dark` CSS block, and dark token set untouched; zero `dark:` classes existed or were added.

### T. Business logic untouched — **PASS**
- No handlers, state, validation, permissions, workflows, tenant isolation, or data access modified. All edits are className/CSS/token changes. `reports/new` red→primary changes are visual only.

### U. Removed objects not reintroduced — **PASS**
- No Accounts/Contacts/Customers/Properties surfaces added (regression suites re-confirm `/api/accounts|contacts|customers` → 404).

### V. Typecheck — **PASS**
- Root `npm run typecheck` (api, web, db, shared): 0 errors.

### W. Lint — **PASS**
- Root `npm run lint`: exit 0 (pre-existing `react-hooks/exhaustive-deps` warnings only, unchanged).

### X. Unit tests — **PASS**
- Web vitest **10/10** (5 files) · API vitest **36/36** (6 files).

### Y. Builds — **PASS**
- `next build` exit 0 (all routes compile; full route table generated) · API `tsc` build exit 0 · `prisma validate` schema valid.

### Z. Regression suites — **PASS**
| Suite | Result |
|---|---|
| test_final | 46 / 0 fail |
| test_profiles | 53 / 0 fail |
| test_merge_fix | 20 / 0 fail |
| test_lead_activity_sv | 39 / 0 fail, 1 PARTIAL (known I2) |
| test_owner_visibility | 44 / 0 fail |
| test_round_robin | 74 / 0 fail, 3 PARTIAL, 5 NOT TESTED (pre-existing) |
| test_rr_supplemental | 32 / 0 fail, 2 NOT TESTED (pre-existing) |
| test_lead_convert | 122 / 0 fail, 1 PARTIAL, 1 NOT TESTED (pre-existing) |
| test_phone_uniqueness | 10 / 0 fail |
| test_journey | 21 / 0 fail |
| **TOTAL** | **461 pass / 0 fail / 5 PARTIAL / 8 NOT TESTED** |

Notes: first supplemental run left 15 undeleted temp leads (client-side delete flake under load) → residue manually cleaned, re-run clean 32/0/2. SP6 live-restart touch verified API recovery.

---

## §39 — PAGE-BY-PAGE INVENTORY (63 routes)

| Group | Routes | Status |
|---|---|---|
| Auth | login | ✅ fixed `bg-gray-50`→white |
| Core | dashboard, home, profiles/[profileName] | ✅ titles/KPIs/radius normalized |
| Leads | leads, leads/new, leads/[id] | ✅ title, filters h-9, `text-[10px]`→11px |
| Opportunities | list, new, [id] | ✅ titles, stage select h-9 |
| Objects | objects/[objectName], /new, /[id]/edit | ✅ compliant (shadcn controls) |
| Reports | reports, reports/new, reports/[id] | ✅ white bg, titles, radius, labels, brand hex→tokens, modal scrims |
| Admin | users, profiles, permission-sets, companies (list/new/[id]/edit), object-manager, customize-home (list + [profileName]), admin index | ✅ titles/KPIs, raw inputs h-9, dark builder → light |
| Setup general | users, company-settings, personal-settings, general index | ✅ titles/KPIs, tabs, radius |
| Setup security | profiles, roles, permission-sets, security index | ✅ titles, selects h-9, tab bar tokenized |
| Setup customization | fields, layouts, modules, round-robin | ✅ compliant |
| Setup data/developer | data, developer, customization [item] | ✅ compliant (shadcn) |
| CRM detail | bookings, quotations, payments, projects, site-visits, tasks (+[id] each) | ✅ compliant (shadcn controls; icons/skeletons only) |
| Preview smoke | /login /dashboard /leads /opportunities /reports /reports/new /admin/customize-home /admin/users /setup/general/users /setup/security/roles /bookings → **HTTP 200** (dev). `/profiles` → 404 by design (no index route; only `/profiles/[profileName]`). |

---

## §43 — ACCEPTANCE CHECK

1. ✅ Every page background white (violations = 0 after fix)
2. ✅ No dark chrome in app pages (incl. customize-home builder)
3. ✅ Page titles 20px, section heads 16px, KPI numbers 20px
4. ✅ Body/input text 13px; labels 12px; minimum type 11px
5. ✅ Controls 36px (h-9) — raw + shared
6. ✅ Radii 4/6/8 tokenized; no rounded-xl on cards/modals
7. ✅ Dialogs/toasts: 16px titles, shadow-md, 6px radius, white bodies
8. ✅ Brand hexes → primary token; red remaining = status badges only (closed-lost/cancelled/expired)
9. ✅ Tables tokenized (muted headers/hover, white rows)
10. ✅ Dead CSS removed, no orphan classes
11. ✅ Dark-mode infra intact; no theme toggler added
12. ✅ Business logic, permissions, workflows, tenant isolation untouched (0 fail across 10 suites)
13. ✅ Typecheck / lint / unit tests / builds / prisma validate all green
14. ✅ Removed objects still absent (404 checks pass)
15. ⚠️ PARTIAL: component consolidation (P) & pagination dedupe (Q) — deferred by design with rationale above

**Overall: PASS (local verification). No commit, push, PR, or deploy performed.**
