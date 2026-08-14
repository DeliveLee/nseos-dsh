---
name: nseos-review-feature
description: 独立评审一个功能:对照其已批准合同、精确 diff、项目命令与可复现证据,记录分级发现而不改实现;功能到 VERIFYING 后路由可能自动触发。
---

# 评审一个功能

0. 标记 ai-nseos 流程为激活,让机器 skill-gate 放行步骤内的技能。用 `write` 工具写单行 JSON 到 `<仓库根>/ai-nseos/state/flow/<session-slug>.json`:

```json
{"session_id":"<本会话 id>","started_at":"<ISO8601 UTC>","mode":"review-feature","contract":"<一行合同要点>"}
```

- `session_id` 取本会话 id,勿猜、勿留占位:门禁据此归属 marker。`contract` 一行要点、单行、不含双引号。
- `<session-slug>` = session_id 的非法字符替换、拒绝 `..`。
- 长流程跨小时要刷新:重写同一文件、`started_at` 重新生成。
- 完整校验语义见 `FLOW_MARKER_CONTRACT.md`(空文件/错 session/过期 >4h → 门禁 deny)。

1. 读本项目的 Profile、已批准的 Feature Contract、State 与开发者 Handoff。
2. 读 `references/QUALITY_AND_EVALUATION.md`、`references/SECURITY_POLICY.md`、`references/LOOP_AND_SCOPE_POLICY.md`、`references/FEATURE_LIFECYCLE.md`,以及 **`references/VERIFICATION.md`——判断证据能否把好实现和坏实现区分开的唯一真源**(L0–L4 等级、四个判别问题、mutation receipts、三种已知 false-green 形态)。不要把它转述进派发消息:`quality-reviewer` 自己会读它。**本会话里读了它不等于把它放进了评审者的上下文**——正是这个错位让调用者过去把规则逐条手抄进每次派发,而且每次抄得都不一样。
3. 确定精确的 branch/base/diff。把开发者摘要当作主张,不是证明。
4. **本技能独占评审者派发、Review Report 与结论(v0.25.0)。** `nseos-build-feature` 停在 `VERIFYING` 并交出实现交接单;只有本技能能把功能移出 `VERIFYING`。把有界评审派给 `quality-reviewer` 角色子代理(`subagent` 工具);当信任边界、授权、数据或依赖发生变更时,加派 `security-reviewer`。

   **给评审者一份完整的任务包,不要重新教它自己已经带着的规则。** 至少需要:仓库根、功能 id、合同路径、`base_sha` 与 `head_sha`、哪些验收判据在范围内、要写的报告路径、哪些命令可以安全运行。缺任何一项的评审者应返回 `INVALID_TASK_PACKET` 而不是去猜——一份建立在猜出来的 HEAD 上的评审,读起来和真的一模一样。反过来,不要复述「只读」「P0–P3」「不要 commit」或证据规则:它们都在子代理角色卡和 `references/VERIFICATION.md` 里。(七天实测:50 次 quality-reviewer 派发,约 44 次复述只读、约 43 次复述 P0–P3,每次中位 2,485 字符手写前言——每次都付费,每次措辞都不同,因此每次表现都不同。)

   **预期中断,并保留部分独立性。** 评审子代理跑到一半死掉在这里是常态(一次观察到的批次:连续丢两个评审者,约 50% 子代理中断,包括三次连续 API 529)。评审者先写报告骨架再逐步填充,这样中断后还能续。**中断时,对同一份报告续同一个评审者(用 `send_message` 工具),而不是另起一个新的**;只有在其上下文真的不可用时才重来。如果你最终自己验证了工作,那是被允许的降级,但**不是**独立评审:在 Review Report 头部说明,并把发布凭据的 `independent` 置为 `false`(第 8.5 步)。
