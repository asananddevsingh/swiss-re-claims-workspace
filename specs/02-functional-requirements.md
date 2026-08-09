# 02 — Functional requirements

Six epics, 21 user stories. Acceptance criteria are written to be executable by hand — the manual
test script in the project README follows them directly.

Priority: **Must** = required by the source brief · **Should** = strongly implied · **Could** =
improves the result without being asked for.

---

## Epic FR-1 — Claims queue

> *"Landing page data grid: display 20,000+ records with sorting, filtering, and row actions."*

### US-1 — See the claims queue · Must

**As an** adjudicator **I want** to open a list of claims **so that** I can pick up work.

- **AC-1** — Landing on `/claims` shows a table of claims without further navigation.
- **AC-2** — The dataset contains at least 20,000 records.
- **AC-3** — Each row shows claimant, insured party, claim reference, amount, intake channel,
  assignee and status.
- **AC-4** — The first page is interactive within the budget in `NFR-P1`.

### US-2 — Page through the queue · Must

**As an** adjudicator **I want** numbered pages **so that** I can navigate a large queue and refer
to positions when discussing work with colleagues.

- **AC-1** — Numbered page controls with previous/next are present.
- **AC-2** — A total entry count is displayed.
- **AC-3** — Moving between pages does not clear the table to an empty state — the previous page
  remains visible until the next resolves.
- **AC-4** — Jumping to the last page performs comparably to page 2 (`NFR-P3`).
- **AC-5** — Where the total is an estimate rather than an exact count, it is visibly marked as
  approximate and the reason is available on hover.

### US-3 — Sort the queue · Must

**As an** adjudicator **I want** to sort by column **so that** I can triage by value or recency.

- **AC-1** — Claimant, amount and status are sortable; clicking a header toggles direction.
- **AC-2** — Sorting is applied across the **entire** result set, not only the current page.
- **AC-3** — The active sort column and direction are exposed to assistive technology via
  `aria-sort`.
- **AC-4** — A sort field outside the permitted set is rejected by the server (`AC` shared with
  `US-21`).

### US-4 — Filter and search · Must

**As an** adjudicator **I want** to search and filter **so that** I can find a specific claim
without paging.

- **AC-1** — Free-text search matches claimant, claim reference, insured party and policy number.
- **AC-2** — Status and intake channel can each be filtered to a single value.
- **AC-3** — Typing does not issue one request per keystroke (`NFR-P4`).
- **AC-4** — Changing any filter returns to page 1.
- **AC-5** — Filtering is applied server-side, before the row scope is lifted — a filter can never
  reveal a record the role cannot see.

### US-5 — Understand what I am looking at · Should

**As any** user **I want** to see which slice of claims I am viewing **so that** I do not mistake
a filtered queue for the whole book.

- **AC-1** — The queue header states the active scope in words ("Assigned to you", "Team claims",
  "All claims").
- **AC-2** — Summary figures above the queue reflect the same scope, not the global totals.

---

## Epic FR-2 — Access control

> *"Records and UI actions must be filtered/controlled by user permissions. Define where
> authorization is enforced (backend as source of truth; frontend for UX)."*

### US-6 — Only see claims I am entitled to · Must

**As an** adjudicator **I want** my queue limited to my own assignments **so that** I am not
exposed to colleagues' work.

- **AC-1** — An adjudicator's result set contains only claims assigned to them.
- **AC-2** — A supervisor's contains only claims owned by their team.
- **AC-3** — An auditor's and an administrator's contain all claims.
- **AC-4** — The scope predicate is derived server-side from the session and is **never** accepted
  from the request.
- **AC-5** — Tampering with request parameters can narrow a result set but can never widen it.

### US-7 — Row actions reflect my permissions · Must

**As any** user **I want** actions I cannot perform to be visibly unavailable **so that** I do not
attempt work that will fail.

- **AC-1** — Actions the role lacks are rendered disabled, not hidden, so the capability model is
  discoverable.
- **AC-2** — A disabled action names the missing permission on hover.
- **AC-3** — Capabilities are delivered by the server alongside the data, derived from the same
  policy evaluation that produced the row scope.

### US-8 — Authorisation holds without the interface · Must

**As a** security reviewer **I want** the server to reject unauthorised operations regardless of
client behaviour **so that** the interface is not the control.

- **AC-1** — Every mutating endpoint re-checks the required capability against the session.
- **AC-2** — A request for an operation the role lacks returns **403** with the missing capability
  named, and no state changes.
- **AC-3** — A request with no valid session returns **401**.
- **AC-4** — Requesting a record outside the caller's row scope returns **404**, not 403 — the
  existence of out-of-scope records is not disclosed.
- **AC-5** — The application provides a means to disable client-side permission checks so that
  `AC-2` can be demonstrated without developer tooling.

> `AC-5` exists because the difference between enforcing authorisation and merely hiding buttons
> is invisible when everything works. It has to be demonstrable.

### US-9 — Exercise the model across roles · Should

**As a** reviewer **I want** to switch role without re-authenticating **so that** I can compare
behaviour directly.

- **AC-1** — A role switcher re-issues the session.
- **AC-2** — Cached data is invalidated on switch, so the queue reflects the new scope immediately.

---

## Epic FR-3 — Claim row to document workspace

> *"Selecting a row opens associated documents sized 1500 MB–1 GB. Propose design patterns keeping
> in user experience; ensure smooth transition from grid to workspace."*

### US-10 — Open a claim's documents · Must

**As an** adjudicator **I want** to open the document from its claim row **so that** I can assess
the evidence.

- **AC-1** — Activating a row navigates to that claim's workspace.
- **AC-2** — The workspace opens showing claim context immediately — it does not block on the
  document.
