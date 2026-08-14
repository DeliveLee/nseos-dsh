# AI-NSEOS Operating Model v0.1

## Purpose

在保留人类责任和现有工程控制的前提下，让 DSH 更可靠地完成需求澄清、计划、开发、验证、交接和知识沉淀。v0.1 的目标是验证最小闭环，不是一次建立全自动平台。

## Non-goals

- 不追求无人监督的生产发布。
- 不用 Agent 替代所有确定性 CI、脚本和规则。
- 不以 Agent 数量或代码生成量衡量成功。
- 不让 AI 自行决定业务优先级、合规例外或风险接受。
- 不在未验证前建立庞大的跨项目知识平台。

## Four layers

1. **Human governance**：定义价值、范围、风险容忍度并批准高风险决策。
2. **Main Claude orchestrator**：维护状态和工件，路由工作，综合证据。
3. **Specialized workers**：在受限工具和边界内完成独立分析、实现或验证。
4. **Deterministic systems**：Git、CI、测试、静态分析、构建、监控和权限控制。

## Minimal role set

| Role | Responsibility | May change code | May approve own output |
|---|---|---:|---:|
| Product analyst | 隐含需求、用户路径、边界和完整性建议 | No | No |
| Architect | 依赖、接口、迁移、风险和实施边界 | No | No |
| Feature developer | 按批准计划做小范围实现和测试 | Yes | No |
| Quality reviewer | 独立复核差异、测试、安全和验收证据 | No | No |
| Integration reviewer | 检查跨功能冲突、兼容性和发布准备 | No | No |
| Human owner | 批准范围、例外、合并与发布 | N/A | Yes |

## Workflow selection

| Work type | Default execution |
|---|---|
| 格式化、lint、生成代码、固定检查 | Deterministic command/CI |
| 小修复、需要同一上下文连续推理 | Main Claude |
| 产品分析、架构检查、独立评审 | Specialized subagent |
| 多个边界清晰的功能 | Separate branches/worktrees and sessions |
| 强耦合共享修改 | Serial execution with one integrator |
| 高风险或不可逆动作 | Human approval and deterministic controls |

## Control principle

Agent 可以提出建议和执行被授权的修改，但不能扩大自己的授权。Prompt 是行为指导，不是安全边界；真正强制的规则应由权限、沙箱、分支保护和 CI 实现。

## Evolution rule

只有当试点数据证明当前瓶颈确实来自能力不足，而不是流程、上下文或测试不足时，才增加 Agent、自动化或外部集成。每个新组件必须有明确的输入、输出、Owner、评估和删除条件。

