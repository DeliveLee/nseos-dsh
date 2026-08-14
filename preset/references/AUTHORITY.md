# Decision Rights and Human Gates

## Principle

Agent 可以分析、建议和在明确范围内执行，但风险接受与业务决策必须归属于可识别的人类 Owner。

## Decision matrix

「可否预授权」列只在自主模式（`Delivery mode: autopilot`）下有意义：它回答的是「这类决策能不能事先写进 `DELEGATION_MATRIX.md`（授权书），让执行期的 AI 照章自决而不打断人类」。**它不改变本表中段「Required human authority」一列**——预授权是人类**提前**行使该权限并留下书面依据，不是把权限让渡给 AI。协作模式下该列不适用，一切照中段执行。

| Decision | Agent role | Required human authority | 可否预授权（autopilot） |
|---|---|---|---|
| 补充产品能力建议 | Product analyst proposes | Product owner approves scope | 可（默认处置：Expected → Backlog） |
| 修改已批准验收标准 | Analyze impact only | Product owner | **否** |
| 普通实现细节 | Developer decides within plan | No extra gate | 可（本就无需门禁，不必写进授权书） |
| 改变公共接口或数据模型 | Architect proposes | Technical owner | **有限可**：仅「不破坏兼容」方向；破坏性改动**否** |
| 新增外部依赖 | Evaluate and recommend | Technical/security owner | **有限可**：预授权白名单内可；名单外**否** |
| 读取敏感数据或提高权限 | Must not self-authorize | Security/data owner | **否** |
| 合并到保护分支 | Prepare evidence only | Code owner | **否** |
| 数据迁移、删除、回填 | Draft and test only | Technical + data owner | **否** |
| 发布和回滚 | Prepare/run only when explicitly authorized | Release owner | **否** |
| 接受未解决的 P0/P1 风险 | Must not accept | Named accountable owner | **否** |
| 写入组织级知识 | Draft candidate | Knowledge/technical owner | 可（仅草稿级，状态停在 `CANDIDATE`） |

读法：**「可」= 授权书写了就照办并追加决策日志**；**「有限可」= 只在标注的方向内自决，越界即挂起**；**「否」= 授权书里写了也不算数**——遇到即挂起该条目、记挂起清单、跳去做不依赖它的工作。人类若确实想放行某一条「否」，办法是在场亲自决定，不是把它写进授权书。

## Escalation triggers

立即停止相关动作并请求人类决策：

- 需求、代码和现有文档相互冲突；
- 修改超出 Feature Contract；
- 涉及生产、真实客户数据、秘密或高权限；
- 需要破坏性命令、强制推送、历史重写或不可逆迁移；
- 测试无法运行或验证环境不可信；
- 发现安全漏洞、数据丢失风险或合规问题；
- 超过循环、时间或成本预算；
- 两个并行功能争用同一接口、迁移或共享文件；
- Agent 无法提供支持结论的证据。

**提出这些升级请求时按 `references/HUMAN_COMMUNICATION.md` 书写——默认读者完全不懂 IT 技术。** 它与既有可读性要求（`FB-20260717-003`：结论先行、一条一行完整句、内部编号首次出现即解释）是**叠加**关系而非替代：前者解决「读者没跟看过程」，后者解决「读者不懂技术」。本节触发的恰恰是全流程后果最重的几类请求（生产数据、不可逆迁移、安全漏洞、数据丢失），**规则五「精确性不可牺牲」在这里没有任何折扣**：把「这一步开始后改动前的数据找不回来」写成「建议谨慎操作」，等于骗到一个读者并不理解其后果的批准。

## Escalation triggers 在自主模式下

**上面 9 条触发器在 `Delivery mode: autopilot` 下一条都不消失。** 变的只是撞上之后的动作：

| | 协作模式 `interactive` | 自主模式 `autopilot` |
|---|---|---|
| 撞到触发器 | **立即停止相关动作，等人回答** | **挂起该条目**（记 `DECISION_LOG.md` 挂起清单）→ 继续做不依赖它的工作 |
| 何时打断人类 | 当场 | 仅当剩余可推进条目跌破 `STATE_MODEL.md` 的 30% 阈值，转 `BLOCKED` 并立即打断 |
| 触发器本身 | — | **完全相同，不放宽、不删减** |

两条不因模式而改变的红线：

1. **「相关动作」照样立即停。** 挂起换掉的是「等」，不是「停」——触发器命中的那个动作本身仍然不许做。自主模式允许 AI 转身去做别的，不允许它继续推进撞线的那件事。
2. **门禁凭据永不可预授权。** `ai-nseos/state/.release-ready.json` 的 `review` / `prod_schema` / `doc` 三个字段，无论授权书怎么写都不能由 AI 自签充数；`AINSEOS_ACTION_GATE` / `AINSEOS_SKILL_GATE` / `AINSEOS_DOC_GATE` 属人类运维，模型不得关闭、也不得请求人类关闭。**撞到机器门禁是合法挂起**——如实报「差哪几项 + 已完成什么」然后停（`FB-20260725-003` / `-004`）。这份报告同样按 `references/HUMAN_COMMUNICATION.md` 书写：门禁 deny 文案的首要读者是模型（它列的是文件名、字段名、环境变量），**要转述成人话，不要原样粘给人类**；也不要把「还差一次独立评审」说成流程手续，没做就是没做。

## Approval record

审批必须记录：决策、批准人、日期、适用范围、风险和失效条件。仅在聊天中说“应该没问题”不构成可复用审批。

