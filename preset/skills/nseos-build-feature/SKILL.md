---
name: nseos-build-feature
description: 实现一份已批准的功能合同:有界修复循环、项目专属测试、独立评审、证据化交接。只作用于 APPROVED/IN_PROGRESS/NEEDS_FIX 的合同,绝不绕过人类范围批准门;到 merge/release 之前停。
---

# 实现一个已批准的功能

0. 标记 ai-nseos 流程为激活,让机器 skill-gate 放行你在本流程内要调用的步骤内技能(测试驱动开发、系统化调试、任何项目专用技能)。用 `write` 工具写单行 JSON 到 `<仓库根>/ai-nseos/state/flow/<session-slug>.json`:

```json
{"session_id":"<本会话 id>","started_at":"<ISO8601 UTC>","mode":"build-feature","contract":"<一行合同要点>"}
```

- `session_id` 取本会话 id,勿猜、勿留占位:门禁据此归属 marker。`contract` 一行要点、单行、不含双引号。
- `<session-slug>` = session_id 的非法字符替换、拒绝 `..`。
- 长流程跨小时要刷新:重写同一文件、`started_at` 重新生成。
- 完整校验语义见 `FLOW_MARKER_CONTRACT.md`(空文件/错 session/过期 >4h → 门禁 deny)。
- 在实现开始之前写,而不是到发布时才写来给门禁解锁。

