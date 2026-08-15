# Failure and Recovery Workflow

## Failure classes

| Class | Examples | Response |
|---|---|---|
| Transient | rate limit, temporary network/tool failure | bounded retry with backoff |
| Deterministic implementation | test consistently fails | root-cause analysis, then fix loop |
| Environment | missing service, invalid fixture, unavailable CI | block and repair environment |
| Scope/authority | required change not approved | block and request contract decision |
| Security/data | secret exposure, unsafe command, data damage risk | stop immediately and escalate |
| Coordination | conflicting interface/schema assumptions | serialize and obtain architecture decision |

## Retry policy

- Never retry a destructive or non-idempotent action automatically.
- Maximum automatic retry is the smaller of project policy or three attempts.
- A retry must record the error and reason another attempt may succeed.
- Repeating an unchanged deterministic failure is not recovery.

## Root-cause discipline: kill the whole class, not one hypothesis at a time

**根因是假设,不是事实。** 动手改代码前,必须先复现 + 取证(负控制)证明根因;证明不了就继续调查(搜 vault 历史、读日志、复现),不许「自以为知道根因」就下手。交接单 / 历史 / 上一棒结论里写的根因同样是**假设**,接手先验证再采信——FB-20260815-003:一个「继续开发」交接会话反复「自以为知道根因、完全不进行调查」,每次都从上一棒写的根因出发直接改,而那条结论从没被复现过。

实测一个排障会话在约 1.5 小时内连错三次：Obsidian 锁 → 原地升级身份破坏 → iTerm 缺权限 → 最终是 360 安全卫士的端点防护。三次都从「一个听起来合理的假设」出发，在同一个假设类里换下一个成员，而那条硬事实（完全磁盘权限确实生效）本应在两轮前就杀掉整个「缺权限」类。

规则：当一条**已确立的事实**和**一整类假设**矛盾时，先杀整类，别在类内换假设。判断标准是「我是在换一个更细的假设，还是在换一个不同性质的原因」——前者再试两次就该回头质疑那个被当作前提的「已确立事实」是否真的成立（`references/STATE_MODEL.md` 的「人类已确立的事实是锚」）。这条与 `Retry policy` 叠加：换假设不是重试，但「连换三次同类假设」和「重复一条不变命令」一样，都不是恢复。

## Checkpoints

Before risky or long work, record current branch/revision, working-tree status, feature state, completed plan steps, verification results and next safe action in `HANDOFF.md`.

## Recovery

- Preserve unrelated user changes.
- Prefer reverting the feature's own small diff or restoring from an approved checkpoint.
- Do not use destructive Git commands to obtain a clean state.
- After recovery, rerun the checks that prove both the failure and recovery result.
- If the environment is no longer trustworthy, stop and rebuild an isolated environment rather than continuing on uncertain state.

## Blocked state

`BLOCKED` must name the blocking fact, evidence, impact, actions already attempted, required decision/authority and safest next step. It is not a vague status for difficult work.

**Write the `BLOCKED` report per `references/HUMAN_COMMUNICATION.md` — assume the reader does not understand IT at all.** This stacks with the standing readability rule (FB-20260717-003: conclusion first, one item per line as a full sentence, internal IDs explained on first use) rather than replacing it: FB-20260717-003 solves *"the reader did not watch the process"*, `HUMAN_COMMUNICATION.md` solves *"the reader does not understand the technology"*.

This report matters more than most, because the human reads it to decide **how to unblock the work** — a `BLOCKED` he cannot act on has failed even if every technical fact in it is correct. The six required elements map onto plain language like this:

| Element | What the human actually needs |
|---|---|
| Blocking fact | What has stopped, said as a situation rather than an error string ("我没法确认改完的东西是对的，因为测试环境连不上那个外部支付接口") |
| Evidence | What you saw, in one line he can hand to someone else |
| Impact | Which part of what he asked for is now not going to happen, and when he will notice |
| Actions attempted | What you already tried, so he does not send you back to redo it |
| Required decision/authority | **Exactly what you need from him or from whom** — named person or named permission, not "需要 owner 确认" |
| Safest next step | What you recommend, and what happens if the decision waits |

Never dress a blockage as progress, and never soften the required authority into a suggestion. Two specific cases: an unmet machine gate is a legitimate `BLOCKED` (`references/INTEGRATION_AND_RELEASE.md`) and must be reported as work not yet done, not as a tooling annoyance; and a `Security/data` class failure keeps rule five at full strength — see `references/SECURITY_POLICY.md`.

## 合法 BLOCKED 是终点,不是「还没做完」(v0.25.1, FB-20260727-005)

**一个记录完整的合法 `BLOCKED` 就是本轮工作的正当终态。** 到了这里,正确行为是把「还差哪几项 + 已经做完了什么」如实报给人类,然后**停下**——不是再想办法、不是换个说法重试、更不是自签凭据或关阀门凑过去。

两种合法终态,分开记:

- `BLOCKED_ON_HUMAN` —— 缺的是人类授权或业务事实(合并授权、生产口径、只有业务方知道答案的问题)。
- `BLOCKED_ON_GATE` —— 撞到机器门禁,而缺的那项工作确实还没做。

进入这两态时,把 blocker 记成**可比对的指纹**(阻塞类型 + 缺的那一项 + 相关 feature/commit),这样第二次遇到同一个 blocker 时可以判定「状态没变」而不是重新分析一遍、重新汇报一遍。

**外部 goal / Stop 机制的压力不改变上面任何一条。** 已实测:一个会话在剩两项人类决策时被连续要求继续约 31 次,其中约 28 次那个评估器**自己的理由里已经写明**阻塞是人类决策边界——机制一边判定「停在这里是对的」,一边继续施压「还没完成」。**这种情况下正确的行为仍然是如实报 BLOCKED 然后停**,反复重述不会产出任何东西,只会烧掉额度。

**诚实边界:那个 goal / Stop 评估器不属于 AI-NSEOS,插件改不掉它。** 本节能做的是给出 NSEOS 侧的终态语义与指纹,让本框架内的流程不再自我施压;它**不能**、也不要声称能终止外部循环。给人类的可操作建议只有一条:**有硬人类审批门的任务,不要挂 `/goal` 之类的自动续跑。**
