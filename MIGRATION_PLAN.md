# AI-NSEOS → DSH 迁移计划(终版 v1.0)

> 状态:已通过 4 路对抗评审(范围/机制/维护成本/排序),本版为整合后终稿。
> 基准源 = `<upstream-nseos>`(Claude 插件,直接重新推导)。
> 深度 = 全量对等(分阶段开启,最终全量)。对等 = **效果对等**,机制用 DSH 原生面替换。
> 完整评审发现与处置见 `ADVERSARIAL_REVIEW.md`;本文件是实施口径。

---

## 0. 对等定义(评审修正后)

### 0.1 三层对等模型(取代 v0.1 的一刀切)

| 层 | 含义 | 处置 |
|---|---|---|
| **A 级 · 核心全量对等** | 交付治理主线:路由 + 生命周期 + 门禁 + 状态 + agents + 契约 | 全部实现,逐项可机械判定的负控制 |
| **B 级 · 机制替换(效果等价)** | Claude 专属机制 → DSH 原生面,必须**写出等价论证** | 论证 DSH 等价物 + 完成判据后 Retire |
| **C 级 · 诚实降级(需拍板)** | DSH 无原生等价物的效果 | 保留为 skill,或显式标注「范围外/降级」,不得既 Retire 又声称全量 |

**核心原则(评审 A 硬伤 1)**:Retired 只能针对「机制」;针对「效果」必须先证明 DSH 有等价物,否则保留或显式降级定义。

### 0.2 反 Codex 约束(评审 A 硬伤 2 修正:从 5 条扩到 11 条)

Codex 版真实失败是 5 个结构性根因 + 1 个元根因(`PLUGIN_IMPROVEMENT_REVIEW.md:59-211`)。约束逐条正对:

| # | 约束 | 对治的 Codex 根因 |
|---|---|---|
| 1 | 不造自建状态机(任何语言,不止 CLI/Python) | 过度工程(nseosctl/schema v8) |
| 2 | 门禁/注入用 DSH 原生 event/service,不用 subprocess hook | 维护成本表象 |
| 3 | 门禁真 deny,但 **fail-open 必须伴随可观测告警**,降级不得静默丢 deny | 根因 1 + F12 |
| 4 | 不全量注入(route 给指针,references 按需加载) | 328K 字符注入 |
| 5 | 维护性 = 可逆 + 声明式 + 文件层 git/tag 回滚 | 过度工程 + F10/F11 |
| 6 | **按动作类别 fail-open/fail-loud 二分**:普通开发动作拿不到证据→放行;发布/生产级拿不到证据→deny | 根因 1(「拿不到证据」≠「证据表明危险」) |
| 7 | **开放世界身份**:只对「能正面证明是受限身份」降权,其余默认 main;不闭集枚举 | 根因 2 |
| 8 | **只依赖 DSH 承诺契约**(tools/fs/agent 的 payload 字段),禁解析宿主内部结构 | 根因 3 |
| 9 | **源仓库自我豁免**(门禁不拦改门禁自己),四行谓词消灭自举死锁 | 根因 4 |
| 10 | **人类逃生舱**:每门禁有显式 kill-switch(settings/权限预设),模型不得自行关闭 | 根因 5 |
| 11 | **honest-scope:提醒 ≠ 安全边界**;sandbox/approval 才是硬边界,门禁只做纪律 | 元根因 |

---

## 1. 资产清单(评审 A 修正)

- 17 skill ✓ / 8 agent ✓ / 17 reference ✓ / 16+5 template ✓ / 6 hook(7 处注册)✓ / 621 测试 ✓。
- 资产文件 = **15**(非 ~12):assets/ 顶层 8 + architecture 2 + domain 5,补 `PROJECT_CLAUDE_SNIPPET.md`。
- 机器层脚本 = **3 个**(flow-marker / feedback_queue / upgrade)+ **1 个定时任务定义**(doc-audit-sweep-task.md,`.md` 非脚本)+ **1 个维护者侧 weekly-maintain**(范围外)。

