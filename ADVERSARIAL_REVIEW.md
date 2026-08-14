# 对抗评审发现台账(4 路)

> 4 路子代理维度:范围对等(A)/ 机制正确性(B)/ 维护成本(C)/ 排序依赖(D)。
> 每条的处置已并入 `MIGRATION_PLAN.md` v1.0。本文件留作审计轨迹。

## 收敛为「必须改」的硬伤(已全部进计划)

| 编号 | 发现 | 来源 | 处置落点 |
|---|---|---|---|
| H1 | `goals` 是 session 级单目标,表达不了 flow-marker 5 属性/跨 session/4h → flow-marker 是全计划唯一自建持久化 service,写死边界(无 schema 版本号/无 checkpoint/无 receipt/无 rollback) | C+D | §2、P1 |
| H2 | 门禁是 4 个不是 6 个(session/prompt-routing 是注入非门禁);四门禁共享同一 marker 校验谓词,必须一起改一起验 | C+D | §2、P4 |
| H3 | `tools.guard` 同步签名读不了异步 marker → deny 全用 `tools/pre-execute`;`fs/write-intent/edit-intent` 是版本守卫非 deny 通道 → doc-gate 也走 `tools/pre-execute` | B | §2 |
| H4 | `systemPrompt.section()` 拿不到按会话动态上下文 → session 路由用 `agent/session-start` + `agent.inject()` | B | §2 |
| H5 | `agent/pre-step` 是每 step 非每 prompt,reject 会丢用户消息 → 只注入不 reject,需回合边界检测 | B | §2 |
| H6 | `agent/turn-stopping` payload 无收口文本 → progress-gate Stop 侧自读 session log | B | §2 |
| H7 | 8 agents 用 `subagent` 工具无法兑现「只读/禁递归」→ `subagents.registerProvider()` 自定义 provider 携带 persona+沙箱+禁递归;8→5 收敛 | B+C | §2、P3 |
| H8 | 审批门禁 ≠ plan-mode(范畴错误)→ 用 `approval.request()` 合同审批 | B | §2 |
| H9 | 关键路径漏 Phase 4→Phase 2 依赖(门禁进 preset isolate realm) | D(F2) | §3 |
| H10 | flow-marker 契约必须 P0/P1 先行(9 skill 18 处调用前向引用) | D(F1) | §3 P0/P1 |
| H11 | 命名冲突 + 自我门禁:`deliveli-delivery` 引用源里不存在的 `$nseos-*`;迁入后存量 6 skill 会被自己 skill-gate deny | D(F13/F14) | §7 D2 |
| H12 | 回滚对象错配(静态 preset row 无 stop/undefine)+ 无文件层 git/tag | D(F10/F11) | §0.2 #5、P0 |
| H13 | 「全量对等=效果对等」被 upgrade/setup/marketplace 的 Retired 击穿,无等价论证 | A | §0.1、§5 |
| H14 | §0.4 五条全漏 Codex 5 结构根因 + 元根因 honest-scope | A | §0.2(11 条) |
| H15 | fail-open 与真 deny 冲突,缺「降级必告警」约束 | D(F12) | §0.2 #3 |
| H16 | 复杂度无预算 → 写死 JS≤1000/schema≤1/test≤100;R4 否决任何自建状态机 | C | §4 |
| H17 | 17 skill 非独立(17/17 引用 references,mode 被 8+ 引用)→ 分层迁移 | D(F5) | P2 |
| H18 | allow-list 17 vs 13 数量矛盾(Claude 源 AINSEOS_OWN 只有 13) | D(F7) | §7 D2 |

## 能力级遗漏(已补进对等清单 13→18)

feedback 三层(提醒+scrub) / doc-audit cron + weekly-maintain / 621 测试处置 / progress-gate 实现边界 backstop / action-gate prod-schema fail-loud + 聚合 deny / 双交付模式回退 / flow-marker worktree/session-slug / PROJECT_CLAUDE_SNIPPET(15 资产)/ HUMAN_COMMUNICATION Audience 字段。

## 待用户拍板(未决,需在实施前裁决)

- **D1 对等边界**:C 级诚实降级清单是否接受(Obsidian / doc-audit 自动 cron / zip 离线 / 621 测试退役)。
- **D2 命名与去重**:前缀(`ai-nseos` vs `$nseos-*`)+ 存量 6 skill 收编 + allow-list 数量。

## 未采用/需验证项(诚实边界)

- §5「需论证的 Retired」8 项效果中,6 项(stale 三态 / 自检提醒 / 一键升级 / zip 离线 / marketplace 缓存 / wiring 检测)的 DSH 等价物尚未实测,须在 P0 用 cordis_inspect + DSH preset 分发文档核实后给出结论,不得默认证伪。
- 门禁的「负控制 = 真的会 deny」需在 P4 用对应事件的真实调用证明(非单元测试摆设)。
