# 决策日志(DECISIONS)

> 状态:实施前决策已锁定(D0–D5 + 分发 + 降级)。本文件是 P0 的产物之一,后续每阶段决策追加于此。

## D0 · 基准源与深度

- 基准源 = Claude 插件 `<upstream-nseos>`(直接重新推导,**不以 Codex 迁移为基准**;Codex 版效果差、维护成本高,仅作反面教材)。
- 深度 = 全量对等,**对等 = 效果对等**(机制用 DSH 原生面替换)。三层:核心全量 / 机制替换(论证等价)/ 诚实降级(显式边界)。

## D1 · 对等边界与降级说明(用户已裁决)

| 项 | 降级后形态 | 去掉 | 保留 |
|---|---|---|---|
| Obsidian 知识库 | `nseos-knowledge`(并入 `nseos-learn`),阶段边界触发/手动,写 vault 指定路径 | 自动双向同步、Stop 门禁强制、`.obsidian/` 插件安装 | 知识沉淀能力 + 5 个 Obsidian note 模板(vault 路径待用户配置) |
| doc-audit cron | `nseos-doc-audit` 手动 sweep skill(无路由 stale 提醒——路由层无「检测文档 stale」能力,诚实标注) | 自动定时调度(DSH 无 cron) | 漂移检测、只改 `*.md`、开 PR 不自动合、剪枝留人确认 |
| 分发 | 单独 GitHub 私有库,每次完成打 tag + release | `dist/*.zip` + `TEAM-INSTALL.md` | 版本化分发 + 安装路径(仓库名待用户提供) |
| 621 测试 | 语义重表达为门禁负控制(≤100) | Python hook 测试本身 | marker 五态 / RELEASE_CLASS / done-claim / stale 判定语义 |

诚实缺口(明示,不伪装对等):DSH 无 cron → doc-audit 漂移只能被动(路由提醒)或手动发现;Obsidian 自动同步消失。

## D2 · 命名与去重(用户已裁决)

- 前缀 = **`nseos`**(迁移产物统一 `nseos-*`)。
- skill-gate allow-list = 迁移后的 `nseos-*` 生命周期技能显式 kebab-case 名(数量 = 最终收敛后的生命周期技能数)。
- 存量 6 skill 去重:
  - `deliveli-delivery` → **吸收进 `nseos-route-work`**,退役/降为一句话别名;其 `$nseos-*` 幽灵引用改写为真实 `nseos-*` 名。
  - `requirements-discovery` / `web-app-verification` / `product-ux-redesign` / `long-running-execution` / `deliveli-project-memory` → **保留为「步骤内工具」层**,被 nseos 生命周期技能在步骤内调用(类比 Claude 版 superpowers 是内层工具);流程外调用会被 skill-gate deny,流程内放行。

## D3 · 机制映射(评审 B 定稿)

- deny 全走 `tools/pre-execute`(async,`PreToolDecision.deny{reason}`);`tools.guard`(同步)、`fs/write-intent/edit-intent`(版本守卫)都**不用**。
- session 路由 → `agent/session-start` + `agent.inject()`(不用 `systemPrompt.section()`,拿不到按会话上下文)。
- prompt 路由 → `agent/pre-step`(每人类回合首 step 注入,只注入不 reject)。
- progress-gate Stop → `agent/turn-stopping` + `ctx.sessionQuery` 自读收口文本 + `agent.steer()` 拦截 + `storageDomain` 预算。
- 8 agents → `subagents.registerProvider()`;只读 reviewer = provider `start()` 内设 `toolFilter.deny`(write/edit/bash/subagent/…)+ `maxDepth=1`(禁递归)。**修正**:DSH one-shot provider 的 `start()` 不暴露「按 child 设 sandbox mode」的通道(`SubagentStartRequest` 只有 persona/toolFilter/maxDepth/agentOptions,agentOptions 只含 provider/model/maxTokens);沙箱 mode 是「父会话显式 override」沿继承链传递,provider 不能 per-child 覆盖。所以「只读」由 toolFilter 兑现——它是**真机器边界**(被 deny 的工具从子代理 tool 注册表移除、且拒绝执行),不是 prompt 声明;更强的「沙箱级只读」需改 DSH 驱动,属过度实现,已诚实标注为已知限制。
- 审批门禁 = `approval.request()`(工具级)+ 合同状态进 Phase 3 + 人类批范围 `userQuestions.ask()`;门禁只用 allow/deny,不用 ask(无 approval 服务时退化为 deny)。
- `ToolExecution` 无 cwd/分类字段:工具名重键 + `arguments.*` 取参 + `sandboxPolicy.resolve` 推仓库根;orchestrator-vs-subagent 用 `exec.agent` + `agents.requireInitiator()`/`isOwnedBy()`。