---

## 2. 源 → 目标映射(评审 B 修正后的最终口径)

| Claude 机制 | DSH 落点 | 修正依据 |
|---|---|---|
| session-routing(注入) | `agent/session-start` listener + `agent.inject()`(**不用** `systemPrompt.section()`,它拿不到按会话动态上下文) | B:AssembleContext 只有 scope/signal |
| prompt-routing(注入) | `agent/pre-step`(按 step 注入,**只注入不 reject**;需回合边界检测区分「每用户 prompt」vs「每 step」) | B:per-step 非 per-prompt;reject 丢用户消息 |
| **skill-gate(deny)** | `tools/pre-execute`(异步,可读 marker 后 deny+给理由) | B:确认;`tools.guard` 是**同步**签名,读不了异步 marker |
| **doc-gate(deny)** | `tools/pre-execute`(按写工具名 + 目标路径 deny)。**不用** `fs/write-intent`/`fs/edit-intent`(那是并发版本守卫,无 deny 通道) | B:FsWriteIntent 是版本守卫非门禁 |
| **action-gate(deny)** | `tools/pre-execute`(RELEASE_CLASS 保守分类 + 聚合单条 deny)+ **prod-schema fail-loud 扫描** | B 确认 + A 发现 7 |
| **progress-gate Stop(done-claim)** | `agent/turn-stopping`(payload 无收口文本 → **自读 session log** 拿关闭文本)+ 自建预算状态 | B:turn-stopping 无 transcript |
| **progress-gate PreToolUse(账本+边界)** | `tools/pre-execute`(账本一问 + 编排者实现边界 backstop,同 floor) | A 发现 6 |
| 审批门禁(AWAITING_APPROVAL→APPROVED) | `approval.request()`(特征合同审批)。**不用 plan-mode**(范畴错误:plan-mode 是会话级「禁变更」,不是合同审批) | B:范畴错误 |
| 长任务防跑偏 | `goals` + goal 工具(仅单会话目标;**不**用于 flow-marker) | C:goals 是 session 级单目标 |
| 任务账本 | `todo_write` | Native |
| **flow-marker** | **唯一自建 host 持久化 service**(5 属性 / 4h / 归属校验 / deny 语义;无 schema 版本号 / 无 checkpoint / 无 receipt / 无 rollback)+ 共享 marker 校验谓词 | C+D:goals 覆盖不了,必须自建但写死边界 |
| 8 agents | **`subagents.registerProvider()` 自定义 provider**,`capabilities {persona, toolFilter, depthLimit}`;三诉求三条通道:persona→`SubagentStartRequest.persona`(order 0),禁递归→`maxDepth`+`toolFilter.deny:['subagent','subagent_fork','workflow','ralph']`,**只读沙箱→provider `start()` 内 `childSession.append('sandbox/mode',{mode:'read-only'})`(SubagentStartRequest 无 sandbox 字段)**;收敛 8→5 | B:subagent 工具只有 description/prompt/run_in_background;C:收敛 |
| 17 skills | preset `skills/` 目录 + `skills.registerProvider()`(filesystem) | Native |
| feedback(4 层) | skill + storage(捕获离线队列 / 投递显式授权 / **每回合提醒进 prompt-routing** / **投递前 scrub+拒发**) | A 发现 2 |
| doc-audit | sweep skill(手动)+ **自动 cron 无 DSH 等价物 → C 级诚实降级** | A 发现 4 |
| 「说人话」问人类 | `userQuestions.ask()` | Native |

---

## 3. 分阶段计划(评审 D 重排后)

> 严格串行链:P0 → P1 → P2(references 层)→ P3 → P4 → P6。
> 可并行:P2 其余 skill ∥ P3;P5 尾段 ∥ P4 尾段;P2 内阶段③的多个生命周期 skill。

