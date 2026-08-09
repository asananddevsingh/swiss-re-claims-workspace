# Swiss Re — Claims Adjudication Workspace

Senior UI Engineering case study. A claims queue of 20,000+ records and a document workspace for
files too large to hold in browser memory, with role-based access enforced on the server.

**Live application → [swiss-re-claims-workspace.vercel.app/claims](https://swiss-re-claims-workspace.vercel.app/claims)**

No credentials needed — pick one of four roles on the sign-in screen.

---

## Table of contents

1. [What was asked, and where it is](#1-what-was-asked-and-where-it-is)
2. [Test scenarios](#2-test-scenarios) — the manual test script
3. [Architecture](#3-architecture)
4. [The 20,000-row grid](#4-the-20000-row-grid)
5. [Documents larger than memory](#5-documents-larger-than-memory)
6. [Operations that can fail halfway](#6-operations-that-can-fail-halfway)
7. [Running it locally](#7-running-it-locally)
8. [Project layout](#8-project-layout)
9. [Stack, and why each piece is here](#9-stack-and-why-each-piece-is-here)
10. [Design system](#10-design-system)
11. [Where this prototype ends](#11-where-this-prototype-ends)

**Related documents**

- [`specs/`](specs/) — the requirement set this is built against: user stories with acceptance
  criteria, the access control model, the API contract, decision records and a traceability matrix
- [`docs/swiss-re-architecture.pdf`](docs/swiss-re-architecture.pdf) — architecture write-up with
  diagrams. GitHub previews this in the browser; it is the same document as the HTML below
- [`docs/architecture.html`](docs/architecture.html) — the source of that document. Open it
  locally for the live version, which adapts to light and dark themes

---

## 1. What was asked, and where it is

| Requirement | Where it lives | Status |
|---|---|---|
| Grid of 20,000+ records, sort / filter / row actions | `src/components/claims/claims-grid.tsx`, `src/app/api/claims/` | Done — 20,000 seeded |
| Pagination, or a justified alternative | Server-side paging + virtualised rendering | Done — justification in §4 |
| RBAC filtering records and UI actions | `src/lib/policy.ts`, enforced in every route | Done — 4 roles |
| Authorisation enforced on the backend | Every mutating route calls `requireCapability()` | Done — provable, §2.2 |
| Row → document, smooth transition | `src/app/(app)/claims/[id]/page.tsx` | Done |
| View large documents efficiently | Manifest + HTTP Range + PDF.js worker | Done — 2,400 pages |
| Split / delete pages | Async jobs, `src/lib/jobs.ts` | Done — real PDF work |
| Merge | Same job pipeline, `kind: 'merge'` | API done, no UI |
| Page-level comments and annotations | `src/app/api/documents/[id]/annotations/` | Done |
| Progress, cancel, retry on long tasks | SSE + cooperative cancel + idempotency | Done — §2.5 |
| Consistent state after operations | Copy-on-write versioning | Done — §6 |

One requirement is partially delivered and I would rather say so than bury it: **merge has a
working API and job path but no UI** — it needs a second-document picker, and split exercises the
identical code path. Everything else in the brief is implemented and running.

---

## 2. Test scenarios

A manual test script to run against the brief. Start at
[swiss-re-claims-workspace.vercel.app/claims](https://swiss-re-claims-workspace.vercel.app/claims).

### 2.1 — Role-based row filtering

| Step | Expected |
|---|---|
| Sign in as **Auditor** | Header reads "Sees everything, read-only". Grid footer shows **~20,000 entries** |
| Switch to **Team Supervisor** (top-right dropdown) | Count drops to **~9,890** — only their team |
| Switch to **Adjudicator** | Count drops to **~4,433** — only claims assigned to them |
| Switch to **Administrator** | Back to **20,000** |

The row filter is a `WHERE` clause added server-side from the session. The client never sends it,
so tampering with the request can narrow the result set but never widen it.

### 2.2 — Authorisation is enforced on the server, not the button

This is the scenario worth the most attention.

| Step | Expected |
|---|---|
| Sign in as **Auditor** | All three row action icons are greyed out. Hover one — tooltip names the missing permission |
| Tick **"Ignore client-side permission checks"** below the grid | Every action button becomes clickable |
| Click **Delete** on any row, confirm | Red toast: **`403 — Your role does not permit this action`** |
| Click **Edit** | Red toast: **`403`** |
| Repeat as **Adjudicator** | Edit succeeds (green toast), Delete and Assign return **403** |
| Repeat as **Administrator** | All three succeed |

The toggle removes the UI check entirely. The outcome does not change, which is the point: the
disabled button is a courtesy, the server is the boundary.

**Verifying it without the UI**, if you prefer:

```bash
curl -c j.txt -X POST https://swiss-re-claims-workspace.vercel.app/api/session \
  -H 'content-type: application/json' -d '{"role":"auditor"}'

curl -b j.txt -X DELETE https://swiss-re-claims-workspace.vercel.app/api/claims/clm-000001
# {"error":"Your role does not permit this action","capability":"claims.delete"}   HTTP 403
```

### 2.3 — Grid behaviour at scale

| Step | Expected |
|---|---|
| Type `berg` in search | Results narrow after a ~300 ms pause — one request, not one per keystroke |
| Set **Status** to `Rejected` | Count drops and stays exact |
| Click **Amount** column header | Sorts server-side; click again to reverse |
| Page to 5, then 6 | Rows swap without the table flashing empty — previous page stays mounted |
| Jump to the last page | Loads at the same speed as page 2 |
| Delete a claim (as Administrator, §2.2) | The total drops by exactly one — counts are exact, so the footer tracks what you just did |
| Open DevTools → Elements, scroll the grid | Roughly 14 row elements in the DOM at any time, out of 50 fetched |
| Collapse the sidebar (top-left icon) | Rail collapses; matches the "minimised menu" Figma frame |

### 2.4 — Opening a large document

| Step | Expected |
|---|---|
| Click any claimant name | Workspace opens immediately with claim details — no blank screen |
| Watch the page area | Layout and scrollbar are correct for **2,400 pages** before any page renders |
| Open DevTools → Network, filter `stream` | Requests are **206 Partial Content** with `Content-Range` headers — never one large download |
| Scroll to around page 1,800 | Pages render as they enter view; earlier ones are released |
| Zoom in / out | Re-rasterises at the new width; annotations stay anchored |
| Check total transferred | A few hundred KB, not the whole file |

### 2.5 — Long-running operations: progress, cancel, retry

| Step | Expected |
|---|---|
| As **Supervisor**, type `1-1500` in the page range box, click **Add** | 1,500 pages selected |
| Click **Split** | Progress bar with live percentage, streamed over SSE |
| Click **Cancel** mid-run | Stops within a second: *"Cancelled before commit — source untouched"* |
| Reopen the document | Still 2,400 pages — the source was never modified |
| Select `1-120`, click **Split**, let it finish | *"Created … with 120 pages"* — a new document version |
| Click **Split** again with the same selection | Returns the original job instead of splitting twice (idempotency key) |
| As **Adjudicator** | Split and Remove are disabled — no `documents.split` capability |

### 2.6 — Annotations and comments

| Step | Expected |
|---|---|
| As **Supervisor**, click **Comment** | Button activates, cursor becomes a crosshair |
| Drag a box on any page, type a comment | Marker appears immediately; comment listed in the right panel |
| Scroll away and back | Annotation is still correctly positioned |
| Zoom in | Annotation scales with the page — it is stored in normalised coordinates, not pixels |
| Click a marker, confirm | Deletes it |
| As **Auditor**, click **Comment** | Disabled — read-only role |

### 2.7 — Small screens

| Step | Expected |
|---|---|
| Open the queue on a phone, or DevTools at 425 px | Sidebar is collapsed to an icon rail; the queue gets the remaining width |
| Scroll the table sideways | Column headers scroll **with** the rows and stay aligned — header and body share one horizontal scroll container |
| Scroll the table down | Headers stay in view while rows scroll under them |
| Tap the panel icon top-left | Sidebar expands over the same layout; tap again to collapse |
| Open a claim | Viewer column is full width; pages are clamped to fit rather than overflowing the card |
| Rotate to landscape | Layout reflows; no horizontal scrollbar on the page body itself |

The table keeps a `1040px` minimum width rather than collapsing columns into cards. Adjudicators
compare values across rows, and a card layout destroys that — so the columns stay a table and the
container scrolls.

### 2.8 — Navigation placeholders

| Step | Expected |
|---|---|
| Open **Dashboard**, **Documents**, **Audit** or **Help** | An "Under construction" page naming what that section would contain and why it is out of scope |
| Click **Go to claims queue** | Returns to the queue |

These routes exist because they appear in the supplied navigation design. Building them out would
add surface without demonstrating anything the brief asks about — so they state their intent
instead of being dead links.

### 2.9 — Input validation

```bash
# unknown sort column is rejected, not passed to SQL
curl -b j.txt "https://swiss-re-claims-workspace.vercel.app/api/claims?sort=amount;drop%20table%20claims"
# HTTP 422

# page size outside the allowed range is rejected
curl -b j.txt "https://swiss-re-claims-workspace.vercel.app/api/claims?pageSize=5000"
# HTTP 422

# no session at all
curl "https://swiss-re-claims-workspace.vercel.app/api/claims"
# HTTP 401
```

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ BROWSER                                                         │
│                                                                 │
│  App shell (RSC)   Claims grid        Document workspace        │
│  layout, session   client island      client island + PDF worker│
└──────────────────────────┬──────────────────────────────────────┘
                           │  httpOnly session cookie
                           │  no bearer token in JavaScript
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ BFF — Next.js route handlers                                    │
│                                                                 │
│  Policy evaluated ONCE per request, producing two things:       │
│    → the SQL row filter        → the capability flags the UI    │
│                                   renders from                  │
│                                                                 │
│  Grid query API │ Range proxy │ Annotations │ Jobs + SSE        │
└───────┬─────────────────┬──────────────────────────┬────────────┘
        │                 │                          │
        ▼                 ▼                          ▼
   Postgres          Object storage             Page worker
   claims            document bytes             copy-on-write
   annotations       served by byte range        split / merge
   jobs
```

The BFF is a deliberate layer, not an accident of the framework. It exists for three reasons and
would be deleted if none held:

- The browser must never hold a downstream service token. The session is an `httpOnly` cookie.
- Role has to be projected into the data query **and** the UI capabilities from a single policy
  evaluation, so the two cannot drift apart.
- A 1.5 GB document needs a proxy that streams and never buffers.

**The grid is deliberately not a Server Component.** Server-rendering a surface with client-side
sort, filter and virtualised scroll turns every interaction into a network round-trip and a
payload. RSC covers the shell, layout and session bootstrap; the grid and viewer are client
islands. Knowing where to stop using the framework's headline feature is the decision.

### Where enforcement lives

| Concern | Enforced | Also in the UI, for feel |
|---|---|---|
| Which rows exist | `WHERE` clause from session role | Scope label under "All Claims" |
| Whether an action is allowed | `requireCapability()` in the route | Buttons disabled with a reason |
| Whether input is valid | Zod schema at the route boundary | Field constraints |
| Whether a record is reachable | Scope re-checked before every mutation | 404, not 403 — an adjudicator should not learn other queues exist |

---

## 4. The 20,000-row grid

Pagination and virtualisation are not competing options. One is about **transport**, the other
about **rendering**, and they compose:

```
Postgres              over the wire            mounted in DOM
20,000 rows    ──►    50 rows (~28 KB)   ──►   ~14 row elements
indexed               sort + filter            windowed + recycled
                      applied here
```

The right-hand number stays at ~14 whether the page holds 50 rows or 500, and whether the table
holds 20,000 claims or 2 million. That is what makes it survive the growth the brief asks about.

**Why pagination.** The supplied Figma settles it: its footer reads *"Showing data 1 to 8 of 256K
entries"* with numbered pages. The client's design standard specifies paginated navigation with a
total count. Overriding that would be overruling their UX team.

**The count problem that creates.** `COUNT(*)` across a large filtered set on every keystroke is
the query that quietly takes a database down. So the count comes from the query planner's row
estimate, and the number is prefixed with `~` so it is never passed off as exact. Below 50,000
rows an exact count is cheap, so it runs one. The trade-off is that the total may briefly be stale by a few
rows — invisible on a work queue, unacceptable on a financial reconciliation screen, where I would
use an exact count over a narrower filter set instead.

**Keeping re-renders honest:**

- Row keys are stable server IDs, never array indices, so recycling does not remount.
- Column definitions live outside the component — not reallocated per render.
- Filter input is debounced into the query key; the previous page stays mounted via placeholder
  data so paging never flashes empty.
- No React Context anywhere near the grid. Context wakes every consumer on every change, which is
  the problem being solved, not the solution.

**No table library.** With sorting, filtering and pagination all server-side, every row model such
a library provides is bypassed; what remains is a column config and a cell map. A dependency you
route around is a liability, not an asset.

---

## 5. Documents larger than memory

One insight drives everything here: **the document must never arrive in the browser.** A 1 GB
`ArrayBuffer` exceeds what a tab can hold, and even if it fit, the user waited minutes to read one
page.

So selecting a row does not fetch a document. It fetches a **manifest** — page count, dimensions,
version — a few kilobytes describing a file that may be a gigabyte. The workspace lays out all
2,400 pages from that alone, so the scrollbar is accurate before a single page renders. Pages then
arrive over **HTTP Range**; the proxy streams the requested window and never buffers, which is
what makes the same handler as cheap for 1.5 GB as for 5 MB.

The single most important line in the viewer:

```ts
disableAutoFetch: true
```

Left at its default, PDF.js quietly pulls the remaining bytes in the background once the first
page resolves. Fine for a 2 MB invoice; fatal for a 1.5 GB bundle. With it off, the only bytes
that move are the ones a visible page needs.

Alongside it: parsing in a **Web Worker** so the main thread never blocks the surface being
scrolled, a handful of canvases mounted with recycling, and `renderTask.cancel()` when a page
leaves the viewport so fast scrolling does not queue work that is already stale.

**Getting there without a blank screen.** Clicking a row blocks on nothing: the workspace opens
with claim metadata already in the grid's cache, the manifest fills the page rail with correctly
proportioned placeholders, then pages rasterise as they enter view.

---

## 6. Operations that can fail halfway

These differ on one axis — whether they touch the document bytes — and that decides the update
model:

| Operation | Touches bytes | Model | On failure |
|---|---|---|---|
| Comment / annotation | No | Optimistic | Toast and roll back |
| Split / remove pages | Yes | Pessimistic, async job | Job fails, source intact |

The right model follows the cost of being wrong. A failed comment is a toast. A half-applied split
on a 1.5 GB legal document is a corrupted claim file.

**Annotations never touch the PDF.** They are rows anchored to
`(documentId, pageIndex, x, y, w, h)` in normalised coordinates, drawn as an overlay. The binary
stays immutable, annotations survive zoom and re-pagination, and two people can annotate without
fighting over a file.

**Page operations are jobs, not requests.** Splitting a large PDF takes longer than any sane HTTP
timeout, so the client submits an *intent* and receives a job ID. Two properties make it safe:

- **Idempotency key** — resubmitting returns the original job rather than splitting twice, which
  is what makes a retry button safe on an operation that is not naturally idempotent.
- **Copy-on-write** — output goes to a new object and a new catalogue row; the source is never
  mutated. A job that dies at 70% leaves it exactly as it was, so cancel needs no cleanup.

```
submitted ──► queued ──► running ──┬──► committed   (new version, atomic)
(idempotency key)      (SSE: %, ETA)│
                            │       └──► failed      (source untouched)
                            └──► cancelled           (checked between batches)
```

---

## 7. Running it locally

**Prerequisites:** Node 20+, pnpm 10+, and a Postgres connection string (built against
[Neon](https://neon.tech) — free tier is enough).

```bash
# 1. Get the code
cd swiss-re-claims-workspace

# 2. Install
pnpm install

# 3. Configure
cp .env.example .env.local
#    Edit .env.local and set:
#      DATABASE_URL    — use the POOLED Neon endpoint (host contains "-pooler")
#      SESSION_SECRET  — any random string:
#        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. Create the schema, seed 20,000 claims, build the 2,400-page PDF fixture
pnpm setup

# 5. Run
pnpm dev
```

Open <http://localhost:3000> and pick a role.

### Individual commands

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and serve |
| `pnpm typecheck` | TypeScript, no emit |
| `pnpm lint` | ESLint |
| `pnpm db:seed` | Drops and recreates the schema, seeds 20,000 claims (deterministic) |
| `pnpm fixtures` | Builds the PDF fixture — `pnpm fixtures 5000` for a bigger one |
| `pnpm db:sync` | Aligns catalogue page counts with what is actually on disk |
| `pnpm setup` | All three, in order |

The seed uses a fixed PRNG seed, so re-running produces an identical dataset.

### Deploying

```bash
pnpm dlx vercel link
pnpm dlx vercel env add DATABASE_URL production
pnpm dlx vercel env add SESSION_SECRET production
pnpm dlx vercel deploy --prod
```

`next.config.ts` uses `outputFileTracingIncludes` so the PDF fixtures travel with the serverless
bundle rather than being tree-shaken out.

---

## 8. Project layout

```
src/
  lib/
    policy.ts            roles, capabilities, row scope — the authorisation source of truth
    session.ts           signed cookie sessions, demo identities
    contracts.ts         Zod schemas: validation at the boundary, types derived from them
    claims-query.ts      WHERE-clause building, row scoping, count strategy
    storage.ts           object access — the only file that knows disk from object storage
    jobs.ts              page operations, progress, cancellation, copy-on-write
    pdf.ts               PDF.js setup and cancellable page rendering
  app/
    api/                 the BFF — every route re-checks session and capability
    (app)/claims/        grid page and document workspace
    signin/              role picker
  components/
    ui/primitives.tsx    Card, StatusChip, Button, SearchField, Select, Avatar
    shell/               sidebar, role switcher, role picker
    claims/              the data grid
    workspace/           document viewer, annotation overlay, job panel
scripts/
  seed.ts                schema + 20,000 claims
  make-bundle.ts         PDF fixture generator
  sync-catalogue.ts      catalogue/disk reconciliation
docs/
  architecture.html      full architecture write-up with diagrams
  wireframe.svg          supplied Figma export — source of the design tokens
storage/documents/       PDF fixtures
```

---

## 9. Stack, and why each piece is here

| Choice | Reason |
|---|---|
| **Next.js 16** (App Router) | The fastest correct host for a BFF: real HTTP endpoints, edge session checks, SSE via streamed responses, one deployable unit. Roughly 30% of the framework is used, on purpose. |
| **React 19 + TypeScript** | Per the brief's stack requirement. |
| **TanStack Query** | Server cache with dedup, `placeholderData`, `AbortSignal` cancellation and retry with backoff — which is the brief's "safe cancel/retry" requirement, already solved. |
| **TanStack Virtual** | Windowed rendering for both the grid and the 2,400-page rail. |
| **Zod** | One schema validates at the BFF boundary and types the client. Validation lives at the edge, not in the form. |
| **pdfjs-dist** | The only serious in-browser PDF engine. Configuration matters more than the choice. |
| **pdf-lib** | Server-side page copy for split and remove. |
| **jose** | Signed session cookies. |
| **Tailwind v4 `@theme`** | Figma hexes become tokens, tokens become utilities — one source of truth for the design system. |
| **Postgres (Neon)** | 20,000 rows with server-side sort, filter and paginate *is* a SQL query. Using a database makes "the backend is the source of truth" literally true rather than a claim. |

**On state management.** The brief names Redux / Context / MobX. The principle that matters is the
boundary: *server cache is not application state*. TanStack Query owns everything that came from
the server; component-local state owns the rest, because no UI state here currently outgrows a
single component. A store earns its place when two distant components need the same ephemeral
state — and I would rather add it then than ship an unused abstraction. If the house standard is
RTK, the architecture is unchanged: RTK Query plus slices sits on exactly the same boundary.

---

## 10. Design system

Tokens are lifted from the supplied CRM Dashboard Figma export — exact hexes read out of the SVG,
not approximations. They are declared once in `src/app/globals.css` under Tailwind's `@theme`, so
`--color-brand` becomes the `bg-brand` / `text-brand` utilities and there is a single source of
truth.

| Role | Value |
|---|---|
| Primary | `#5932EA` (deep `#4925E9`) |
| Promo gradient | `#EAABF0 → #4623E9` |
| Ink / nav / muted | `#292D32` / `#9197B3` / `#B5B7C0` |
| Success ramp | `#00AC4F`, `#16C098`, `#008767` on `#D3FFE7 → #EFFFF6` |
| Danger | `#DF0404` on `#FFC5C5` |
| Canvas / field / border | `#FAFBFF` / `#F9FBFF` / `#EEEEEE` |
| Radii | 30px cards, 10px fields, 6px chips |
| Type | Inter |

Two places the design had to be **extended** rather than merely implemented. Both are flagged here
rather than improvised silently, because they are designer conversations:

1. **The Figma has no row actions column**, but the brief requires Edit, Delete and Assign, each
   role-gated. Added following the existing cell rhythm, with a disabled state at 38% opacity —
   matching the export's own `fill-opacity` convention — and a tooltip naming the missing
   permission.
2. **The Figma ships two status chips** (Active / Inactive); claim workflow needs six. Extended
   along the same axis: saturated ink on a tinted ground, 6px radius, 1px border of the same hue.

Accessibility: ARIA grid semantics on the virtualised table, `aria-sort` on sortable headers,
keyboard-navigable actions with visible focus rings, labelled controls, and `prefers-reduced-motion`
honoured.

---

## 11. Where this prototype ends

Stating the boundary is part of the design.

- **The document worker cannot stay serverless.** Splitting a 1.5 GB PDF exceeds serverless memory
  and timeout, and any library that loads the whole document into memory is unusable at that size.
  Production needs a long-running container doing streaming page-range extraction with multipart
  upload. What runs here is the real job *protocol* — idempotency, progress, cancel, copy-on-write
  — against documents small enough for a function. The protocol is the part that has to be right;
  the executor swaps out behind it.

- **Document bytes are on the deployment filesystem**, with job output written to the only
  writable path a serverless host has. In production both are object storage.
  `src/lib/storage.ts` is deliberately the only file that knows the difference.

- **The declared 1.5 GB size is catalogue metadata.** The fixture on disk is 2,400 real pages at
  3.8 MB, and the manifest reports both figures rather than pretending. Every technique here was
  chosen for the larger number, and none of them change at it.

- **Annotation concurrency is last-write-wins.** Adequate for one adjudicator per claim, which is
  how the work is assigned. Genuine simultaneous editing on the same page needs CRDTs or
  server-ordered operations, and I would want evidence it happens before paying for that.

- **Estimated counts should become a maintained aggregate** — a materialised count per common
  filter combination, refreshed by trigger — once real query patterns are known.

- **Policy is a typed module, not a policy service.** At scale, authorisation changes should not
  require a frontend deploy. But extracting that layer before the rules stabilise makes them
  harder to read, not easier.

- **Accessibility is built in, not audited.** A screen-reader pass on the annotation overlay — the
  genuinely hard surface — is outstanding.
