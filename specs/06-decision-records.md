# 06 — Decision records

Eleven decisions that shaped the build. Each records what was chosen, what it was chosen *over*,
what it costs, and what would change the answer.

A decision with no stated cost has not been thought about properly.

---

## ADR-001 — A thin BFF, not a pure SPA and not a monolith

**Status:** Accepted

**Context.** The brief grades *"where critical enforcement (authz, validation) lives"* and asks for
*"backend API assumptions"* — which implies the domain services belong to other teams.

Two obvious shapes both fail:

- **A pure client-side SPA** has no server, so access control would live in browser JavaScript.
  That is precisely the anti-pattern the brief is testing. The written architecture would claim
  the backend is the source of truth while the running application proved otherwise.
- **A self-contained monolith** would own the claims domain, which contradicts the framing that
  the domain services already exist and are somebody else's.

**Decision.** A React client with a **thin backend-for-frontend**. The BFF owns exactly three
things: session and token exchange, policy projection, and byte-range proxying. Domain services
are assumed and their contract defined.

**Consequences.**

- ✅ Authorisation is demonstrably server-side.
- ✅ No downstream credential is ever reachable from client JavaScript.
- ✅ Row scope and capability flags come from one evaluation and cannot drift apart.
- ⚠️ One more network hop, and a layer that must be kept thin — a BFF that accumulates business
  logic becomes a second backend nobody owns.

---

## ADR-002 — Next.js as the BFF host

**Status:** Accepted · **Supersedes an initial preference for a Vite SPA**

**Context.** Something has to host the BFF from `ADR-001`.

**Options considered.**

| Option | Verdict |
|---|---|
| **Next.js App Router** | Chosen — route handlers, edge session checks, streamed responses for SSE, one deployable unit |
| Vite SPA + standalone functions | Closest runner-up. Same architecture, less framework. Rejected on friction: no middleware, more configuration, and nothing gained since server rendering is barely used |
| Remix / React Router framework mode | Excellent loader/action model. Rejected on audience familiarity in an enterprise setting |
| TanStack Start | Rejected on maturity — would read as chasing novelty rather than judgment |
| Monorepo + separate API service | Best structural optics, but hours of scaffolding adding nothing to the graded criteria |

**Decision.** Next.js, using roughly 30% of it deliberately.

**The important corollary: the queue is *not* a Server Component.** Server-rendering a surface
with client-side sort, filter and virtualised scroll turns every interaction into a round-trip and
a payload. Server components cover the shell, layout and session bootstrap; the queue and viewer
are client islands.

**Consequences.**

- ✅ Fastest correct path to a real server boundary.
- ⚠️ Framework features that look attractive here are actively wrong; the discipline to leave them
  unused has to be maintained.

---

## ADR-003 — Pagination, with virtualised rendering inside it

**Status:** Accepted

**Context.** The brief says *"use pagination or justify an alternative (e.g. virtualization/
infinite scroll)"*, which frames the three as competitors. They are not.

- **Pagination is a transport decision** — how many rows cross the network.
- **Virtualisation is a rendering decision** — how many rows exist in the DOM.

**Decision.** Both. Server-side pagination for transport, windowed rendering for display.

The supplied Figma settles which transport: its footer reads *"Showing data 1 to 8 of 256K
entries"* with numbered pages. The client's design standard specifies paginated navigation with a
total count.

Infinite scroll was additionally rejected on domain grounds: adjudicators cite positions to each
other ("page 4 of the unassigned queue"), which infinite scroll destroys.

```
20,000 rows in Postgres  ──►  50 rows over the wire  ──►  ~14 rows in the DOM
   sort + filter here          per page                    windowed, recycled
```

**Consequences.**

- ✅ Row count in the DOM stays bounded regardless of dataset or page size.
- ✅ Matches the client's design standard rather than overriding their UX team.
- ⚠️ Numbered pagination requires a total count — which creates `ADR-005`.

**Revisit if** the queue becomes a feed rather than a worklist, or mobile becomes the primary
surface.

---

## ADR-004 — Server-side sort and filter

**Status:** Accepted

**Context.** 20,000 rows is roughly 8 MB of JSON. It would fit in browser memory today.

**Decision.** All sorting, filtering and pagination on the server.

**Rationale.** Two reasons, and the second is the one that matters:

1. It fits at 20,000 and fails at 200,000 — `NFR-S1` targets a million.
2. **Row-level access control cannot be enforced on a dataset the client already holds.** If the
   client has every row, filtering client-side means the data was already delivered. This makes
   server-side processing a security requirement, not merely a performance one.

**Consequences.**

- ✅ Access control is enforceable at all.
- ⚠️ Every filter change is a network round-trip; mitigated by debouncing and cached pages.

**Revisit if** a view is provably bounded *and* non-sensitive — then a single fetch is simpler and
faster.

---

## ADR-005 — Estimated counts above a threshold, exact below

**Status:** Accepted

**Context.** `ADR-003` requires a total count. `COUNT(*)` across a large filtered set on every
keystroke is the query that quietly takes a database down. Deep `OFFSET` has the same shape of
problem — fine at page 2, pathological at page 6,400, because the database walks every skipped row.

**Decision.** Run an exact count up to **50,000 rows**, and fall back to the query planner's
estimate beyond that. The response carries `totalIsEstimate`; when it is set, the interface
prefixes the number with `~` rather than tagging it "approx".

**Consequences.**

- ✅ Count cost is bounded regardless of dataset size.
- ✅ Every realistic working set — including the whole seeded dataset — is counted exactly.
- ✅ A deletion moves the total immediately, because the count is not cached statistics.
- ⚠️ Very large totals may be off by a small margin, carried by the `~` prefix.

**The threshold was raised from an initial 5,000 during review.** Two problems showed up in use:
an estimate does not move when a row is deleted until the table is analysed, so the total
contradicted what the user had just done; and an "approx" tag beside a figure that happened to be
exactly right read as though the underlying data were unreliable. Both are UX failures caused by
reaching for a scalability technique before the scale justified it.

> The staleness is invisible on a work queue and would be unacceptable on a financial
> reconciliation screen. There, the answer is an exact count over a deliberately narrower filter
> set. **The right answer depends on the screen, not on the technique.**

---

## ADR-006 — No table library

**Status:** Accepted · **Reverses an initial choice**

**Context.** A headless table library was the initial plan and was installed. Reviewing the actual
requirements changed the answer.

With sorting, filtering and pagination all server-side (`ADR-004`), **every row model such a
library exists to provide is bypassed.** What remains is a column configuration and a cell map.

A secondary factor: the current major version is a substantial API rewrite, so adopting it under
deadline meant learning a new surface to obtain functionality already being routed around.

**Decision.** No table library. Column definitions and header/cell mapping are owned directly.
Windowed rendering comes from a dedicated virtualisation library, which *is* doing real work.

**Consequences.**

- ✅ Full control over the render boundary — the requirement in `NFR-P8`.
- ✅ One fewer dependency and one fewer API to track.
- ⚠️ Features that would have come free — column resizing, grouping, pinning — must be built if
  ever needed.

**Generalised as `NFR-M5`:** a dependency whose value you route around is a liability, not an
asset. Applied to this project's own dependencies during review, two unused packages were removed.

---

## ADR-007 — Manifest first, bytes second

**Status:** Accepted

**Context.** A 1 GB `ArrayBuffer` exceeds what a browser tab can hold. Even if it fit, the user
waited minutes to read one page.

**Decision.** Selecting a claim does not fetch a document. It fetches a **manifest** — page count,
dimensions, version — a few kilobytes describing a file that may be a gigabyte. The workspace lays
out the full page extent from that alone. Pages then arrive over **HTTP Range**.

The single most consequential implementation detail:

```ts
disableAutoFetch: true
```

Left at its default, the PDF engine pulls the remaining bytes in the background once the first
page resolves. Acceptable for a 2 MB invoice; fatal for a 1.5 GB bundle. **One option separates a
working viewer from a dead tab.**

**Consequences.**

- ✅ Opening cost is independent of document size (`NFR-P6`).
- ✅ Scroll position is accurate before any page renders.
- ⚠️ Requires storage that supports range requests and exposes the necessary CORS headers.
- ⚠️ The manifest must be trustworthy — a stale page count produces a scrollbar that lies. Hence
  `scripts/sync-catalogue.ts` reconciling catalogue against storage.

---

## ADR-008 — Optimistic annotations, pessimistic page operations

**Status:** Accepted

**Context.** The brief groups edit, split, merge, delete, comments and annotations together. They
differ on the only axis that matters: **whether the operation touches the document bytes.**

**Decision.** The update model follows the cost of being wrong.

