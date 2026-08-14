# Feature Contract: <FEATURE-ID> — <Title>

## Control

- Status: DRAFT
- Product owner: <name/UNKNOWN>
- Technical owner: <name/UNKNOWN>
- Risk class: Low / Medium / High
- Created: YYYY-MM-DD
- Last approved version: NONE
- Approval record: NONE

## Outcome

- Problem:
- Target users/roles:
- Business/user outcome:
- Success signal:

## Scope

**四档分类要让审批人判断「不做会怎样」，不是让他对着分类标签点头。** 每一条后面跟一句后果（按 `references/HUMAN_COMMUNICATION.md` 写）：Required 写「缺了它哪个流程走不通、谁会卡住」；Expected 写「行业里通常有，这次不做的话用户会遇到什么」；Optional 写「不做只是不够好，具体差在哪」；Out of scope 写「明确不做，以及由此产生的已知缺口」。只有 Expected 一档需要他真正做选择，其余三档是告知——但告知同样要让他看得懂，否则他没有机会发现某条被归错了档。

### Required in this feature

-

### Explicit non-goals

-

### Allowed paths/modules

-

### Forbidden paths/modules

-

## Product completeness matrix

| Dimension | Classification | Decision/evidence |
|---|---|---|
| Discovery/navigation | TBD | |
| Primary flow | TBD | |
| Detail view | TBD | |
| Search | TBD | |
| Filtering | TBD | |
| Sorting | TBD | |
| Pagination | TBD | |
| Create/edit/delete | TBD | |
| Roles/permissions | TBD | |
| Validation | TBD | |
| Empty/loading/error/success | TBD | |
| Retry/confirmation/undo | TBD | |
| Audit/logging | TBD | |
| Accessibility/responsive | TBD | |
| Localization/timezone | TBD | |
| Help/notifications | TBD | |

Allowed values: Required, Expected, Optional, Out of scope, Not applicable.

## Interfaces and dependencies

- Upstream dependencies:
- Downstream consumers:
- Public API/UI/data contracts:
- Schema/migration impact:
- External services/dependencies:
- Feature flags/configuration:

## Acceptance criteria

Use observable Given/When/Then or equivalent outcomes.

1. AC-01:
2. AC-02:
3. AC-03:

## Non-functional requirements

- Security/privacy:
- Performance/capacity:
- Reliability/retry/idempotency:
- Accessibility:
- Observability/audit:
- Compatibility:

## Verification contract

| Criterion/risk | Evidence required | Command/procedure | Owner |
|---|---|---|---|
| AC-01 | | | |

## Delivery controls

- Change class: Small / Standard / Complex / Exceptional
- Fix loop budget: 1 / 2 / 3 / approved exception
- Time/cost budget: <value/UNKNOWN>
- Branch/worktree:
- Environment/data isolation:
- Required reviewers:
- Human gates:
- Rollback strategy:

## Assumptions and open decisions

| Item | Type | Owner | Due/condition | Status |
|---|---|---|---|---|
| | Assumption / Decision | | | OPEN |

## Approval

**这是整套系统里最早、也最难改的一次人类决定：批错了范围，后面所有工作都建立在错的边界上。** 呈交这份合同请人拍板时按 `references/HUMAN_COMMUNICATION.md` 书写——审批人不必读懂 `Interfaces and dependencies` 那些字段，但**必须读懂他批准的边界意味着什么、以及被排除在外的东西缺了会怎样**。看不懂就点头的批准不是批准，它只是把责任转移到了一个没有真正判断过的人身上。

By approving this version, the Owner approves only the Required scope and controls above. Expected and Optional items remain outside scope unless explicitly moved.

- Decision: APPROVED / REJECTED / CHANGES_REQUESTED
- Approved by:
- Date:
- Contract version/hash:
- Conditions:

