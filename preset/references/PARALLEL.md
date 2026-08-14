# Parallel Development Workflow

## Admission test

Two features may run concurrently only when all are true:

- each has an approved contract and named owner;
- allowed paths and interfaces are explicit;
- no unresolved dependency edge exists between them;
- they do not both own the same schema migration or shared hotspot;
- code, runtime ports, test data and mutable services are isolated;
- integration order and shared baseline are known.

If any answer is unknown, default to serial execution.

## Isolation model

| Concern | Required isolation |
|---|---|
| Code | One branch and preferably one Git worktree per feature |
| Runtime | Separate process/container and port |
| Database | Separate disposable database/schema or deterministic fixture namespace |
| Queue/cache | Separate namespace |
| Files/uploads | Separate temporary storage |
| External APIs | Mock/sandbox accounts or unique test tenants |
| State | Separate Feature directory and Handoff |

## Ownership

- Each shared interface or file has one integration owner.
- Cross-feature changes are proposed through a contract update, not silently edited by both workers.
- A feature that depends on another consumes the approved interface contract, not the other Agent's chat transcript.

## Synchronization points

Synchronize only at contract approval, public interface changes, base refresh, ready-for-integration and release planning. Excessive live coordination is a sign that the work was not truly parallelizable.

## Conflict handling

Textual conflict: return to owning feature, rebase/merge according to project policy, rerun checks.

Semantic conflict without textual overlap: integration reviewer records the incompatible assumptions and requests a human or architecture decision. Do not let the later branch silently win.

Write that adjudication request per `references/HUMAN_COMMUNICATION.md` — assume the reader does not understand IT at all. This stacks with the standing readability rule (FB-20260717-003: conclusion first, one item per line as a full sentence, internal IDs explained on first use) rather than replacing it: FB-20260717-003 solves *"the reader did not watch the process"*, `HUMAN_COMMUNICATION.md` solves *"the reader does not understand the technology"*. A semantic conflict is hard to see precisely because nothing looks broken — the code merges cleanly and both branches pass their own tests — so do not describe it as two incompatible assumptions about an interface. Describe what each branch believes should happen to the user, and what the user will actually experience if both ship as-is (e.g. "A 认为一张订单退款后还能再退剩余部分，B 认为退过就不能再退；两个都合进去的话，同一张单子在订单页和财务页会显示成不同的状态"). Then ask which behaviour is correct for the business, and say which branch has to change once he picks.