### P0 — 决策 + 契约锁定(独占)
- **产出**:`DECISIONS.md`、`PARITY_CHECKLIST.md`(每条 = 可自动化负控制,非软指标)、**flow-marker 接口契约**、命名规范(前缀 + allow-list 匹配规则)、存量 6 skill 去重/收编裁决、R1/R2/R3 验证结果、**复杂度预算**(见 §4)。
- **退出证据**:对等清单逐项有负控制判据;R1(scope)/R2(`tools/pre-execute` 分类能力)/R3(marker 能否用 goals)有 cordis_inspect 实测结论;flow-marker 契约字段冻结;命名冲突(F13/F15)与 allow-list 数量(F7:13 vs 17)已裁决。
- **R2 实测要点(B)**:`ToolExecution` **无 cwd / 无工具分类字段**——bash 命令在 `arguments.command`、skill 名在 `arguments.name`、写目标在 `arguments.file_path`;门禁须按工具名重键 + 自行解析仓库根(含 linked-worktree 链)。deny 的 `reason` 即 Claude stderr 等价物(必须验证「deny 理由能否真的回到模型眼前」)。
- **Phase 4 实现精度(B 完整报告)**:① `PreToolDecision.ask` 无 approval 服务时**退化为 deny** → 门禁只用 allow/deny,「问人类」统一走 `userQuestions.ask()`;② orchestrator-vs-subagent 判定用 `exec.agent` + `agents.requireInitiator()`/`isOwnedBy()`(替代 Claude 的 `agent_id`/`agent_type`);③ skill-gate:DSH skill 名是 **kebab-case、无 `ai-nseos:` 前缀**,allow-list 写 17 个显式 skill 名,「直接 `read` skill 文件」是已知 residual 旁路(是否加 read 目录黑名单待 D2 定);④ progress-gate Stop 侧收口文本 = `ctx.sessionQuery` 读当前 turn 最后一条 assistant 消息,预算落 `storageDomain`,拦截用 `agent.steer()`。

### P1 — 状态契约先行:flow-marker stub + 共享校验谓词(独占)
- **产出**:flow-marker host service + 工具 stub(归属/新鲜度 4h/跨会话 deny/空文件 deny)+ 共享 marker 校验谓词 service(显式独立交付物)。
- **退出证据**:跨会话归属 deny、不可归属 deny、worktree/主检出共享、过期 deny 四条负控制全过。

### P2 — 内容分层迁移(内部可并行)
- **分层**:① 17 references 公共层 → ② mode/init/setup 路由核心 → ③ 其余生命周期 skill + 21 templates。
- **退出证据**:每个引用 flow-marker 的 skill 对 stub 做运行时冒烟通过;references 按需加载可验证。

### P3 — preset + agents + session-start 注入(与 P2 其余部分并行)
- **产出**:`ai-nseos` preset(cordis.yml,isolate realm)、5 个 subagent provider(角色 persona + 沙箱 + 禁递归)、session-start 路由注入。
- **退出证据**:preset 可 mount;角色按权限分发;注入可见**且被遵守**(行为证据)。

### P4 — 机器门禁(谓词类一组一起改一起验)
- **注入类 2**:session-routing / prompt-routing。
- **谓词类 4**:skill / doc / action / progress-gate,共享 P1 的校验谓词(**必须一起改,不宣称各自独立**)。
- **退出证据**:每门禁 fail-open **且降级必发可观测告警**;deny/放行各配负控制;共享谓词单独验证。

### P5 — 交付闭环(feedback / doc-audit / maintain / release)
- **退出证据**:反馈捕获/投递/提醒/scrub 四链路;投递缺 gh/网络 → 捕获层先行 + 投递层显式 blocked 留队列(可验证降级,非静默)。

### P6 — 验证收口 + 存量收编
- **产出**:对等清单负控制全绿;活路径(init→plan→build→review→release);**存量 6 skill 收编/去重**;621 测试「退役理由 + 对等负控制」双清单;决策沉淀。
- **退出证据**:`deliveli-delivery` 在业务仓实测**被正确路由而非被自己门禁 deny**(F14 自我门禁)。

