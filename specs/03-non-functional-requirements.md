# 03 — Non-functional requirements

Targets are written as numbers wherever a number is meaningful. A requirement nobody can fail is
not a requirement.

---

## Performance

| ID | Requirement | Target | How it is met |
|---|---|---|---|
| **NFR-P1** | Queue is interactive on load | Interactive within **2 s** on a warm connection | Server-side paging; only 50 rows cross the wire |
| **NFR-P2** | Rows in the DOM stay bounded | **≤ 20** row elements regardless of page size or dataset size | Windowed rendering with overscan |
| **NFR-P3** | Deep pages stay usable | Last page within **1.5×** the time of page 2 at the seeded size | Ordering served by a composite index; `ADR-012` covers why offset rather than keyset |
| **NFR-P4** | Typing does not flood the network | **One** request per 300 ms of typing, at most | Debounced input folded into the query key |
| **NFR-P5** | Document memory stays bounded | **≤ 8** page canvases mounted at once, irrespective of page count | Virtualised page list with recycling |
| **NFR-P6** | Opening a large document is cheap | **< 500 KB** transferred to open a 1.5 GB document at an arbitrary page | Manifest + byte-range fetching only for visible pages |
| **NFR-P7** | Scrolling does not block the main thread | No main-thread task **> 50 ms** attributable to document parsing | Parsing in a Web Worker; stale renders cancelled |
| **NFR-P8** | Re-renders are contained | Scrolling the queue re-renders **only** rows entering or leaving the window | Per-row memoisation; no React Context near the grid |

### Explicitly rejected performance approaches

- **Loading all 20,000 rows client-side.** It would fit today at roughly 8 MB of JSON, and it fails
  at 200,000. More importantly, row-level access control cannot be enforced on a dataset the
  client already holds.
- **Client-side sorting and filtering.** Same reason, plus it would produce results inconsistent
  with the server's row scope.
- **`COUNT(*)` on every filter change.** The query that takes a database down at scale — see
  `ADR-005`.

---

## Scalability

| ID | Requirement | Target |
|---|---|---|
| **NFR-S1** | Record growth | Design holds to **1,000,000+** claims with no client change; only the database index strategy is revisited |
| **NFR-S2** | Document size growth | Viewing path is size-independent — a 5 GB document opens the same way as a 100 MB one |
| **NFR-S3** | Concurrent operations | Long operations run outside the request/response cycle so a slow job never occupies a request handler |
| **NFR-S4** | Concurrent editors | **One** editor per document assumed. Concurrent annotation is last-write-wins |

> **NFR-S4 is a deliberate limit.** Genuine simultaneous editing needs CRDTs or server-ordered
> operations. That is a substantial cost, and the work is assigned one adjudicator per claim, so
> the evidence for paying it does not exist yet. Revisit if usage shows otherwise.

---

## Reliability

| ID | Requirement | How it is met |
|---|---|---|
| **NFR-R1** | A document is never left in a partial state | Copy-on-write: output goes to a new object and version; the pointer moves only on success |
| **NFR-R2** | Failure mid-operation is recoverable | Source untouched, so retry is always safe |
| **NFR-R3** | Repeating a request does not repeat the work | Idempotency key on every operation submission |
| **NFR-R4** | Cancellation leaves nothing behind | Cancel checked between page batches, before any write |
| **NFR-R5** | Progress survives a change of server instance | Job state persisted in the database, not in process memory |
| **NFR-R6** | Failures are explained, not swallowed | Errors surface the status and the reason; capability failures name the missing capability |

---

## Usability

| ID | Requirement |
|---|---|
| **NFR-U1** | Every operation taking longer than ~500 ms shows progress with a real percentage, not an indeterminate spinner |
| **NFR-U2** | Destructive actions are confirmed before they run |
| **NFR-U3** | Unavailable actions are disabled rather than hidden, and state why |
| **NFR-U4** | Paging and filtering never blank the table |
| **NFR-U5** | The active data scope is stated in words, so a filtered view is not mistaken for the whole book |
| **NFR-U6** | Errors state what happened and what to do; no bare "something went wrong" where the cause is known |

---

## Accessibility

Target: **WCAG 2.1 AA**.

| ID | Requirement | Status |
|---|---|---|
| **NFR-A1** | Grid exposes table semantics to assistive technology despite virtualised rendering | Met — ARIA grid roles |
| **NFR-A2** | Sortable headers expose sort state via `aria-sort` | Met |
| **NFR-A3** | All actions are keyboard reachable with a visible focus indicator | Met |
| **NFR-A4** | Icon-only controls carry accessible names | Met |
| **NFR-A5** | Text meets 4.5:1 contrast; UI components 3:1 | Met — palette inherited from the client's own design standard |
| **NFR-A6** | `prefers-reduced-motion` is honoured | Met |
| **NFR-A7** | Annotation overlay is operable without a pointer | **Not met** — drawing a region requires a pointer. Recorded openly; the surface needs a keyboard-driven coordinate entry path |

---

## Security

| ID | Requirement | How it is met |
|---|---|---|
| **NFR-SEC1** | No credential is reachable from JavaScript | Session is an `httpOnly` cookie; no bearer token in client memory |
| **NFR-SEC2** | Authorisation is enforced server-side on every mutating request | `requireCapability()` in each route |
| **NFR-SEC3** | Row scope is derived from the session, never from the request | Predicate built server-side |
| **NFR-SEC4** | No request value is interpolated into SQL as an identifier | Sort and filter fields constrained to enumerations; values bound as parameters |
| **NFR-SEC5** | Input validated at the boundary against a schema | Schema validation on every route; 422 on violation |
| **NFR-SEC6** | Out-of-scope records are not disclosed | 404 rather than 403 for records outside row scope |
| **NFR-SEC7** | Session tokens are signed and expire | Signed, 12-hour expiry |
| **NFR-SEC8** | Secrets are never committed | Environment variables only; `.env.example` carries placeholders |

---

## Maintainability

| ID | Requirement |
|---|---|
| **NFR-M1** | Authorisation rules live in one module — adding a role touches one file |
| **NFR-M2** | Request and response shapes are declared once and shared between validation and types |
| **NFR-M3** | Design tokens are declared once, from the source design export, and consumed as utilities |
| **NFR-M4** | Substituted infrastructure is isolated behind a single module so the substitution is visible |
| **NFR-M5** | No dependency is present that the application does not use |

> **NFR-M5 was applied to this project's own dependencies during review**: two packages were
> present but imported nowhere, and were removed. A dependency whose value you route around is a
> liability rather than an asset.
