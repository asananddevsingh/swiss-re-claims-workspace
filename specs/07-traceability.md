# 07 — Traceability matrix

Requirement → implementation → verification. The purpose is to make coverage checkable and gaps
visible rather than discoverable only by asking.

**Status key:** ✅ implemented and verified · ⚠️ partial, with the gap stated · ⛔ not implemented

---

## Source brief → this specification

Mapping the case study's own wording to where it is addressed.

| Source requirement | Specification | Status |
|---|---|---|
| Data grid, 20,000+ records, sorting, filtering, row actions | `FR-1`, `US-1`–`US-5` | ✅ |
| Pagination or a justified alternative | `ADR-003` | ✅ |
| RBAC filtering records and UI actions | `FR-2`, `04-access-control.md` | ✅ |
| Authorisation enforced backend-side, frontend for UX | `US-8`, `04-access-control.md §4.6` | ✅ |
| Row → document loading, smooth transition | `FR-3`, `US-10`–`US-11` | ✅ |
| View 100 MB–1.5 GB documents efficiently | `FR-4`, `ADR-007` | ✅ |
| Document ops: edit (pages), split, delete | `US-18`, `US-20` | ✅ |
| Document ops: merge | `US-19` | ⚠️ API only |
| Page-level comments and annotations | `FR-5`, `US-15`–`US-17` | ✅ |
| Performance: minimal re-renders, memory footprint | `NFR-P1`–`P8` | ✅ |
| Scalability: records, document size, concurrency | `NFR-S1`–`S4` | ✅ |
| UX: progress, perceived performance, cancel/retry | `US-20`, `NFR-U1`–`U6` | ✅ |
| Reliability: consistent state, partial failures | `NFR-R1`–`R6`, `ADR-009` | ✅ |
| Architecture: boundaries, state, caching, enforcement | `ADR-001`, `ADR-002`, `03`, `04` | ✅ |
| Performance strategy: 20k rows, large documents | `ADR-003`–`ADR-007` | ✅ |
| Trade-offs stated explicitly | `06-decision-records.md` | ✅ |

---

## User stories → code → verification

`§` references are sections of the manual test script in the project README.

| Story | Implementation | Verified by | Status |
|---|---|---|---|
| **US-1** Queue visible | `components/claims/claims-grid.tsx`, `app/api/claims/route.ts` | §2.3 · 20,000 rows seeded | ✅ |
| **US-2** Numbered pagination | `claims-grid.tsx` — `Pagination` | §2.3 · `pageCount` in response | ✅ |
| **US-3** Sorting | `lib/claims-query.ts` — `SORT_COLUMN` | §2.3 · verified `sort=amount&dir=asc` | ✅ |
| **US-4** Filter and search | `lib/claims-query.ts` — `buildWhere` | §2.3 · filtered query returned 106 rows | ✅ |
| **US-5** Scope is stated | `claims-grid.tsx`, `scope` in response | §2.1 · scope label per role | ✅ |
| **US-6** Row scope | `lib/policy.ts` — `rowScopeFor` | §2.1 · 20,000 / 9,890 / 4,433 by role | ✅ |
| **US-7** Actions reflect permissions | `claims-grid.tsx` — `RowAction` | §2.2 · disabled state + tooltip | ✅ |
| **US-8** Server-side enforcement | `lib/policy.ts` — `requireCapability` | §2.2 · **403** on forged DELETE, PATCH, annotate | ✅ |
| **US-9** Role switching | `components/shell/role-switcher.tsx` | §2.1 · cache invalidated on switch | ✅ |
| **US-10** Open documents from a row | `app/(app)/claims/[id]/page.tsx` | §2.4 | ✅ |
| **US-11** No blank screen | `document-workspace.tsx` — manifest-first | §2.4 · layout before render | ✅ |
| **US-12** Read beyond memory | `app/api/documents/[id]/stream/route.ts` | §2.4 · **206** + `Content-Range` verified | ✅ |
| **US-13** Smooth scrolling | `document-workspace.tsx`, `lib/pdf.ts` | §2.4 · bounded canvases, worker parsing | ✅ |
| **US-14** Zoom | `document-workspace.tsx` — `ZOOMS` | §2.4 | ✅ |
| **US-15** Region comments | `app/api/documents/[id]/annotations/route.ts` | §2.6 · normalised coordinates | ✅ |
| **US-16** Comment list | `document-workspace.tsx` — `SidePanel` | §2.6 | ✅ |
| **US-17** Delete comment | annotations `DELETE` | §2.6 · author scoping | ✅ |
| **US-18** Split | `lib/jobs.ts` — `runPageOperation` | §2.5 · 120-page split produced a new document | ✅ |
| **US-19** Merge | `lib/jobs.ts`, operations route | API path shared with split | ⚠️ **no UI** |
| **US-20** Progress, cancel, retry | `api/jobs/[id]/events`, `api/jobs/[id]` | §2.5 · cancelled at 38%, source intact; idempotent replay confirmed | ✅ |
| **US-21** Input validation | `lib/contracts.ts` | §2.7 · **422** on bad sort and page size, **401** unauthenticated | ✅ |