---

## 4. 复杂度预算(评审 C,Phase 0 写死)

- 机器层 JS **≤ 1000 行**;自建持久化 schema **≤ 1**(flow-marker);门禁测试 **≤ 100**;无第二个状态文件。
- R4 修正为:**否决任何自建状态机(不论语言)+ 第二个持久化 schema**;超出即回 P0。
- **ledger-gate 的 `ledgerState` Map 是「进程内、按 session 的瞬时计数器 + 一次性催过标记」,不是持久化 schema、不是状态文件、不是状态机**:RAM-only、无版本、无回滚,`agent/disposed` 时清该 session 条目。这是 §2 已声明的「自建预算状态」那一类,不违反本条。若未来它长出「跨会话恢复 / 迁移 / 回滚」诉求,那是 `goals` 的事,不是它的扩展理由。
- 资产收敛(去「为对等而对等」):skills 17→12(retire upgrade/setup/marketplace/configure-obsidian/sync-obsidian 后,见 §5 论证)、agents 8→5、门禁 6→4、references 17→1 个 OPERATING_MODEL + ≤8 附录、templates 21→16(去 5 Obsidian note)。

## 5. 需论证的 Retired(评审 A 补充点 2)

| 效果 | 处置 |
|---|---|
| 安装 hook 文件本身 | **Retire(真等价)**:门禁随 preset 声明式挂载 |
| 「新版本定义正确安装」 | **Retire(真等价)**:声明式 cordis.yml 天然满足 |
| wiring/provenance 检测 | 映射到 cordis 挂载诊断,写完成判据 |
| marketplace git 源 | 论证 DSH 无「旧缓存快照」后 Retire |
| **stale 三态检测** | **保留效果**(除非证明 DSH 无半更新状态) |
| **每回合自检提醒** | **保留效果**(并入路由注入) |
| **一键升级路径** | **保留或论证 ≤1 步** |
| **zip 离线分发** | **保留或显式降级定义** |

## 6. 对等验收清单(A 修正,13 → 18 项)

1. 12 skills 可加载路由 2. 5 个 agent 角色按权限分发(只读/workspace-write/禁递归) 3. 1 OPERATING_MODEL + ≤8 附录 + 16 templates 按需可读 4. session 路由注入可见且被遵守 5. prompt 路由(首回合完整/后续指针/并发会话提醒/stale 提醒/feedback 提醒) 6. skill-gate 真 deny+放行负控制 7. doc-gate(术语歧义 + 实现边界) 8. action-gate(RELEASE_CLASS + fail-loud prod-schema + 聚合 deny) 9. progress-gate 三行为(done-claim 报数 / 账本一问 / 编排者边界 backstop) 10. flow-marker(5 属性 / 4h / 归属 / 空文件 / worktree 语义或声明不适用) 11. 审批门禁(approval.request 合同审批) 12. feedback 四层(捕获/投递/提醒/scrub) 13. 双交付模式 + 回退语义 + 跨模式判据一致 14. HUMAN_COMMUNICATION(Audience 字段 + 三处冗余携带衰减) 15. 门禁逃生舱 + fail-open 告警 16. 复杂度预算达成(JS≤1000/schema≤1/test≤100) 17. 存量 6 skill 收编去重、无自我门禁 18. 621 测试退役理由 + 对等负控制双清单

## 7. 实施前决策(已锁定,详见 DECISIONS.md)

- **D1 对等边界**:已裁决(接受降级,但 Obsidian 保留知识库维护能力、分发改私有 GitHub 库 + release)。降级明细见 `DECISIONS.md` D1。
- **D2 命名与去重**:前缀 = `nseos`;`deliveli-delivery` 吸收进 `nseos-route-work`;5 个存量技能保留为「步骤内工具」层。
- **待用户提供**:Obsidian vault 路径、私有库地址。
