# 05 — API contract

Every endpoint the client depends on. All routes require a valid session unless noted; all return
`401` without one.

Conventions: request query and body are validated against a schema at the boundary, violations
return `422`, and records outside the caller's row scope return `404` (see `04-access-control.md`).

---

## Session

### `POST /api/session`

Issues a session. Stands in for an identity provider redirect.

**Body**

```json
{ "role": "adjudicator | supervisor | auditor | admin" }
```

**Response `200`** — sets an `httpOnly`, `sameSite=lax`, 12-hour signed cookie.

```json
{ "ok": true, "role": "supervisor" }
```

### `GET /api/session`

**Response `200`** — the current session, or `null`.

```json
{ "session": { "userId": "u-marco", "name": "Marco Rossi", "role": "supervisor", "teamId": "team-zrh" } }
```

---

## Claims

### `GET /api/claims`

The queue. Row scope is applied server-side from the session.

**Query**

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `q` | string ≤ 120 | — | Matches claimant, claim ref, insured, policy number |
| `status` | enum | — | `New` · `In Review` · `Awaiting Docs` · `Approved` · `Rejected` · `Settled` |
| `channel` | enum | — | `Email` · `SFTP` · `Portal` · `API` |
| `type` | enum | — | `Property` · `Motor` · `Liability` · `Health` · `Marine` |
| `sort` | enum | `updated_at` | `updated_at` · `amount` · `claimant` · `status` — **enumerated, never interpolated** |
| `dir` | enum | `desc` | `asc` · `desc` |
| `page` | int 1–100000 | `1` | |
| `pageSize` | int 10–200 | `50` | Bounded, so no request can ask for an unbounded set |

**Response `200`**

```json
{
  "rows": [
    {
      "id": "clm-000001",
      "claimRef": "CLM-2026-100000",
      "claimant": "Jane Cooper",
      "insured": "Helvetia Logistics AG",
      "policyNo": "POL-482913",
      "claimType": "Marine",
      "channel": "SFTP",
      "amount": 148320.5,
      "currency": "CHF",
      "status": "In Review",
      "assigneeId": "u-anna",
      "assigneeName": "Anna Weber",
      "documentId": "doc-claims-bundle",
      "updatedAt": "2026-08-02T09:14:00.000Z"
    }
  ],
  "total": 9890,
  "totalIsEstimate": true,
  "page": 1,
  "pageSize": 50,
  "pageCount": 198,
  "capabilities": ["claims.edit", "claims.assign", "documents.annotate"],
  "scope": "Team claims"
}
```

`capabilities` and `scope` come from the same policy evaluation that produced the row filter — see
`04-access-control.md §4.1`.

`totalIsEstimate` is `true` when the count came from the query planner rather than an exact
`COUNT(*)`. The client must surface this rather than present an estimate as fact (`US-2 / AC-5`).

### `PATCH /api/claims/:id`

Requires `claims.edit`.

**Body** — at least one of:

```json
{ "claimant": "string", "status": "<enum>", "amount": 12345.67 }
```

**Responses** — `200` · `403` capability · `404` out of scope · `422` empty or invalid patch

### `DELETE /api/claims/:id`

Requires `claims.delete` — **administrator only**.

**Responses** — `200` · `403` · `404`

### `POST /api/claims/:id/assign`

Requires `claims.assign`. A supervisor may only assign within their own team.

**Body**

```json
{ "assigneeId": "u-lukas" }
```

`null` unassigns.

**Responses** — `200` · `403` capability or cross-team · `404` · `422` unknown assignee

### `GET /api/claims/:id/assign`

Candidate assignees.

```json
{ "assignees": [{ "id": "u-lukas", "name": "Lukas Keller", "team_id": "team-zrh" }] }
```

---

## Documents

### `GET /api/documents/:id/manifest`

The small description of a potentially enormous document. Retrieved before any bytes, and
sufficient to lay out the entire page extent.

**Response `200`**

```json
{
  "id": "doc-claims-bundle",
  "filename": "claim-bundle-2026.pdf",
  "version": 1,
  "pageCount": 2400,
  "declaredSize": 1476395008,
  "actualSize": 3967780,
  "available": true,
  "streamUrl": "/api/documents/doc-claims-bundle/stream",
  "pageSize": { "width": 595, "height": 842 },
  "capabilities": ["documents.annotate", "documents.split"]
}
```

