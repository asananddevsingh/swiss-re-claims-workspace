# Specification — Claims Adjudication Workspace

**Live application → [swiss-re-claims-workspace.vercel.app/claims](https://swiss-re-claims-workspace.vercel.app/claims)**

The requirement set this application is built against. Everything here is traceable in two
directions: each requirement points at the code that satisfies it, and each significant piece of
code points back at the requirement that justifies it.

## Documents

| # | Document | What it settles |
|---|---|---|
| 01 | [Product brief](01-product-brief.md) | The problem, who uses it, what is in and out of scope, and every ambiguity in the source brief with the reading taken |
| 02 | [Functional requirements](02-functional-requirements.md) | Epics and user stories with testable acceptance criteria |
| 03 | [Non-functional requirements](03-non-functional-requirements.md) | Performance budgets, scalability targets, accessibility and security requirements |
| 04 | [Access control model](04-access-control.md) | Roles, capabilities, row scope, and where each is enforced |
| 05 | [API contract](05-api-contract.md) | Every endpoint, its inputs, outputs and status codes |
| 06 | [Decision records](06-decision-records.md) | The eleven decisions that shaped the build, with alternatives and costs |
| 07 | [Traceability matrix](07-traceability.md) | Requirement → implementation → verification |

## How requirements are identified

| Prefix | Meaning | Example |
|---|---|---|
| `FR-` | Functional requirement | `FR-2.3` |
| `NFR-` | Non-functional requirement | `NFR-P1` |
| `US-` | User story | `US-14` |
| `AC-` | Acceptance criterion | `US-14 / AC-2` |
| `ADR-` | Architecture decision record | `ADR-004` |

## Reading order

Start with the [product brief](01-product-brief.md) for context, then the
[decision records](06-decision-records.md) — those carry the reasoning that the rest of the
documents assume. The [traceability matrix](07-traceability.md) is the fastest way to check
coverage.

## Status

Every requirement marked **Must** is implemented and verified, with one exception recorded openly:
`US-19` (merge two documents) has a working API and job pipeline but no user interface. It is
listed as **partial** in the traceability matrix rather than quietly dropped.
