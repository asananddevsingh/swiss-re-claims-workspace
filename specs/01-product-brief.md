# 01 — Product brief

## 1.1 Problem

ABC Insurance processes claims that arrive through mixed channels — email, SFTP drops, structured
feeds and unstructured attachments. The existing adjudication system is legacy technology and is
being rebuilt on a modern UI stack.

The work is data-heavy and document-heavy at the same time, and those are two different
engineering problems sharing one application:

- **Wide and shallow.** Tens of thousands of claims in a queue, filtered and sorted many ways,
  where an adjudicator needs the right ten rows quickly.
- **Narrow and deep.** A single claim file of 100 MB to 1.5 GB, where the adjudicator needs page
  3,412 and nothing else — and then needs to split it.

They fail in different ways. The grid fails by re-rendering; the document fails by exhausting
memory. Any design that applies one strategy to both will be slow in two directions at once.

## 1.2 Users

| Persona | Role in the system | What they need |
|---|---|---|
| **Claims Adjudicator** | `adjudicator` | Works an assigned queue. Reads documents, annotates findings, updates claim status. Must not see other adjudicators' work. |
| **Team Supervisor** | `supervisor` | Oversees a team's queue. Reassigns work, restructures document bundles. Cannot delete claims. |
| **Auditor** | `auditor` | Reviews any claim in the organisation for compliance. Read-only, without exception. |
| **Administrator** | `admin` | Full access including deletion. Small population. |

Row visibility differs per persona and is a hard requirement, not a convenience — an adjudicator
seeing another team's claims is a data protection failure, not a UI inconvenience.

## 1.3 Scope

### In scope

- Claims queue with server-side sort, filter and pagination over 20,000+ records
- Row actions: edit, delete, assign — each gated by role
- Role-based access with both row-level filtering and action-level control
- Transition from a claim row into a document workspace
- Viewing documents too large to load into browser memory
- Page-level annotations and comments
- Page operations: split, remove pages, merge
- Progress, cancellation and safe retry for long-running operations

### Out of scope

Deliberately excluded, to be named rather than silently omitted:

- Authentication against a real identity provider. Sessions are signed cookies with a role picker;
  the *shape* of what lands in the session is what matters architecturally.
- Claim intake from email, SFTP or feeds. The brief describes these as the source of claims, but
  the case study is about what happens after they arrive.
- Document OCR, classification or risk scoring.
- Reporting and analytics dashboards.
- Real-time multi-user collaboration on the same page (see `NFR-S4` for the position taken).

## 1.4 Ambiguities in the source brief, and the reading taken

The source brief contains contradictions. Each is recorded with the interpretation chosen, so the
reasoning is reviewable rather than buried.

| # | Ambiguity | Reading taken | Why |
|---|---|---|---|
| A1 | Document size is given as **100 MB–1 GB** in the Context section and **1500 MB–1 GB** in the functional requirements | Design for up to **~1.5 GB** | Every technique that survives 1.5 GB also survives 100 MB. The reverse is not true, so the wider reading is the safe one. |
| A2 | *"Use pagination or justify an alternative"* | **Pagination**, with virtualised rendering inside it | The supplied Figma specifies numbered pagination with a total count (*"Showing data 1 to 8 of 256K entries"*). The client's design standard settles it. See `ADR-003`. |
| A3 | The Figma is a **CRM customers list**, introduced with *"e.g."* | Treat it as the **UI standard**, not the screen to build | The case study calls it an example of company UX/UI standards. The task is to apply that visual language to claims screens that do not exist in the Figma. |
| A4 | The Figma has **no row actions column**, but the brief requires Edit / Delete / Assign | **Extend** the design system, and document the extension | Recorded in `ADR-010` as a designer conversation rather than an improvisation. |
| A5 | *"edit"* as a document operation is unspecified — page-level or content-level? | **Page-level** (reorder, remove), not content editing | Content editing a 1.5 GB PDF in-browser is not achievable within any reasonable reading of the brief. Page structure editing is, and is what "split, merge, delete" implies. |
| A6 | Concurrency expectations are unstated | Assume **one adjudicator per claim at a time** | Matches how the work is assigned. Position on the alternative recorded in `NFR-S4`. |

## 1.5 Assumptions about the wider system

The brief asks for *"backend API assumptions"*, which implies the domain services belong to other
teams. This application therefore assumes — and defines a contract against — the following, rather
than claiming to own them:

| Assumed service | What it provides | What this application assumes |
|---|---|---|
| **Claims service** | Claim records, status transitions, assignment | Records are queryable with filter, sort and pagination; a claim carries an owning team and an assignee |
| **Document service** | Document metadata and byte storage | Objects are addressable by key and support HTTP Range requests; documents are versioned |
| **Rasterisation service** | Page images and thumbnails | Can produce per-page renderings for documents too large to parse client-side |
| **Identity provider** | Authenticated user with role and team | Emits a subject, a role, and a team identifier |

Where this prototype substitutes a local implementation for one of these, it is isolated behind a
single module so the substitution is visible and replaceable — `src/lib/storage.ts` for object
access being the clearest example.

## 1.6 Glossary

| Term | Meaning |
|---|---|
| **Adjudication** | Assessing a claim and deciding the outcome |
| **Bundle** | The consolidated document file attached to a claim — the large one |
| **Capability** | A named permission such as `claims.delete`, held by a role |
| **Row scope** | The subset of records a session may see at all, expressed as a SQL predicate |
| **Manifest** | Small JSON description of a large document: page count, dimensions, version |
| **Copy-on-write** | Writing operation output to a new object and version, never mutating the source |
| **Idempotency key** | Caller-supplied token making a repeated submission return the original result rather than repeating the work |
| **BFF** | Backend-for-frontend; a thin server layer owned by the frontend team |
