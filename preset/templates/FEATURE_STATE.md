# Feature State: <FEATURE-ID>

- Current state: DRAFT
- Contract version:
- Branch/worktree:
- Base revision:
- Current owner/session:
- Loop used / budget: 0 / <n>
- Last updated: YYYY-MM-DD HH:MM TZ
- Blocker: NONE

## Current checkpoint

- Last completed step:
- Next safe action:
- Working tree summary:
- Environment status:
- Verification status:
- Live-path evidence:

## Pending live verification

While any row is OPEN the feature stays `PENDING_LIVE_VERIFY` and must not be marked done, verified, `READY_FOR_INTEGRATION` or `RELEASED`. Every deferral — to migration time, to a later session, or to the user — is a named row here, not a sentence in a summary. Verification on a mock or stub stack does not close a row whose real path is what the requirement or bug concerns.

| Item | Real path to exercise | Evidence required | Why deferred | Owner | Status |
|---|---|---|---|---|---|
| | | | | | OPEN |

## Transition history

Append only.

| Timestamp | From | To | Actor | Evidence/reason |
|---|---|---|---|---|
| | NONE | DRAFT | | Feature registered |

## Loop history

| Loop | Trigger findings | Changes made | Verification | Outcome |
|---:|---|---|---|---|

## Approvals

| Gate | Decision | Approver | Timestamp | Conditions/evidence |
|---|---|---|---|---|

