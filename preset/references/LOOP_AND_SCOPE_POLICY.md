# Loop and Scope Policy

## Default loop budget

| Change class | Default fix loops | Examples |
|---|---:|---|
| Small | 1 | 局部 UI、明确缺陷、低风险配置 |
| Standard | 2 | 普通业务功能、API、后台页面 |
| Complex | 3 | 跨模块功能、迁移、关键集成 |
| Exceptional | Explicit approval | 架构重构、性能专项、安全专项 |

一次 loop 是：根据已确认的问题修改，然后重新执行相关验证。重复运行同一失败命令而无新信息不算有效 loop，必须先做根因分析。

## Lightweight mode for Small changes

Small 类变更允许轻量模式：不建立完整 feature 目录六件套，只需在会话内明确合同要点（目标、范围与非目标、验收标准、所需证据），实现后附真实验证证据即可。以下情况必须走完整目录：跨模块、公共接口、数据模型、迁移、对外发布、高风险权限，或该改动后续需要跨会话交接。轻量模式降低的是文书开销，不降低验证标准：没有活路径证据的 Small 变更是 `PENDING_LIVE_VERIFY`，不是 done。

## Stop conditions

满足以下条件立即停止当前交付循环：

- 所有已批准验收标准通过；
- 无未解决 P0/P1；
- 必须的测试与质量检查通过；
- 剩余问题属于未批准增强或 ROI 低；
- 继续修改会触及架构、范围或高风险权限；
- 达到循环或成本预算；
- 关键事实缺失，继续只能依赖猜测。

## Scope categories

- **Required**：缺少会导致核心流程不可用、不安全或违反明确要求。本轮必须处理。
- **Expected**：行业或产品常规能力，但需求未明确。必须由 Product Owner 决定是否纳入。**自主模式（`Delivery mode: autopilot`）下的默认处置：进 Backlog**，并在决策日志记一行「Expected 项按默认处置入 Backlog」——除非 `DELEGATION_MATRIX.md`（授权书）对该条目另有约定。这不是放宽判据，而是把「必须由 Product Owner 决定」的时点前移到需求确认阶段：授权书要么在确认阶段就写明纳入、要么默认不纳入，执行期不再回头问人。授权书没覆盖、且该 Expected 项一旦不做会让核心流程不可用的，它其实是 Required，按 Required 处理而不是丢 Backlog。
- **Optional**：体验、扩展或优雅性提升。默认进入 Backlog。
- **Out of scope**：明确不属于当前功能，禁止顺手实现。

## Issue priority

- **P0**：安全事故、数据丢失、生产不可用。立即停止并升级。
- **P1**：核心验收失败、权限绕过、严重回归。当前循环必须修复。
- **P2**：重要但不阻止批准范围的交付。由 Owner 决定本轮或 Backlog。
- **P3**：优化、清理和建议。进入 Backlog。

## Anti-patterns

- 为了让测试通过而删除、跳过或弱化测试。
- 以“最佳实践”为理由扩大功能。
- 在修复中重写无关模块。
- 让 Developer Agent 自己给实现打满分并宣布批准。
- 在没有运行证据时使用“应该通过”“大概率没问题”。
- 把活路径验证降级为读代码 / 单测 / 推给用户，然后照常标 done——拿不到 live 证据时状态停在 `PENDING_LIVE_VERIFY`。
- 用叙述性的一句话披露推迟的真机验证，以此代替具名 PENDING 项：披露是披露，不是通过门禁。
- 把「说人话」（`references/HUMAN_COMMUNICATION.md`）退化成软化严重性：为了通俗而把「这个操作之后数据找不回来」写成「建议谨慎操作」、把「可能丢数据」写成「有点风险」。说人话失败的正确方向是啰嗦，不是含糊；严重性、不可逆性、影响范围必须原样传达。这比用术语更危险——它看起来像是被理解了，读者会批准一件他并不理解其后果的事。
- 在自主模式下用「不能打扰用户」当理由自签发布凭据（`ai-nseos/state/.release-ready.json` 的 `review` / `prod_schema` / `doc`）或关闭阀门（`AINSEOS_ACTION_GATE` / `AINSEOS_SKILL_GATE` / `AINSEOS_DOC_GATE`）。**不打扰 ≠ 不阻塞**：撞到机器门禁是**合法挂起**，如实报「差哪几项 + 已完成什么」然后停（该报告按 `references/HUMAN_COMMUNICATION.md` 转述，不要把写给模型看的 deny 原文直接丢给人类），不是「必须自己想办法通过」（`FB-20260725-003`：实测会话在长跑压力下第三次执行了 `AINSEOS_ACTION_GATE=off git push`；`FB-20260725-004`：阀门属人类运维，模型不得关闭也不得请求关闭）。

