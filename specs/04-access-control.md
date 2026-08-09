# 04 — Access control model

The brief is explicit: *"Define where authorization is enforced (backend as source of truth;
frontend for UX)."* This document is that definition.

---

## 4.1 The principle

Authorisation has two halves, and only one of them is visible:

- **Row scope** — which records exist for this session at all. A SQL predicate.
- **Capabilities** — which operations this session may perform. A named permission set.

Both are produced by a **single policy evaluation per request**. That is deliberate: if the row
filter and the capability flags were computed separately they could drift, and a UI could offer an
action on a record the server would refuse.

The capability set is sent to the client so the interface can disable what would fail. **That is a
courtesy, not a control.** The control is the server-side check that runs regardless of what the
client did.

```
request ──► policy evaluation ──┬──► row scope      → folded into the SQL WHERE clause
                                └──► capabilities   → returned to the client for UX
                                                    → re-checked on every mutation
```

---

## 4.2 Roles

| Role | Population | Intent |
|---|---|---|
| `adjudicator` | Large | Works an assigned queue |
| `supervisor` | Medium | Oversees a team; restructures document bundles |
| `auditor` | Small | Reviews anything, changes nothing |
| `admin` | Very small | Full access including deletion |

## 4.3 Row scope

| Role | Scope | Predicate |
|---|---|---|
| `adjudicator` | Own assignments | `assignee_id = :sessionUserId` |
| `supervisor` | Own team | `team_id = :sessionTeamId` |
| `auditor` | Everything | *(none)* |
| `admin` | Everything | *(none)* |

**The predicate is always derived from the session.** It is never read from a query parameter,
request body or header. A caller who manipulates the request can add constraints — narrowing what
they see — but has no mechanism to remove the scope predicate.

Row scope is applied in two places, and both are required:

1. **On read**, in the queue query.
2. **Before every mutation**, re-checked against the target record. Without this second check, an
   adjudicator who learned another team's claim ID could act on it.

## 4.4 Capability matrix

| Capability | `adjudicator` | `supervisor` | `auditor` | `admin` |
|---|:--:|:--:|:--:|:--:|
| `claims.edit` | ✅ | ✅ | — | ✅ |
| `claims.assign` | — | ✅ | — | ✅ |
| `claims.delete` | — | — | — | ✅ |
| `documents.annotate` | ✅ | ✅ | — | ✅ |
| `documents.split` | — | ✅ | — | ✅ |
| `documents.merge` | — | ✅ | — | ✅ |

Reading a claim or a document requires no capability — visibility is governed entirely by row
scope. That keeps the two mechanisms from overlapping: **scope answers "does this exist for me",
capabilities answer "may I change it".**

### Additional constraints beyond the matrix

Some rules are not expressible as a capability alone and are enforced in the relevant route:

| Rule | Enforcement |
|---|---|
| A supervisor may only assign work to members of their own team | Assignee's team compared to session team; mismatch returns 403 |
| An adjudicator may delete only their own annotations; supervisors and admins may delete any | Author predicate added to the delete for adjudicators |
| An operation that would leave a document with zero pages is rejected | Validated in the job before any write |

## 4.5 Response codes

| Situation | Code | Reason |
|---|---|---|
| No valid session | **401** | Not authenticated |
| Authenticated, capability missing | **403** | Names the missing capability, so the client can explain it |
| Record outside row scope | **404** | **Not 403.** Returning 403 would confirm the record exists and disclose the existence of other teams' work |
| Input fails schema validation | **422** | With the failing constraint |

> The 404-not-403 choice for out-of-scope records is the one worth defending in review. 403 is
> more truthful about *why* the request failed, but truthfulness here is an information leak: it
> lets a caller enumerate valid identifiers. The information-hiding response is correct.

## 4.6 Enforcement points

| Layer | Enforces | Trustworthy? |
|---|---|---|
| UI — disabled controls | Nothing | **No.** Cosmetic. Removable from the console |
| UI — capability flags | Nothing | **No.** Server-supplied but client-consumed |
| BFF — session verification | Authentication | **Yes** — signature verified server-side |
| BFF — `requireCapability()` | Action permission | **Yes** — the boundary |
| BFF — row scope predicate | Record visibility | **Yes** — the boundary |
| BFF — schema validation | Input shape | **Yes** — the boundary |
| Database — bound parameters | Injection | **Yes** — defence in depth |

## 4.7 Demonstrating that the boundary is real

The distinction between *enforcing* authorisation and *hiding buttons* is invisible when
everything works — both look identical to a user. So the application ships a control that removes
the client-side check (`US-8 / AC-5`).

With it enabled, every action becomes clickable for every role. **The outcomes do not change.** An
auditor clicking Delete receives a 403 and no record is removed.

This is a deliberate specification decision: a security property that cannot be demonstrated
cannot be reviewed.

## 4.8 What production would add

This model is complete for the case study but is not the whole picture at organisational scale:

| Gap | Production approach |
|---|---|
| Roles are static per user | Delegation, temporary elevation, out-of-office reassignment |
| Policy is a typed module in the BFF | A policy service, so authorisation changes do not require a frontend deploy — deferred until the rules stabilise, since extracting the layer early makes rules harder to read, not easier |
| No audit trail of authorisation decisions | Denials logged with subject, capability and target for compliance review |
| Team membership is a single identifier | Hierarchical org units, so a regional manager sees several teams |