1. 读本项目的 Profile 与功能目录。只接受 `APPROVED`、`IN_PROGRESS` 或 `NEEDS_FIX`。若仓库已采纳文档体系(`docs/domain/` 存在),通过 touch `ai-nseos/state/features/<feature-id>/.gate-armed` 武装术语/歧义门禁——从此机器 doc-gate 会拦截对产品代码的编辑,直到第 3.5 步写入 `ambiguity-cleared`。**在已采纳文档体系的仓库里,每个完整模式功能都必须武装,这不是可选子步骤——现在、在任何产品代码之前就做。** 门禁只在 `.gate-armed` 存在后才执行,所以一个带着缺失 `.gate-armed` 标记就进入实现的功能,等于悄悄完全绕过了术语澄清(实况:bonohair-rebuild 9 个功能里 5 个未武装,FB-20260720-001)。如果你刻意跳过它(一个纯文档或纯配置的变更、不触及任何领域术语),在 Feature State 里显式记一行,而不是让标记仅仅缺席。**Autopilot 例外:** 若 `ai-nseos/state/features/<feature-id>/ambiguity-cleared` 已存在,说明 `nseos-autopilot` 在确认阶段已经清掉了每个领域术语——这里跳过武装、跳过第 3.5 步,并在 Feature State 里写一行,记录术语澄清已由确认阶段完成。这只是顺序上的捷径(重新武装无害且幂等,第 3.5 步只会发现没有未定义项);它绝不适用于标记缺席的情形,也不授权带着未定义术语去实现。
2. 读 `references/QUALITY_AND_EVALUATION.md`、`references/LOOP_AND_SCOPE_POLICY.md`、`references/SECURITY.md`、`references/FAILURE_RECOVERY.md`(quality / loop / security / failure-recovery)。
3. 确认 branch/workspace、base、干净的归属边界,以及要保留的无关用户改动。
3.5 **术语/歧义门禁(Spec Ambiguity Resolver)——在任何产品代码写之前清掉。** 从合同/计划里提取本功能触及的领域术语,对照 `docs/domain/GLOSSARY.md` 交叉核对(用 `subagent` 工具派 `domain-knowledge` 角色子代理)。任何**未定义、或标记为歧义 / 同名不同实体**的术语,STOP 并给出一份简短的「待确认术语」清单;不要猜含义。**按 `references/HUMAN_COMMUNICATION.md` 写这份清单——这是整条流程里术语最重、也最容易被猜着回答的请求。** 能定义领域术语的是业务人员,不是编译器:不要问「`Shipment` 在 `GLOSSARY.md` 里未定义,是否等同 `OrderFulfillment` 实体?」。问这个词在 TA 业务里是什么意思、你在哪看到的、你本会怎么假设、假设错了会怎样——然后把候选含义当成后果来呈现(「如果它指的是 A,那么一张订单拆成三次发货就会在列表里显示成三条;如果指 B,就显示成一条」)。绝不要因为技术区别对你显而易见,就不说一个术语的业务后果。由人类定义它(加一行到 `GLOSSARY.md`,或需要业务输入时记到 `docs/domain/OPEN-QUESTIONS.md`)——然后继续。当不再有未定义/歧义术语时,写标记 `ai-nseos/state/features/<feature-id>/ambiguity-cleared`。机器 doc-gate 在 `tools/pre-execute` 会 deny 对产品代码的 write/edit,直到这个标记存在——所以这道门是机械强制的,不只是建议。(还没有 `docs/domain/` 的仓库——例如未迁移到文档体系的——不在门禁范围内;它 fail-open。)
4. 置 `IN_PROGRESS`,追加状态历史,实现下一个最小的已批准计划步骤。
4.5 **Autopilot 分支——仅当 `ai-nseos/state/features/<feature-id>/` 下 `DELEGATION_MATRIX.md` 与 `TEST_TARGETS.md` 两者都存在时。** 两者都在意味着 `nseos-autopilot` 已关闭需求确认阶段,本功能运行在 `Delivery mode: autopilot` 下。

   - **两者都不在 → 整步是 no-op。** 交互模式的停-问点不变,下面没有任何内容授权跳过一个。
   - **恰好一个在 → 不要进入 autopilot 分支。** 停下并报告缺的是哪一个。这对文件不是装饰:矩阵授权自决,`TEST_TARGETS.md` 是分级打断阈值的分母——没有它就跑 autopilot,意味着 `< 30%` 的检查没有可除的东西,那个强制打断的唯一保险丝会静默地永远不触发。一份半建的合同是不完整的确认阶段,不是继续的许可。
   - **两者都在 → 在 flow marker 上记录模式**,让本次 run 事后可追溯:重写本会话 marker,`"mode"` 改为 `"autopilot-build"`(与第 0 步同一套 `write` 规则、同一个「本会话 id」,只有 `mode` 值不同)。门禁不读 `mode`,所以这不改变任何门禁结果;它存在是为了让事后查看 `ai-nseos/state/flow/<session-id>.json` 时能看出本会话实际跑在哪个交付模式下。

   然后,凡流程本来会停下问人类的地方,改查授权矩阵。先读 `references/AUTONOMY_POLICY.md` 和本功能的 `TEST_TARGETS.md` / `DECISION_LOG.md`:

   | 情形 | 动作 |
   |---|---|
   | 矩阵覆盖了它 | 按其声明的默认值决定 → 追加一行 `DECISION_LOG.md`(时间、触发、所依据的矩阵条目、所做选择、触及的文件、是否可单独回滚) |
   | 未覆盖,但按 `references/AUTHORITY.md` 的「可否预授权」列属于可预授权 | 取最近同类条目的**最保守**读法做决定 → 追加该行并标注 `类推自决` |
   | 未覆盖且该类别是**否**(不可预授权) | **挂起该条目**——追加一行挂起条目(撞到了什么、为什么不可预授权、影响哪些 `TEST_TARGETS.md` 条目、是否阻塞主干),然后去做不依赖它的工作。不要决定它、不要问、不要停滞。 |
   | 某个**测试实现细节**必须改(mock 接线、选择器、拆分/合并测试用例)— D5 | 自主修改 → 追加一行决策日志 |
   | 某个**测试断言的业务语义**必须改(期望值、边界条件、是否应报错)— D5 | **挂起它。** 改断言的语义就是改已批准的验收判据,这永远不可预授权,无论这个断言看起来错得多明显。 |
   | 应向 `TEST_TARGETS.md` **新增一行** | **挂起它。** 新增目标跟编辑目标一样是改验收判据,哪怕这个缺失的目标显然正确、确认阶段显然是漏了。这张清单还是分级打断阈值的分母,所以自行加行等于让容易变绿的条目把比例灌回 30% 以上,把一个本该打断人类的局面粉饰过去。 |
   | 某条目缺活路径证据 | **不是挂起。** 和交互模式(第 11 步)完全一样地用 `PENDING_LIVE_VERIFY` 和一条具名 PENDING 条目。挂起针对的是缺失的*人类决策*;`PENDING_LIVE_VERIFY` 针对的是缺失的*证据*。把未验证条目记成挂起,会让它享受挂起条目「不阻塞主干、功能继续推进」的待遇,从而绕开「测试加读代码永远到不了 done 类状态」这条规则。若一条目两者都缺,两者都记。 |
   | 一道机器门禁 deny(action-gate / doc-gate / skill-gate) | **被 deny 的门禁是一次正当挂起,不是失败。** 精确报告缺哪些条目、已经完成了什么,然后挂起。**绝不自铸发布凭据**(`ai-nseos/state/.release-ready.json` 的 `review` / `prod_schema` / `doc` 字段),**绝不关阀门、也不要求人类去关**——门禁逃生舱见 `DECISIONS.md` D5#10(人类运维,模型不得自关)。「不能打扰用户」不是绕过门禁的授权;它正是催生 `FB-20260725-003`(一个真实会话在长跑压力下第三次尝试时,关掉门禁阀门强行 `git push`)和 `FB-20260725-004` 的那种压力。 |

   挂起是条目级的,功能保持 `IN_PROGRESS`;只有 `references/STATE_MODEL.md` 的分级打断阈值(可推进剩余 / 未完成 `TEST_TARGETS.md` 条目 `< 30%`)才把它变成 `BLOCKED` 并打断人类。每加一条挂起条目就重估一次比例,而不是只在最后估。**这里没有任何东西放宽证据:** 活路径验证、`PENDING_LIVE_VERIFY`、第 5 步的实现边界、第 10 步的循环预算全部原样适用——autopilot 改的是*何时问人类*,绝不是*什么必须被验证*。

   **一个决策,一个 commit。** 因为人类可能在最终验收时拒绝某条自决,每条 `DECISION_LOG.md` 记录都必须能单独回滚:边做边小步 commit,一个决策一个 commit,在 commit message 里引用决策日志条目的 id(用 `DECISION_LOG.md` 的 `D-xx` id,如 `feat(orders): 拆行发货按单条展示 (D-03)`),并把该行的「对应 commit」列填上产生的 sha。一个横跨五条自决的大 commit 会把验收评审变成全有或全无,使记录它们失去意义。这不改变下面那条常设规则——这里允许 commit,push/merge/release 仍不允许。
