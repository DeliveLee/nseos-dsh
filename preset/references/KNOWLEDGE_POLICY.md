# Knowledge Governance

## Principle

知识库保存经过验证、未来仍有复用价值的事实和决策，不保存每次对话的流水账。Agent 生成的总结默认只是候选知识。

## Knowledge classes

- `FACT`：由代码、配置、运行数据或正式文档支持。
- `DECISION`：已批准的架构或工程决策。
- `PATTERN`：在多个案例中验证过的实践。
- `FAILURE`：失败方案、触发条件和避免方式。
- `HYPOTHESIS`：尚未验证，只能用于后续调查。
- `POLICY`：由明确 Owner 批准的强制规则。

## Required metadata

每条记录必须包括 ID、类别、摘要、证据来源、适用范围、Owner、创建日期、复审日期、置信度、敏感级别、状态以及替代/失效关系。

## Admission rules

- 有稳定证据并且未来可复用；
- 不包含秘密、个人数据或无权传播的内容；
- 不把项目局部约定误写为公司规则；
- 失败方案必须说明为何失败以及在何种条件下可能重新适用；
- HYPOTHESIS 不得被 Agent 当作事实执行。

## Retrieval rules

检索到的知识必须与当前代码和版本重新核对。发现冲突时优先相信当前仓库事实，并创建过期或替代记录。

## Lifecycle

`CANDIDATE -> REVIEWED -> ACTIVE -> SUPERSEDED/EXPIRED/REJECTED`

只有具名 Owner 可以把候选记录设为 ACTIVE 或 POLICY。

