# Risk Assessment: <ID>

> **写法**：本文件按 `references/HUMAN_COMMUNICATION.md` 撰写，**规则五（精确性不可牺牲）在这里零折扣**。
>
> `Residual decision` 一列对应 `references/AUTHORITY.md` 的「接受未解决的 P0/P1 风险 → 具名担责人」这道门禁。**「接受一个未解决的 P0/P1」是整套系统里后果最重的人类动作之一**——签字的人必须真的理解他在接受什么，而不是在一个他没看懂的风险等级标签旁边写下自己的名字。
>
> 因此每条残余风险要写成三句人话：**如果它发生，用户 / 数据会经历什么？我们多久能发现？能不能补救、补救要多久？** 「等级 High、已加监控」不构成其中任何一句。
>
> 反面：「存在数据一致性风险，已通过重试机制缓解」。正面：「对账时两边金额可能对不上，目前要等财务月底核账才会发现，最长可能过一个月；发现后能靠日志重算补回来，约两天。」

| Risk | Asset/outcome | Probability | Impact | Evidence | Prevention | Detection | Recovery | Owner | Residual decision |
|---|---|---|---|---|---|---|---|---|---|
| | | Low/Med/High | Low/Med/High/Critical | | | | | | |

## Trust boundaries

- Users/roles:
- External inputs:
- Sensitive data/secrets:
- Tools/services:
- Agent permissions:

## Required approvals

每条写清**要谁批、批的是哪一条风险、他一旦签字就等于接受了什么后果**。只写「需安全负责人批准」不够——他要能从这一行看出自己在担什么责。

-