- **AC-3** — Claim context is served from data already held, without a redundant request.
- **AC-4** — A claim outside the caller's row scope is not reachable (`US-8 / AC-4`).

### US-11 — Never wait on a blank screen · Must

**As an** adjudicator **I want** continuous feedback while a large document opens **so that** I can
tell the system is working.

- **AC-1** — Document structure is described by a manifest retrieved independently of the bytes.
- **AC-2** — The full page extent is laid out from the manifest, so the scroll position is accurate
  before any page has rendered.
- **AC-3** — Pages show placeholders at correct proportions until rasterised.
- **AC-4** — A document whose bytes are unavailable produces an explanatory message, not a spinner
  that never resolves.

---

## Epic FR-4 — Working with a very large document

> *"Document workspace: view large documents efficiently."*

### US-12 — Read a document larger than memory · Must

**As an** adjudicator **I want** to read any page of a multi-gigabyte file **so that** document
size does not constrain my work.

- **AC-1** — Opening a document never transfers the whole file.
- **AC-2** — Page content is retrieved by byte range; the server answers with **206 Partial
  Content** and a correct `Content-Range`.
- **AC-3** — Automatic background fetching of the remainder is disabled.
- **AC-4** — The proxy streams ranges without buffering whole objects in memory.
- **AC-5** — Requesting a document without a session returns **401**.

### US-13 — Scroll a long document smoothly · Must

**As an** adjudicator **I want** responsive scrolling through thousands of pages **so that**
navigation is not a chore.

- **AC-1** — Only pages near the viewport are mounted; the count stays bounded regardless of
  document length (`NFR-P5`).
- **AC-2** — Rendering for a page that leaves the viewport is cancelled rather than left to
  complete.
- **AC-3** — Document parsing runs off the main thread.
- **AC-4** — Page numbers are visible while scrolling.

### US-14 — Zoom · Should

**As an** adjudicator **I want** to change page scale **so that** I can read fine print.

- **AC-1** — Zoom controls step through discrete scales.
- **AC-2** — Pages re-rasterise at the new scale.
- **AC-3** — Annotations stay correctly positioned across zoom changes.

---

## Epic FR-5 — Annotations and comments

> *"Add page-level comments, provide annotations on the documents."*

### US-15 — Comment on a specific place on a page · Must

**As an** adjudicator **I want** to attach a comment to a region of a page **so that** findings are
anchored to evidence.

- **AC-1** — A region can be drawn on any page and a comment attached.
- **AC-2** — The marker appears without waiting for a round-trip; failure reverts it and explains
  why.
- **AC-3** — Coordinates are stored normalised (0–1) relative to page dimensions.
- **AC-4** — The document binary is not modified by annotating.
- **AC-5** — Annotations require the `documents.annotate` capability; without it the control is
  disabled and the endpoint returns **403**.

### US-16 — Review all comments on a document · Must

**As an** adjudicator **I want** a list of every comment **so that** I can review findings without
scrolling the whole file.

- **AC-1** — Comments are listed with their page number and author.
- **AC-2** — The list stays consistent with the markers drawn on pages.

### US-17 — Remove a comment · Should

**As an** adjudicator **I want** to delete a comment **so that** mistakes are not permanent.

- **AC-1** — Deletion is confirmed before it happens.
- **AC-2** — An adjudicator may delete only their own comments; supervisors and administrators may
  delete any.

---

## Epic FR-6 — Page operations

> *"Support operations: edit, split, merge, delete… consistent document state after split/merge/
> comment operations; handle partial failures gracefully."*

### US-18 — Split pages into a new document · Must

**As a** supervisor **I want** to extract a page range **so that** parts of a bundle can be routed
separately.

- **AC-1** — Pages can be selected individually or by range expression (e.g. `1-8, 42`).
- **AC-2** — Submitting returns immediately with a job reference; the request does not block for
  the duration of the work.
- **AC-3** — The result is a **new** document version; the source is unchanged.
- **AC-4** — Requires the `documents.split` capability.
- **AC-5** — An operation that would leave zero pages is rejected.

### US-19 — Merge documents · Must

**As a** supervisor **I want** to combine documents **so that** related evidence forms one bundle.

- **AC-1** — Accepts multiple source documents and produces one new document.
- **AC-2** — Requires the `documents.merge` capability.
- **AC-3** — Sources are unchanged.

> **Status: partial.** The API and job pipeline accept `kind: "merge"` and the execution path is
> shared with split. There is no user interface for choosing a second document. Recorded honestly
> rather than marked complete — see `07-traceability.md`.

### US-20 — Track, cancel and safely retry long operations · Must

**As a** supervisor **I want** progress and a cancel control **so that** I am not stuck waiting on
an operation I no longer want.

- **AC-1** — Progress is pushed to the client as it changes, not polled by the interface.
- **AC-2** — Percentage complete and the operation's state are both visible.
- **AC-3** — A running operation can be cancelled and stops promptly.
- **AC-4** — Cancelling leaves **no** partial output and the source document untouched.
- **AC-5** — Resubmitting the same operation returns the original job rather than performing the
  work twice.
- **AC-6** — A failed operation leaves the source document intact and can be retried safely.
- **AC-7** — The progress stream closes itself when the operation reaches a terminal state.

---

## Cross-cutting

### US-21 — Reject malformed and hostile input · Must

**As a** security reviewer **I want** every input validated at the server boundary **so that**
client-side validation is not load-bearing.

- **AC-1** — Query parameters are validated against a schema; violations return **422** with the
  reason.
- **AC-2** — Sort fields and filter values are constrained to enumerations — no request value is
  ever interpolated into SQL as an identifier.
- **AC-3** — All data values reach the database as bound parameters.
- **AC-4** — Page size is bounded, so a request cannot ask for an unbounded result set.