5. 只用 `feature-developer` 角色子代理(`subagent` 工具)做有界任务;编排与最终状态留在主会话。这同样适用于修复循环(FB-20260719-003):`NEEDS_FIX` 之后或活路径验证被拒之后的产品代码修复,也应由 `feature-developer` 子代理(测试驱动开发)来实现,而不是由编排会话就地打补丁——不会因为改动「只是修复」就放宽边界。如果你必须直接改产品代码,把一行理由写进 `ai-nseos/state/.impl-boundary-ack`,让这次越界留在记录上而不是含糊不清(一份子代理修复报告旁边躺着一处编排者直接改动,事后「谁改的」就再也查不出来了)。
6. 遵守本项目已验证的命令与约定。不要从别的项目猜。
7. 加有意义的测试,先跑最窄的相关检查,再跑更宽的必检。**在你不知道一个绿灯能让它变红之前,绿灯一文不值**——每新增或改动一个守卫型测试,故意破坏实现、确认测试变红、还原,并把这三样都记进交接单(`references/VERIFICATION.md` §3–§4;在 scratch 副本里做破坏,或通过还原你自己的编辑来做,**绝不要**在一个装着别人未提交工作的树里用 `git reset`/`git checkout --`)。这里真实发过货的两种形态:**恒真断言**(以一个毫无权限的身份去断言某个控件不可见——被权限门无条件满足;某批真实发过 12 个,全绿,全无价值)和**不是结果的代理**(HTTP 200 ≠ 页面渲染了;在 DOM 里存在 ≠ 用户点得到)。没看过 X 把它变红就说「这个测试现在能防 X」是虚假报告,而且事后查得出来。
8. 置 `VERIFYING`,把 `ai-nseos/state/FEATURE_INDEX.md` 里本功能的那一行同步到位(`references/STATE_MODEL.md` 拥有那份账本的规则),然后**停在那里——build 到此结束(v0.25.0)。** 不要安排评审者,不要写 Review Report,不要把状态推进过 `VERIFYING`;`nseos-review-feature` 拥有评审者派发、Review Report 与结论。v0.24.x 之前两个技能都派评审者、都写报告,结果要么重复付费评审,要么更糟——一个 build 阶段自己闭环、从没遇见独立评审。build 停下前真正要做的是:收集候选证据。对用户可见的改动,这意味着在真实运行的应用上验证(真实 UI/CLI/API 路径、真实 console 与网络输出),再宣称任何一条验收判据通过;只有绿灯测试不关闭一条用户可见判据。当需求或所报 bug 关注的就是真实路径时,对着 mock 或 stub 栈验证不算数——要去跑真实 provider/环境,否则该判据保持未验证。
9. P0 停下并升级。P1 进入 `NEEDS_FIX`。P2 在影响验收时需要 Owner 处置。P3 与未批准的增强进 Backlog。当 P0 升级或 P2 处置问题要交给人类时,按 `references/HUMAN_COMMUNICATION.md` 写:先用日常语言说这个缺陷对真实用户或真实数据做了什么,再说严重性标签;绝不为了可读性把不可逆或丢数据的后果软化成「建议谨慎」。
10. 遵守合同的循环/时间/成本预算。耗尽即置 `BLOCKED`。
11. 写**实现交接单**(不是 Review Report)并交给 `nseos-review-feature`。**build 绝不置 `READY_FOR_INTEGRATION`**——只有 `nseos-review-feature` 能把功能移出 `VERIFYING`。缺少真实活路径证据(screenshot、console、network、真实 HTTP 响应、真实 DB 回读或 CLI 输出)时,改为在交接单上记 `PENDING_LIVE_VERIFY`:测试加读代码永远到不了 done、verified、`READY_FOR_INTEGRATION` 或 released 类状态。推迟活路径验证——推迟到迁移时、推迟到之后的会话、或推给用户——是显式例外,所以每次推迟都要在 Feature State 和 Handoff 里记一条具名 PENDING;在散文里披露它不打通门禁。**甩给用户一个 URL 和一份「试试这些」清单不是完成报告(FB-20260728-002)。** 没有你自己做的活路径验证,就不能说工作完成,而且**用户的验收测试永远不算开发者的 QA 这一道**——它是第二道防线,不是第一道。测出来的形状:admin URL 返回 HTTP 200,URL 给了用户,用户打开的是空白页。dashboard bundle 继承了 `NODE_ENV=development`,死在 `Failed to fetch dynamically imported module: .../en.po`;DOM 快照空,console 红。一个状态码看不见白屏——只有打开页面才看得见。
11.5 **记录本功能引入的业务规则(FB-20260720-002)。** 如果本功能新增或改动了一条读者光靠代码推不出来的业务规则——阈值、上限、频率、校验条件或计算(例如 OTP 尝试上限、每 IP 频率限制、折扣公式)——把它记进 `docs/domain/BUSINESS-RULES.md`,带一个具体的数字例子和一个置信标签(`validated` / `inferred-from-code` / `unverified`);需要业务确认的就记到 `docs/domain/OPEN-QUESTIONS.md`。术语门禁(第 3.5 步)覆盖的是未定义的*术语*;它抓不到那些被实现了却从没写下来的*规则*,所以这是另一项单独的显式义务——否则 `BUSINESS-RULES.md` 一直是一张空模板,而真实规则却在发货(实况:bonohair-rebuild 的 `BUSINESS-RULES.md` 自 init 以来零更新,尽管 OTP 上限和频率限制都在发货)。只有带 `docs/domain/` 的仓库在范围内。当本工作的发布到达主干 push 时,机器 action-gate 会要一行 `ai-nseos/state/.release-ready.json` 的 `doc` 字段(FB-20260720-004)来证明这个判断做过——在这里就把记录做了,那次 ack 才是诚实的而不是橡皮图章。

