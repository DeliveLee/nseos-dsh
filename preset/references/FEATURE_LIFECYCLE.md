# Feature Lifecycle Workflow

## 1. Intake

Capture a single business outcome, not a bag of unrelated changes. Assign an ID and state `DRAFT`.

## 2. Discovery

- inspect existing behavior and constraints;
- map users, permissions and journeys;
- classify product completeness items;
- identify interfaces, dependencies, data and operational impact;
- define explicit non-goals;
- write observable acceptance criteria.

Output: Feature Contract and Implementation Plan in `AWAITING_APPROVAL`.

## 3. Approval

The Product Owner approves scope; the Technical Owner approves material interface/schema/architecture changes; security or data owners approve high-risk access. Record the decision and set `APPROVED`.

## 4. Isolated implementation

Create or confirm a dedicated branch/worktree. Set `IN_PROGRESS`. Implement the smallest plan step, add tests, and keep unrelated changes untouched.

## 5. Verification loop

Set `VERIFYING`. Execute deterministic checks and independent review. Only P0/P1 or specifically approved P2 findings return to `NEEDS_FIX`. Respect the loop budget. For user-facing changes, drive the actually running application through every affected flow; a mock or stub stack does not stand in for the real path when the requirement or the reported bug concerns that real path.

## 6. Handoff

When all gates pass, create a standalone Handoff and set `READY_FOR_INTEGRATION`. The handoff must allow a new session to continue without old chat context.

Absent real live-path evidence (screenshot, console, network, real HTTP response, real DB readback or CLI output), set `PENDING_LIVE_VERIFY` instead: tests plus code reading never reach a done, verified, `READY_FOR_INTEGRATION` or released-class state. Deferring live verification — to migration time, to a later session, or to the user — is an explicit exception, so record each deferral as a named PENDING item in the Feature State and Handoff; disclosing it in prose does not clear the gate.

## 7. Integration and release

Check combined behavior, migrations, order, rollback and release evidence. Human owners authorize merge and release. After release, run the post-release check and set `RELEASED`.

## 8. Learning

Create only verified and reusable knowledge candidates. Unapproved ideas remain Backlog, not policy.

