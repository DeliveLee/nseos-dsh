# Feature State Model

## States

| State | Meaning | Exit condition |
|---|---|---|
| DRAFT | 需求刚登记，内容可能不完整 | 已完成初步发现 |
| DISCOVERY | 正在分析产品、技术、依赖与风险 | Contract 完整，等待审批 |
| AWAITING_APPROVAL | 等待人类确认范围和风险 | 批准、驳回或修改 |
| APPROVED | 可以开始，但尚未修改代码 | 建立分支/worktree并开始实现 |
| IN_PROGRESS | 正在按批准计划实现 | 进入验证或被阻塞 |
| VERIFYING | 执行独立验证和评审 | 通过、需要修复或阻塞 |
| NEEDS_FIX | 存在阻止验收的问题 | 在预算内修复并重新验证 |
| PENDING_LIVE_VERIFY | 实现看似成立，但缺少活路径证据，或活路径验证被推迟 | 在真实路径上补齐证据 |
| READY_FOR_INTEGRATION | 功能证据完整，等待集成 | 集成开始 |
| INTEGRATING | 检查冲突、兼容性和合并准备 | Release ready、退回或阻塞 |
| RELEASE_READY | 已满足发布前条件 | 人类批准发布 |
| RELEASED | 已发布并完成发布后检查 | 关闭或创建改进项 |
| BLOCKED | 无法在当前授权和信息下继续 | 阻塞解除后回到前一状态 |
| CANCELLED | 明确停止 | 无 |

## Parked items（条目级挂起，不是状态）

自主模式（`Delivery mode: autopilot`）在执行期会把「撞上了但不可预授权」的事情**挂起**。**挂起不是新状态，也永远不会出现在上表**：

| | 挂起（PARKED item） | `BLOCKED` |
|---|---|---|
| 粒度 | **条目级**——挂的是某一条测试目标 / 某一个决策 | **功能级**——整个 feature 停住 |
| 记在哪 | `DECISION_LOG.md` 的挂起清单表（时间、撞到什么、为什么不可预授权、已影响哪些测试目标条目、当前是否阻塞主干） | `FEATURE_STATE.md` 的状态历史 |
| 功能整体状态 | 保持 `IN_PROGRESS`，AI 继续推进不依赖它的工作 | 停止推进，等人 |
| 何时告知人类 | 默认静默记账；跌破下面的阈值才立即打断 | 立即打断 |

产生挂起的典型情形：属 `DECISION_RIGHTS.md` 中「可否预授权 = 否」的决策、授权书未覆盖且不可类推、需要改动测试断言的业务语义、需要给 `TEST_TARGETS.md` **新增**条目、撞到机器门禁（`ai-nseos-action-gate` / `ai-nseos-doc-gate`）。**撞到门禁是合法挂起，不是失败**——如实报「差哪几项 + 已完成什么」然后挂起（这份报告按 `references/HUMAN_COMMUNICATION.md` 转述，别把 deny 原文粘给人类，它是写给模型看的）；自签发布凭据或关阀门放行，是把挂起伪造成通过（`FB-20260725-003` / `-004`）。

**验收标准两个方向都锁死。** 改动 `TEST_TARGETS.md` 里某条断言的业务语义（期望值、边界条件、该不该报错）是改验收标准；**在执行期给 `TEST_TARGETS.md` 新增一行同样是改验收标准**——AI 不得自行新增测试目标，哪怕新增的那条看起来明显应该有、明显是确认阶段漏了。两者一律挂起交人类裁决（裁决请求与阈值触发的打断，都按 `references/HUMAN_COMMUNICATION.md` 书写——默认读者完全不懂 IT 技术，与 `FB-20260717-003` 的可读性要求叠加而非替代）。理由是这张清单同时是分级打断阈值的分母：允许自行加行，AI 就能靠往清单里塞容易变绿的条目把比值抬回 30% 以上，把本该打断人类的局面粉饰成「还在正常推进」。（可自主修改的只有测试的**实现细节**：mock 搭法、选择器、测试的拆分与合并。）

**挂起项不得替代 `PENDING_LIVE_VERIFY`。** 这是两件不同的事，不可互换：

