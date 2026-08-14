# Review Report: <FEATURE-ID>

- Reviewer:
- Review independence: Independent / Self-review only
- Contract version:
- Diff/base reviewed:
- Environment:
- Date:
- Recommendation: BLOCKED / NEEDS_FIX / PENDING_LIVE_VERIFY / READY_FOR_INTEGRATION

## Acceptance evidence

| Acceptance criterion | Status | Evidence | Gaps |
|---|---|---|---|
| AC-01 | PASS / FAIL / NOT_RUN / N/A | | |

## Verification executed

| Check | Exact command/procedure | Result | Evidence/location |
|---|---|---|---|
| | | PASS / FAIL / NOT_RUN | |

## Findings

呈报 findings 与处置建议时按 `references/HUMAN_COMMUNICATION.md` 书写——**这一节要人类拍板「本轮修还是进 Backlog」，他拍的是后果，不是优先级标签。** `Finding` 一列写「什么情况下会出什么事、影响谁」，不是缺陷的代码位置复述（位置进 `Evidence/reproduction`）。P0/P1 的严重性零折扣，不许用「建议关注」「有优化空间」盖过一次真实的数据或权限问题（规则五）。

| ID | Priority | Finding | Evidence/reproduction | Required disposition | Status |
|---|---|---|---|---|---|
| | P0/P1/P2/P3 | | | | OPEN |

## Scope and product review

- Approved scope respected:
- Unapproved additions:
- Required product states covered:
- Adjacent regression risks:

## Security and operations

- Authentication/authorization:
- Input/data/secrets:
- Dependencies/supply chain:
- Migration/rollback:
- Logging/metrics/alerts:

## Limitations

List anything not tested, unavailable or relying on assumptions. Anything live-path that was not exercised — including verification done against a mock or stub stack — belongs in the Feature State as a named PENDING item, not only here: the recommendation is then `PENDING_LIVE_VERIFY`.

## Recommendation rationale

Explain which gates support the recommendation. An Agent recommendation is not human release approval.