> `declaredSize` is the catalogue's production figure; `actualSize` is what is present in storage.
> Reporting both is deliberate — the prototype does not pretend its fixture is 1.5 GB. `available`
> lets the client render an explanatory state rather than an unresolving spinner (`US-11 / AC-4`).

### `GET /api/documents/:id/stream`

Byte-range proxy. **The endpoint the large-document design depends on.**

**Request headers**

| Header | Behaviour |
|---|---|
| `Range: bytes=<start>-<end>` | Explicit window |
| `Range: bytes=-<n>` | Suffix — the last *n* bytes. Used to locate the PDF cross-reference table |
| *(absent)* | Whole object |

**Responses**

- `206 Partial Content` with `Content-Range: bytes <start>-<end>/<total>` and `Accept-Ranges: bytes`
- `200` for a full request
- `404` when the object is absent from storage

The handler streams the requested window and **never buffers a whole object**, which is what makes
it as cheap for 1.5 GB as for 5 MB (`NFR-P6`).

`HEAD` is supported for size discovery.

### `GET /api/documents/:id/annotations`

```json
{
  "annotations": [
    {
      "id": "ann-0",
      "pageIndex": 0,
      "kind": "note",
      "x": 0.12, "y": 0.18, "w": 0.34, "h": 0.06,
      "body": "Policy excess confirmed against schedule.",
      "authorId": "u-marco",
      "authorName": "Marco Rossi",
      "createdAt": "2026-08-09T12:00:00.000Z"
    }
  ]
}
```

Coordinates are **normalised 0–1** relative to page dimensions, so annotations survive zoom,
re-rasterisation and re-pagination (`US-15 / AC-3`).

### `POST /api/documents/:id/annotations`

Requires `documents.annotate`.

```json
{ "pageIndex": 0, "kind": "highlight | note | box", "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.05, "body": "…" }
```

**Response `200`** — the created annotation, including its server-assigned id.

### `DELETE /api/documents/:id/annotations?annotationId=<id>`

Requires `documents.annotate`. Adjudicators may delete only their own.

---

## Page operations

### `POST /api/documents/:id/operations`

Submits an **intent** — a page list, not bytes — and returns immediately.

```json
{
  "kind": "split | merge | delete_pages",
  "pages": [0, 1, 2],
  "idempotencyKey": "doc-claims-bundle:split:0,1,2"
}
```

**Responses**

- `202 Accepted` — `{ "jobId": "job-…", "replayed": false }`
- `200` — `{ "jobId": "job-…", "replayed": true }` when the idempotency key has been seen before
- `403` — missing `documents.split` / `documents.merge`
- `422` — invalid page list

> **On the idempotency key.** Splitting is expensive and not naturally idempotent — running it
> twice produces two documents. The key makes a retry after a network failure safe, which is what
> allows the interface to offer a retry button at all (`NFR-R3`).

### `GET /api/documents/:id/operations`

Recent jobs for a document, newest first.

### `GET /api/jobs/:id/events`

Progress as **server-sent events**. The client is pushed to rather than polling.

```
event: progress
data: {"status":"running","progress":36,"totalPages":2200,"message":null}

event: progress
data: {"status":"done","progress":100,"totalPages":2200,"message":"Created doc-… with 120 pages"}
```

`status` is one of `queued` · `running` · `done` · `failed` · `cancelled`. The stream **closes
itself** on a terminal state, so neither side holds an idle connection (`US-20 / AC-7`).

Progress is read from persisted job state, so the instance serving the stream need not be the one
performing the work (`NFR-R5`).

### `DELETE /api/jobs/:id`

Cooperative cancellation. Flips the job state; the worker observes it between page batches and
stops **before writing anything** — so there is no partial output to clean up (`NFR-R4`).

**Response `200`** — `{ "ok": true }`

---

## Error shape

Uniform across every endpoint:

```json
{ "error": "Your role does not permit this action", "capability": "claims.delete" }
```

| Field | When |
|---|---|
| `error` | Always — human-readable |
| `capability` | On `403` — names the missing capability so the client can explain it precisely |
| `issues` | On `422` — the failing validation constraints |