- 缺**活路径证据**的条目 → 一律走 `PENDING_LIVE_VERIFY` 与具名 PENDING 项，判据、记法与协作模式**完全相同**。
- 缺**人类决策授权**的条目 → 才是挂起项。

把「还没在真机上验」记成挂起项，等于让它享受挂起项「不阻塞主干、功能仍算 `IN_PROGRESS` 推进中」的待遇，从而绕过「仅凭测试加读代码永远不能到达 done / `READY_FOR_INTEGRATION` / released 类状态」这条硬规则。自主模式不降低任何证据标准（见 `references/AUTONOMY_POLICY.md`）：它改的是**什么时候问人**，不是**什么时候可以不验证**。一个条目同时缺证据又缺授权时，两处都要记——挂起清单记授权缺口，具名 PENDING 项记证据缺口。

## 人类已确立的事实是锚，不是待验证项

长会话里最贵的信息不是计划，是**人类已经说过一次的事实**。实测一个约 6 小时、无压缩的会话：用户两次说「iTerm 已有完全磁盘权限」，编排仍把它当「待验证项」，反复退回去让用户改系统设置——事实没有丢，是**被降级**了，而没有任何检查会因此报错。这与「过期的看板和准确的看板长得一样」是同一个病：一段没被机器锚定的事实，会被下一次推理重新当假设对待。

规则：

1. **人类给出的事实（权限、环境、口径、约束、历史结论）一经陈述，记入 `HANDOFF.md` 或 `DECISION_LOG.md`，此后当作输入，不再当作待验证项。**
2. **同一事实需要第二次向人类确认前，先翻记录**；记录里有，就照用，别再问。
3. **只有新证据与该事实正面冲突时，才重新打开**，并向人类说明冲突双方各是什么——不是「我不确定，你再说一次」。
4. 这条适用于任何协作模式，不只在自主模式。自主模式额外要求把「人类已确立事实」与自决条目分开记（前者是给定，后者是决定），两者不得混成一张表。

## Transition rules

- 只有人类产品负责人可将 `AWAITING_APPROVAL` 变为 `APPROVED`。
- 只有独立验证证据完整时才能进入 `READY_FOR_INTEGRATION`。
- 缺少真实活路径证据（截图、控制台、网络、真实 HTTP 响应、真实 DB 回读或 CLI 输出）时进入 `PENDING_LIVE_VERIFY`：仅凭测试加读代码永远不能到达 done、verified、`READY_FOR_INTEGRATION` 或 released 类状态。当需求或所报缺陷针对的正是真实路径时，在 mock/stub 栈上的验证不满足活路径验证。
- 推迟活路径验证——推到迁移期、推到后续会话或推给用户——是显式例外：每项推迟必须作为具名 PENDING 项记入 `FEATURE_STATE.md` 与 Handoff；在叙述里披露不解除该门禁。
- 只有具名 PENDING 活路径验证项全部关闭后，`PENDING_LIVE_VERIFY` 才能转入 `READY_FOR_INTEGRATION`。
- 只有发布负责人可授权从 `RELEASE_READY` 到 `RELEASED`。
- 超出 Loop Budget、出现范围冲突、危险操作或未知关键事实时进入 `BLOCKED`。
- **分级打断（自主模式，`BLOCKED` 的可计算判据）**：以 `TEST_TARGETS.md`（测试目标清单）的条目数计数，`剩余可推进条目 = 未变绿且不依赖任何挂起项的条目数`，`剩余未完成条目 = 未变绿的条目总数`。当 `剩余可推进条目 / 剩余未完成条目 < 30%` 时，功能转既有的 `BLOCKED` 并**立即打断人类**；否则静默记账、继续推进。这条防的是「AI 看起来还在忙、实际只剩边角料可干」——主干被挂起项卡住时必须让人类知道，而不是把剩余工时耗在装修上。分母为 0（清单已全绿）时不触发本规则。**本规则只在自主模式下生效，且只新增一条进入 `BLOCKED` 的路径，不新增状态、不改变协作模式下任何既有的打断时机。**
- 状态变更必须写入 `FEATURE_STATE.md` 的历史，不得覆盖历史记录。

## 跨 feature 台账（`ai-nseos/state/FEATURE_INDEX.md`）—— 所有者与更新时机