## D4 · 复杂度预算

- **反 Codex 硬不变量(不可越线)**:自建有生命周期的状态组件 ≤ 1(仅 flow-marker:4h 新鲜度/归属/跨会话 deny);**无状态机**(不论语言);无第二个状态文件;**门禁测试 ≤ 100 个 test 块**。其余持久化 JSON(`.release-ready.json` 的 review/doc/prod_schema 凭据、`.gate-armed`/`ambiguity-cleared`/`.impl-boundary-ack`)是**无状态 attestation/ack 标记**——无 TTL、无迁移、无生命周期转换、每次 release 对着当前 HEAD 重新校验,head_sha 不符只报 gap 不回滚;它们不是「有生命周期的状态组件」,不计入本条。
- **JS 行数预算(诚实重估,v0.13.0)**:原「≤1000 行」在 v0.13.0 精确化 action-gate 后超线(实测 lib 1193 行)。重估为「机器层 JS ≤ 1500 行;纯谓词 `core.js` ≤ 500 行」。行数超的不是状态机逻辑,而是 (a) 精确分类器(移植 Claude `_release_class`,约 130 行,替换原 5 条粗糙正则——这是精度修复不是膨胀);(b) 必要的人类可读 deny/注入文案。**行数是「别过度工程」的代理,不是过度工程本身**——挪目录/删文案不能假装达标,判据是「没有状态机、没有第二个 schema、谓词保持纯函数」。
- 若未来长出「跨会话恢复 / 迁移 / 回滚」诉求,那是 `goals` 的事,不是本组件的扩展理由(见 `FLOW_MARKER_CONTRACT.md` §7)。

## D5 · 反 Codex 约束(11 条)

见 `MIGRATION_PLAN.md` §0.2:不自建状态机 / 原生 event 不 subprocess hook / 真 deny + fail-open 必告警 / 不全量注入 / 可逆+声明+git 回滚 / 按动作类别 fail-open/fail-loud 二分 / 开放世界身份 / 只依赖承诺契约 / 源仓库自我豁免 / 人类逃生舱 / honest-scope(提醒≠安全边界)。

## 分发模型(用户已裁决)

- 迁移产物落一个单独 GitHub 私有库;每次阶段完成打 tag + release;`nseos` preset + skills 通过该库分发。仓库名/地址待用户提供。

## P0 交付物(已完成)

1. `PARITY_CHECKLIST.md` — 18 项可自动化负控制判据(已写)。
2. `FLOW_MARKER_CONTRACT.md` — flow-marker 契约 + 共享谓词 + 复杂度边界(已写)。
3. `P0_VERIFICATION.md` — R1/R2/R3 结论 + §5 八个 Retired 效果定性(已写)。
4. GitHub 私有库 `DeliveLee/nseos-dsh`(已建 + 推送)。

## 待用户提供(不阻塞 P1)

- Obsidian vault 绝对路径(进到 `nseos-knowledge` 阶段用)。
- 私有库地址 = `https://github.com/DeliveLee/nseos-dsh`(已建,如需改名告诉我)。