| Operation | Touches bytes | Model | Cost of being wrong |
|---|---|---|---|
| Comment / annotation | No | Optimistic | A toast and a rollback |
| Split / remove pages | Yes | Pessimistic, async job | A corrupted claim file |

Annotations are rows anchored to `(documentId, pageIndex, x, y, w, h)` in normalised coordinates,
rendered as an overlay. The binary stays immutable, annotations survive zoom and re-pagination, and
two people can annotate without contending over a file. Burning them into the document happens
once, at export, as its own operation.

**Consequences.**

- ✅ Annotation feels instant; destructive operations feel deliberate.
- ⚠️ Two interaction models in one workspace, which must be taught through the interface —
  immediate for annotations, an explicit progress panel for operations.

**Revisit:** never, for destructive operations. Expensive irreversible work does not get optimistic
UI.

---

## ADR-009 — Page operations as jobs, with idempotency and copy-on-write

**Status:** Accepted

**Context.** Splitting a 1.5 GB document takes far longer than any reasonable HTTP timeout. The
brief requires *"consistent document state after split/merge/comment operations"* and *"handle
partial failures gracefully"*.

**Decision.** The client submits an **intent** — a page list, not bytes — and receives a job
reference. Progress streams over server-sent events. Three properties make it safe:

1. **Copy-on-write.** Output goes to a new object and a new catalogue row. The source is never
   mutated, so a job that dies at 70% leaves it exactly as it was.
2. **Idempotency key.** Resubmitting returns the original job rather than repeating the work —
   which is what makes a retry button safe on an operation that is not naturally idempotent.
3. **Cooperative cancellation.** Cancel is checked between page batches, always *before* any
   write, so cancellation leaves nothing to clean up.

```
submitted ──► queued ──► running ──┬──► committed  (new version)
 (idempotency key)     (SSE: %)    ├──► failed     (source untouched)
                                   └──► cancelled  (nothing written)
```

Job state lives in the database rather than process memory, so the instance serving the progress
stream need not be the one doing the work (`NFR-R5`).

**Consequences.**

- ✅ Reliability requirements `NFR-R1` through `R5` fall out of one mechanism rather than five.
- ✅ Cancel and retry are both genuinely safe.
- ⚠️ Storage grows with every operation; production needs a version-retention policy.
- ⚠️ Copy-on-write means peak storage of source + output during the operation.

---

## ADR-010 — Extend the design system rather than improvise

**Status:** Accepted

**Context.** The supplied Figma is a CRM customers list. Two requirements have no counterpart in
it.

**Decision.** Extend along the existing axes, and record the extension as a designer conversation
rather than resolving it silently.

| Gap | Extension |
|---|---|
| No row actions column exists, but the brief requires Edit / Delete / Assign, each role-gated | An actions column following the existing cell rhythm, disabled state at 38% opacity — matching the export's own `fill-opacity` convention — and a tooltip naming the missing permission |
| The Figma ships two status chips (Active / Inactive); claim workflow needs six | Extended along the same axis: saturated ink on a tinted ground, 6px radius, 1px border of the same hue |

Tokens are read as **exact hex values from the SVG export**, not eyeballed, and declared once so
they compile to utilities.

**Consequences.**

- ✅ New components are visually continuous with the client's standard.
- ✅ The gaps are documented for the design team instead of being quietly invented.
- ⚠️ Requires designer sign-off that a prototype cannot obtain.

---

## ADR-011 — Session as a signed cookie, role-switchable

**Status:** Accepted · **Prototype scope**

**Context.** The case study is not about authentication, but authorisation cannot be demonstrated
without an authenticated subject, and reviewers need to compare roles quickly.

**Decision.** A signed, `httpOnly`, 12-hour session cookie carrying subject, role and team. A role
picker stands in for an identity provider redirect, and a switcher re-issues the session.

**Rationale.** What matters architecturally is the *shape* of what lands in the session and the
fact that it is verified server-side. Wiring a real identity provider would consume the time budget
and demonstrate nothing the brief asks about.

**Consequences.**

- ✅ No credential is reachable from client JavaScript (`NFR-SEC1`).
- ✅ The access model can be exercised across four roles in seconds.
- ⚠️ **Not production authentication.** No identity provider, no refresh, no revocation, no MFA.
  The role switcher would be removed outright.
- ⚠️ Roles are static per user; delegation and temporary elevation are unmodelled.