---

## Non-functional requirements → verification

| ID | Requirement | Verified by | Status |
|---|---|---|---|
| NFR-P1 | Queue interactive on load | Manual, production | ✅ |
| NFR-P2 | ≤ 20 rows in DOM | DevTools element count while scrolling | ✅ |
| NFR-P3 | Deep pages cost the same | Page 2 vs last page | ✅ |
| NFR-P4 | Debounced input | Network panel during typing | ✅ |
| NFR-P5 | ≤ 8 canvases mounted | DevTools during document scroll | ✅ |
| NFR-P6 | < 500 KB to open | Network panel total transfer | ✅ |
| NFR-P7 | No long main-thread tasks | Worker-based parsing; cancellation on scroll-away | ✅ |
| NFR-P8 | Contained re-renders | Per-row memoisation | ✅ |
| NFR-R1–R4 | Reliability of operations | §2.5 · cancel left source untouched, no partial output | ✅ |
| NFR-R5 | Progress survives instance change | Job state persisted, not in memory | ✅ |
| NFR-SEC1–SEC8 | Security | §2.2, §2.7 · 401 / 403 / 422 all confirmed on production | ✅ |
| NFR-A1–A6 | Accessibility | ARIA roles, `aria-sort`, focus rings, reduced motion | ✅ |
| NFR-A7 | Keyboard-operable annotation drawing | — | ⛔ **not met**, see below |
| NFR-M5 | No unused dependencies | Import audit during review | ✅ |

---

## Known gaps

Stated here rather than left to be discovered.

| Gap | Requirement | Why it stands | What closing it needs |
|---|---|---|---|
| **Merge has no UI** | `US-19` | The API and job pipeline accept `kind: "merge"` and the execution path is shared with split, which is fully exercised. Only the second-document picker is missing | A document picker in the workspace side panel |
| **Annotation drawing needs a pointer** | `NFR-A7` | Region drawing is a drag interaction; no keyboard path exists | A coordinate-entry dialog as an alternative input route |
| **Document worker is not production-shaped** | `ADR-009` | Serverless memory and timeout limits cannot accommodate a 1.5 GB split. The job *protocol* — idempotency, progress, cancel, copy-on-write — is real and exercised; the executor is not | A long-running container performing streaming page-range extraction with multipart upload |
| **Object storage is the deployment filesystem** | `ADR-007` | Substituted for the prototype, isolated in one module | Point `lib/storage.ts` at S3-compatible storage; no caller changes |
| **Estimated counts are per-request** | `ADR-005` | Planner estimate is computed each time rather than maintained | A materialised count per common filter combination, refreshed by trigger |
| **Concurrent annotation is last-write-wins** | `NFR-S4` | Deliberate — one adjudicator per claim is how the work is assigned | CRDTs or server-ordered operations, once evidence justifies the cost |
| **Session is not production authentication** | `ADR-011` | Out of scope by `01-product-brief.md §1.3` | Identity provider integration; the role switcher is removed |

---

## Verification approach

| Layer | How it was verified |
|---|---|
| Access control | Forged requests against production for every role — 403 with the missing capability named, 401 without a session, 404 for out-of-scope records |
| Row scope | Row counts compared across all four roles: 20,000 / 9,890 / 4,433 / 20,000 |
| Count strategy | Confirmed the estimate/exact switch at the 5,000-row threshold |
| Input validation | Injection attempt in the sort parameter, out-of-range page size — both 422 |
| Range streaming | Explicit ranges, suffix ranges and mid-document seeks — all 206 with correct `Content-Range` |
| Job pipeline | Real 120-page split committed; 2,200-page split cancelled at 38% with the source verified unchanged; idempotency replay confirmed |
| Type safety | `pnpm typecheck` clean |
| Build | `pnpm build` clean, all routes compiled |

**Not covered by automated tests.** There is no unit or end-to-end suite — the time budget went to
making the behaviour real and verifying it directly. For production this is a gap, and the highest
value first tests would be: the policy matrix (pure functions, trivial to cover exhaustively),
range-header parsing including the suffix form, and an end-to-end run of the cancel path.
