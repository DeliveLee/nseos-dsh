# 对等验收清单(PARITY_CHECKLIST)

> 每条判据 = **可自动化的负控制**(证明「该 deny/注入/校验真的发生」,不是「能跑/能看到」)。
> 原则:绿色证据只在「相关故障能让它变红」之后才算数。状态在 P6 收口前逐项填 `PASS`/`FAIL`/`PENDING`。

> **验证进度(v0.13.0,经对抗评审修正)**:两条证据层次——① 纯谓词负控制(核心语义会不会 deny,`test/marker.test.js`,30 项,只 import core.js);② 接线层负控制(门真的 armed,`test/wiring.test.js`,5 项,mock fs/ctx 证明 handler 真 deny/allow)。
> - **有①②两层**:#6 skill-gate(deny+放行)、#8 action-gate(trunk deny + feature-branch 放行)。
> - **只有①层(谓词,缺接线)**:#10 marker 五态、#12 release 凭据、#16 复杂度预算(classifyReleaseBash 等谓词)——这些的核心谓词在 core.js 有负控制,但对应的 `tools/pre-execute` handler 分支未在 wiring.test 里覆盖。
> - **零层(既无谓词测试也无接线测试)**:#2 reviewer 只读(provider 在 index.js 未测)、#15 fail-open/kill-switch(gateWarn 与逃生舱无测试)——评审点名此二项此前被误标为「有①层」。
> - 其余(#1/#3/#4/#5/#7/#9/#11/#13/#14/#17/#18)需真实 NSEOS 会话做「故意注入 → 门真 deny → 清除 → 放行」活路径验收(手工程序见 `VERIFICATION_STATUS.md`)。

| # | 对等项 | 机械判据(负控制) | 状态 |
|---|---|---|---|
| 1 | 12 个 `nseos-*` 技能可加载路由 | 摘掉任一 skill 文件 → `tool-skill` list 少一个、`get` 返回 undefined;恢复 → 回来。12 名均可 `get` 到 body | PENDING |
| 2 | 8 个 agent 角色按权限分发 | reviewer 子 agent `toolFilter.deny` 移除 write/edit/bash/subagent/… + `maxDepth=1`(真机器边界:被 deny 工具从子代理注册表移除+拒绝执行,非 prompt 声明);其余 7 个角色是「软指引」(route-work 指示先 read `agents/<role>.md`),无 provider/沙箱机器强制(Claude 版有,DSH 未迁移) | PENDING |
| 3 | OPERATING_MODEL + ≤8 附录 + 16 模板按需可读 | 每个 skill 引用的 reference/template 相对路径都可 `fs.resolve`;删一个 → 引用它的 skill 加载时报缺 | PENDING |
| 4 | session 路由注入 | 无 `nseos` preset 挂载 → `agent/session-start` 后无路由指令;挂载 → 有(且含本会话 session_id / delivery mode,行为证据) | PENDING |
| 5 | prompt 路由(首回合完整/后续指针/feedback) | 每人类回合**首 step 注入一次**,同回合后续 step **不重复注入**(计数器断言=1);绝不 `reject`(用户消息零丢失)。并发提醒/stale 自检已诚实降级(DSH 无同仓并发块、无 setup 接线层) | PENDING |
| 6 | skill-gate 真 deny+放行 | 业务仓 + 无 flow marker + 调非 `nseos-*` skill → `tools/pre-execute` 返回 `deny{reason}` 且 reason 回给模型;写正确 marker 后同一调用 → allow。两态都测 | PENDING |
| 7 | doc-gate(术语歧义 + 实现边界) | 术语歧义 armed-not-cleared + `write` 产品码 → deny(带文案);cleared 后 → allow。编排者首写产品码无 `.impl-boundary-ack` → deny 一次 | PENDING |
| 8 | action-gate(RELEASE_CLASS + prod-schema fail-loud + 聚合) | 无 marker + `gh pr merge`/`git push` → 单条聚合 deny(列全缺项);prod-schema 扫描不完整 → `unknown` 并 deny(不得读作「干净」) | PENDING |
| 9 | progress-gate 三行为 | done-claim 且未读进度真源 → `agent.steer()` 一次、模型报数后收口;第 3 个不同文件无账本 → 一问;编排者写产品码无 ack → 边界提醒 | PENDING |
| 10 | flow-marker 五态 | 空文件 / 错误 session_id / 过期 started_at(>4h) / 不可解析 → 共享谓词均返回 deny;正确 marker → allow。四条负控制 | PENDING |
| 11 | 审批门禁 | plan 未 APPROVED → `nseos-build-feature` 拒绝继续;APPROVED(有审批来源)→ 放行 | PENDING |
| 12 | feedback 四层(捕获/投递/提醒/scrub) | 队列 ≥3 条 → 路由注入提醒;条目含 secret → scrub 拒发并逐行点名(绝不静默脱敏) | PENDING |
| 13 | 双交付模式 + 回退 | `Delivery mode` 缺失/不可判读 → 回退 interactive;两模式下同一门禁负控制(#6–#9)结果一致(autopilot 只改「何时问人」) | PENDING |
| 14 | HUMAN_COMMUNICATION(七条 + Audience 字段) | 抽查:问人类时严重性/不可逆性全文传达、术语首现翻译。**诚实:DSH 是两层(常驻 persona 七条压缩版 + skill 引用),无 Claude 的第三层每轮注入;`Audience: technical` 字段未迁移(不读 PROJECT_PROFILE 的 Audience,术语翻译不按此放宽)** | PENDING |
| 15 | 门禁逃生舱 + fail-open 告警 | 门禁 service 抛异常 → 降级为放行**且**发出可观测告警(日志/事件,非静默);有显式 kill-switch 且模型不得自关 | PENDING |
| 16 | 复杂度预算 | 反 Codex 硬不变量:有生命周期状态组件 ≤1(flow-marker)、无状态机、无第二个状态文件、测试 ≤100。JS 行数预算 = ≤1500 且纯谓词 core.js ≤500(D4 诚实重估后口径,见 DECISIONS.md) | PENDING |
| 17 | 存量 6 skill 收编去重 | 业务仓调 `deliveli-delivery` → 被正确路由(不 self-deny);两个框架无职责冲突;`$nseos-*` 幽灵引用清零 | PENDING |
| 18 | 621 测试退役 | 「退役理由 + 对等负控制」双清单齐备;marker 五态 / RELEASE_CLASS / done-claim / stale 语义均有 DSH 负控制重表达 | PENDING |