无论何时把任何东西摆到人类面前——完成报告、阻塞性提问、挂起条目或缺失前置条件的状态报告(第 4.5 步与第 10 步),或一次升级——都写给一个没看过过程的人(FB-20260717-003):先给结论和任何 TA 必须决定的事;每条发现或待办一行、写成完整句(「预期 X,实际 Y,影响 Z」);内部 ID/标签首次出现即解释。**在这之上,默认读者完全不懂 IT——按 `references/HUMAN_COMMUNICATION.md` 措辞。** 这两条是叠加,不是重叠:FB-20260717-003 解决「读者没看过过程」(结论先行、完整句、内部 ID 解释),`HUMAN_COMMUNICATION.md` 解决「读者不懂技术」(选项陈述成后果而不是实现、每个技术词翻译、严重性绝不软化)。一份报告可以满足其一却通不过其二。**再叠加规则七(分层与篇幅,`FB-20260802-001`)**:开头 5 行内给「一句结论 + 需要你做什么 + 最多 3 条一行要点」,背景与证据放它下面;正文超过一屏(约 25 行)时结尾追加 3–6 条一行的「精炼版」(结论 + 待决策 + 风险);一条发现压到 1–2 行而不是一段。**砍的是修辞和过程,不是信息**——严重性、不可逆性、影响范围、数字与待决策项一个都不许因为求简而消失,与「精确性不可牺牲」冲突时后者赢,压不下去就分层。

未经单独的显式授权,绝不 commit、push、merge、deploy 或标记 RELEASED。