**这份台账过去只有写入方、没有维护方。** `plan-feature` Step 9 与 `autopilot-confirm` Step 14 都要求「更新 Feature Index」，而在那之后的每一次状态流转——`VERIFYING`、`READY_FOR_INTEGRATION`、`RELEASED`——**没有任何一步再提到它**。于是它永远停在立项那天的样子：实测有功能已经上线数小时，台账里那行仍写着「待批准、分支未建」（`FB-20260802-002`）。

**过时的台账比没有台账更糟**——它是下一个会话最先读到的东西，而它看起来和准确的台账一模一样。

规则：

1. **每次 feature 状态流转都要同步它那一行**，与 `FEATURE_STATE.md` 的头部状态保持一致。写入点：`plan-feature`（建行）、`build-feature`（进 `VERIFYING`）、`review-feature`（裁决后）、`integrate`（合并 / 发布后）。
2. **台账行与 `FEATURE_STATE.md` 不一致 = 可记 finding**，由 `review-feature` 的状态一致性检查（Step 8.6）负责发现——那是全流程唯一必然执行、且产出是「发现」的位置。
3. **台账与 per-feature 文件冲突时，以 `FEATURE_STATE.md` 为准**。台账是索引，不是真源；索引只负责「有哪些 feature、大致到哪一步」。
4. **多阶段 / 跨会话的大计划不要靠这张台账跟进度**，用 `templates/PROGRESS_MANIFEST.md`——那份有生成时 HEAD 和新鲜度命令，过期会让命令失败；台账没有这个能力，也不打算有。

**诚实边界**：以上是**流程义务 + 评审抽查**，不是机器门禁。没有任何 hook 会比对台账与状态文件。这是刻意的——插件在业务仓库里没有常驻脚本，写一条「机器生成」的规范而没有生成器，正是 v0.25.1 明确拒绝过的那类空规范。

## Required per-feature directory

```text
ai-nseos/state/features/<feature-id>/
├── FEATURE_CONTRACT.md
├── IMPLEMENTATION_PLAN.md
├── FEATURE_STATE.md
├── REVIEW_REPORT.md
├── HANDOFF.md
└── BACKLOG.md
```

大功能可增加 ADR、风险评估和发布证据，但以上六个文件是最小交接集合。

**这六个文件必须提交进 git（`FB-20260802-002`）。** 只有 `ai-nseos/state/` 下的**瞬态**文件被 `init` 写进 `.git/info/exclude`（会话标记、各类 ack、`.gate-armed`）；合同、计划、状态、评审报告、交接单、backlog **从来都是可提交的**，但没有任何一步要求过提交它们，于是它们经常整份留在工作树里。实测：一个已上线功能的合同、计划、逐批证据与老站实查记录全部未提交，是准备跨账号交接时偶然发现的——换账号换机器即全丢，包括「部署后必须人工补的两步」这种缺了就上不了线的信息。**下一个账号读得到的，只有已提交的那部分。** `review-feature` Step 8.6 用 `git ls-files ai-nseos/state/features/<feature-id>/` 抽查这件事。

**自主模式（`Delivery mode: autopilot`）额外要求四份文件**，由 `autopilot-confirm` 的固化步产出，是「执行期不打扰人类」能够成立的全部依据；缺任何一份都不得进入执行段：

```text
ai-nseos/state/features/<feature-id>/
├── RECON_REPORT.md        # 勘探报告：已验证事实（每条附证据）/ 未验证疑点（每条附「为什么没验」「撞上了会怎样」）
├── TEST_TARGETS.md        # 测试目标清单：文件路径 + 测试名 + 断言的业务语义 + 红/绿；执行期唯一被授权变绿的东西，也是分级打断阈值的分母
├── DELEGATION_MATRIX.md   # 授权书：逐条对应勘探报告的未验证疑点（疑点 → 若成真的表现 → 默认处置 → 可否回滚），含不可删除的红线节
└── DECISION_LOG.md        # 决策日志（自决逐条记账）+ 挂起清单（第二张表，见上文 Parked items）
```

协作模式不要求这四份文件；它们的存在与否也是 `build-feature` 判断走不走授权书分支的依据。