5. 对用户可见的改动,活路径验证是一道硬门:驱动真正在跑的应用(browser/CLI/device/真实 API)走完每一条受影响的流程,并捕获真实的 console、network、screenshot 或 log 证据。只有绿灯测试永远证明不了一条用户可见验收判据;对用户可见范围缺少活路径证据的 Review Report 是不完整,不是通过。当需求或所报 bug 关注的就是真实路径时,mock 或 stub 栈不能顶替真实路径。凡活路径验证被推迟——推迟到迁移时、之后的会话、或推给用户——都要求在 Feature State 与 Handoff 里记一条具名 PENDING;开发者摘要里一句诚实的话是披露,不是通过的门。对授权/权限缺陷具体来说(FB-20260719-006):当没有真正驱动一个特权操作的真实 UI 或客户端入口去复现违规时,Review Report 必须显式记录所用的验证方式——要么 `live reproduction`,要么 `e2e negative cases + code read; real entry not driven because <reason>`——让「可达性/验证」的取舍留在记录上,而不是隐在散文里。这不强制活路径复现(e2e 负例加一份代码阅读仍是强证据);它强制的是把方式说清楚,而不是默认。
6. 对全面级、审计级或发布前评审,以及对 Complex/Exceptional 变更等级,按维度扇出多个评审者,然后对每条发现用一个被要求去反驳它的独立怀疑者做对抗验证(默认当作已被驳倒;只保留存活下来的)。对规范符合性检查,用只拿到 ground truth 和活对象、永远拿不到 diff 的盲验者。仅 Small/Standard 变更,单次 quality-reviewer 通过就足够。
7. 独立评审期间不改实现代码。
7.5 **实现边界审计(FB-20260716-006):** 若存在则读 `ai-nseos/state/.impl-boundary-ack`,并检查 diff 的来历——产品代码应由 `feature-developer` 角色子代理(测试驱动开发)实现,而不是编排会话。若 ack(或会话记录)显示编排者直接改了产品代码,在 Review Report 里记一条流程发现并带上所述理由;编排者无测试地直接改动至少算 P2。
7.6 **从原始需求重建可判条目,而不是从计划(FB-20260728-004)。** 实现计划、设计文档与开发者摘要都是受审的主张——绝不是事实输入。在看证据之前,写一张需求 oracle 矩阵,行来自用户的原始需求文本,每个可判子句一行,每行含:`requirement_id / source / actor / state / surface / data_fixture / direct_observable / negative_control / evidence / verdict`。**空单元格的行不能聚合成通过**,`verdict` 用 `references/VERIFICATION.md`(§1)的 `claim_verdict` 命名空间。这就是*变更验证*("我改的东西生效了吗?")与*符合性验证*("对象作为一个整体是否符合 ground truth?")的区别——后者才能抓到计划从没想到的东西,而它正是被跳过的那一个。两种形态要按名字查,因为它们在这里已经发过 false-green:顶替最终用户结果的中介代理(只查首跳的 redirect,而真实链路还有第二跳;SEO 标签用渲染后的 DOM 而不是原始 HTML;admin 界面用 GraphQL 字段而不是真实页面),以及 `CAPABILITY_ONLY`——代码支持四种放置,真实数据里一种都没有,而「能力存在」被聚合成「已验证」(`references/VERIFICATION.md` §5.5–5.6 拥有这两类判断;不要复述它们,应用它们)。
8. 用每一条验收判据、实际命令/结果、活路径证据、P0–P3 发现、范围评审与缺失证据更新 Review Report。
8.5 **发布门禁的独立评审证据(FB-20260716-003):** Review Report 写完后,记录 action-gate 在主干 push 前检查的证据——`ai-nseos/state/.release-ready.json` 的 `review` 字段。**确切命令在 `references/RELEASE.md` 第 2 步(唯一真源——不要抄到这里);** 从你将 push 的那个检出运行它。这一步有三点要紧:

   - **`independent` 是必填,而且你必须诚实陈述(v0.24.0,FB-20260727-003)。** 只有当一个**没有**实现该改动的评审者产出了报告时才是 `true`。若两个评审子代理都死了、你自己验证了工作,那就是 `false`——它仍然可以发布,门禁只是让人类确认一次。缺省该字段会 deny(`MISSING_INDEPENDENT`);「未说明」不是第三个选项。这之所以存在,是因为它已经发生过:两个评审者中断,编排者自评,凭据看起来和一次真正的独立评审一模一样。
   - **`head_sha` 把凭据绑定到被评审的 commit(v0.24.0)。** 在 push 前最后一步写凭据。它之后的任何 commit——包括提交 Review Report 本身——都会使它失效(`EVIDENCE_STALE`)。这是刻意的:关于 commit X 的证据不得授权 commit Y。
   - 只在一次真实评审产出报告之后才写它——没有报告就铸它,会毁掉它唯一的意义(这道门是建议性的,并且对此诚实)。
