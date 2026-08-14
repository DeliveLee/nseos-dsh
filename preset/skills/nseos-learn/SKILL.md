---
name: nseos-learn
description: 把已验证的项目成果、失败或决策转成带来源溯源、受治理的知识候选,可在稳定验证结果之后自动触发;防止一个项目的假设自动变成全局策略。
---

# 沉淀受治理的项目知识

触发来源:$ARGUMENTS

0. 先标记流程激活,让 skill-gate 放行步骤内工具技能。用 `write` 工具把 flow marker 写成单行 JSON 到 `<仓库根>/ai-nseos/state/flow/<session-slug>.json`:`session_id` 取本会话 id(勿猜、勿留占位符,门禁据此归属),`mode` 填 `learn`,`contract` 一行知识来源要点。JSON 结构与校验语义见 `FLOW_MARKER_CONTRACT.md`(空文件/错 session/过期 >4h → 门禁 deny)。
1. 要求项目已初始化;读取相关 contract、review、handoff、ADR、release 证据与仓库事实。
2. 读 `references/KNOWLEDGE_POLICY.md`(知识策略)与 `templates/KNOWLEDGE_RECORD.md`(知识记录模板)。
3. 每条可复用的教训,在 `ai-nseos/knowledge/candidates/` 下建一条记录。
4. 分类为 FACT / DECISION / PATTERN / FAILURE / HYPOTHESIS / POLICY。来源 feature 是 `PENDING_LIVE_VERIFY`、或只凭测试与代码阅读而无活路径证据的教训,至多算 HYPOTHESIS——永不标 FACT。
5. 写入 source、项目/版本适用性、不适用性、Owner、置信度、敏感度、review 日期与过期信号。
6. 删除密钥、个人数据与不必要的原始日志。
7. 状态设为 `CANDIDATE`。

绝不把项目知识自动提升为跨项目或组织级策略。必须由一位具名人类 Owner 单独评审、泛化并批准。

把候选放到 Owner 面前——或请他确认分类、适用边界、敏感度判定时——按 `references/HUMAN_COMMUNICATION.md` 写请求,默认读者完全不懂 IT。这与既有可读性规则(FB-20260717-003:结论先行、一条一行完整句、内部编号首次出现即解释)叠加而非替代:前者解决「读者没跟看过程」,后者解决「读者不懂技术」。用平实的话说清:这条教训若成为常驻策略会改变什么,以及它在哪里会被用错;FACT/HYPOTHESIS 标签是归档类别,不是解释——一个批准了自己复述不出来的策略的 Owner,正是这道门禁要防止的橡皮图章。