8.6 **建议 READY 之前的状态-文档一致性检查(FB-20260719-005):** 在第 9 步之前,验证状态工件彼此之间、以及与实现之间不矛盾——`FEATURE_STATE.md` 的头部状态、它的 checkpoint/checklist 行、`REVIEW_REPORT.md`、以及 `ai-nseos/state/FEATURE_INDEX.md` 里本功能的那一行必须一致(不允许一个全 DONE 的 checklist 上顶着 `IN_PROGRESS` 头,不允许已完成工作旁边躺着一张空 Review Report 模板),而且这些状态更新必须已提交,不能留成未提交的工作区改动。任何一处矛盾,记一条发现,并在调和前不要建议 `READY_FOR_INTEGRATION`。**还要检查本功能的耐久文档真的在 git 里(FB-20260802-002):** `git ls-files ai-nseos/state/features/<feature-id>/` 必须列出 contract、plan、state、review report 与 handoff。空或部分输出是一条发现——这些文件就是交接的全部内容,而另一个账号或机器只读得到已提交的东西。这已经咬过人:一个已发货功能的 contract、plan、批量证据与旧站调查全都没提交,只是在准备跨账号交接时有人碰巧看了一眼才发现。这抓住的是那种反复出现的「状态文档滞后于实现」的漂移,此前只有盲验者或最终评审者才抓得到。
8.7 **文档维护审计(FB-20260720-001/-002)。** 在已采纳文档体系的仓库(`docs/domain/` 存在)里,确认本功能在开发期间真的维护了文档,而不是留给每周巡检。检查:(a) 术语门禁被武装过——一个完整模式功能没有 `ai-nseos/state/features/<id>/.gate-armed` 就是绕过了术语澄清;除非有显式跳过说明,记一条发现;(b) 本功能实现的任何带阈值/上限/校验/计算的业务规则,已记进 `docs/domain/BUSINESS-RULES.md`(带数字例子)或记到 `docs/domain/OPEN-QUESTIONS.md`——实现了却没记录的规则是一条发现;(c) 新增或改名的实体、模块、工作流反映在 GLOSSARY / 架构文档里。开发期维护的文档,胜过一周后被一个没有上下文的巡检子代理抓出来的漂移。机器 action-gate 在发布 push 前还要求 `ai-nseos/state/.release-ready.json` 里有一个新鲜的 `doc` 字段(FB-20260720-004;v0.19 的 `.doc-maintained` 文件仍被读取但已弃用);若那个 ack 存在但上面的检查显示文档其实没维护,ack 就是空心铸出来的——记一条发现,因为一个自铸的 ack 只有这次评审让它多诚实。
9. 建议:
   - 所有项目门禁通过时:`READY_FOR_INTEGRATION`;
   - 实现看起来健全但活路径证据缺失或被推迟:`PENDING_LIVE_VERIFY`;
   - 预算内阻塞性缺陷:`NEEDS_FIX`;
   - 缺授权、环境、预算或关键不确定性:`BLOCKED`。

用大白话把结论呈给人类(FB-20260717-003):先给建议和 TA 必须决定什么;每条发现一行、写成完整句(「合同/文档说 X,代码实际做 Y,影响 Z」);内部 ID、锚点、标签首次出现即解释。**在这之上,默认读者完全不懂 IT——每条发现和处置选项都按 `references/HUMAN_COMMUNICATION.md` 措辞。** 这两条是叠加,不是重叠:FB-20260717-003 解决「读者没看过过程」,`HUMAN_COMMUNICATION.md` 解决「读者不懂技术」——在说出 P0–P3 标签之前,先说缺陷对真实用户或真实数据做了什么,因为对一个决定要不要发货的非技术负责人来说,标签本身毫无意义。**再叠加规则七(分层与篇幅,`FB-20260802-001`)**:开头 5 行内给「一句结论 + 需要你做什么 + 最多 3 条一行要点」,背景与证据放它下面;正文超过一屏(约 25 行)时结尾追加 3–6 条一行的「精炼版」(结论 + 待决策 + 风险);一条发现压到 1–2 行而不是一段。**砍的是修辞和过程,不是信息**——严重性、不可逆性、影响范围、数字与待决策项一个都不许因为求简而消失,与「精确性不可牺牲」冲突时后者赢,压不下去就分层。

严重性必须熬过翻译。**评审这个或任何功能时,把面向人类决策请求里被软化的严重性当作一条可记录的发现:** 一份把「这个改动之后数据找不回来」写成「建议谨慎操作」的请求,让人类批准了 TA 没看懂的东西——这比术语更糟,因为它看起来像被看懂了。

Agent 的建议不是 merge 或 release 的批准。
