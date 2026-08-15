# 迁移整体审计(能力对账:Claude 原版 vs DSH 迁移)

> ⚠️ **本文件是 v0.1.0 的过期快照,已由 `GAP_ANALYSIS.md` 取代。** 此处把若干「后来已落地」的门禁写成「未做」(prod-schema 扫描 / release 凭据 / 账本一问在 v0.3.0–v0.6.0 已落地),又把「7 缺口」当全量。以 `GAP_ANALYSIS.md` 为准,本文件仅留作历史轨迹。

> 状态:安装完成 + 挂载验证通过 + release v0.1.0。本审计逐项对账,四档:✅ 完整对等 / 🔼 更好 / 🔽 更差 / ❌ 缺失。
> 诚实原则:机制替换不冒充对等;没实现的分支如实标出。

## 0. 交付/安装状态(已确认)

| 项 | 状态 |
|---|---|
| preset 安装 | ✅ `~/.dsh/.agent-presets/nseos/`(skills 12 / references 21 / templates 16+5 / agents 8 / agent.cordis.yml) |
| 门禁包 | ✅ `@deliveli/nseos-gates` 软链到 `~/.dsh/profiles/node_modules/`,`import()` 解析 OK |
| 挂载 | ✅ `standingKeyFor('nseos')` 通过(含门禁包) |
| 分发 | ✅ 私有库 `DeliveLee/nseos-dsh`,release v0.1.0 + 4 阶段 tag |

## 1. 能力对账矩阵

### 内容层(基本 ✅ 完整对等)

| Claude 原版 | DSH 迁移 | 档 |
|---|---|---|
| 17 skills | 12 个 `nseos-*`(route-work 收敛 init/mode/setup;autopilot 收敛 confirm+accept;knowledge 收敛 obsidian×2)| ✅(生命周期 6 个逐条对等;见下方两处 🔽) |
| 8 agents | 8 个角色 prompt(`preset/agents/*.md`,0 Claude 残留)| ✅(角色语义,但机器强制见 §4) |
| 17 references | 21 个(全迁 + 历史机制映射 README)| ✅ |
| 16+5 templates | 16 + 5(全迁,路径脱敏)| ✅ |
| HUMAN_COMMUNICATION(说人话) | persona 第 7 条 + `references/HUMAN_COMMUNICATION.md`| ✅ |
| 双交付模式 + 回退 | persona + `nseos-autopilot`(判据一致 + 不可判读回退 interactive)| ✅ |

### 机器层(部分对等,有明确缺口)

| Claude hook | DSH 落点 | 档 |
|---|---|---|
| session-routing 注入 | persona(静态 8 条)+ `agent/session-start` 注入 session-id| ✅ |
| skill-gate | `tools/pre-execute` deny(skill 工具 + 非 `nseos-*` + 业务仓 + 无 marker)| ✅ |
| action-gate(release 类 deny) | `tools/pre-execute` deny(bash + RELEASE_PATTERNS + 业务仓 + 无 marker)| 🔽 缺 prod-schema fail-loud 扫描 + 聚合单条 deny |
| doc-gate(实现边界) | `tools/pre-execute` deny(write/edit 产品码 + 无 ack)| 🔽 缺「术语歧义 .gate-armed」分支 |
| progress-gate(done-claim) | `agent/turn-stopping` steer(宣称做完 → 问报数)| 🔽 缺「账本一问」+「编排者边界 backstop」 |
| prompt-routing 重注入 | ❌ 未做(仅静态 persona + 会话首注入)| ❌ |
| flow-marker 五态 | 谓词(absent/unattributable/stale/active)| ✅ |
| feedback 三层(捕获/投递/提醒) | skill(捕获 + gh issue 投递)| 🔽 缺「每回合提醒」 |
| 审批门禁 | `approval.request` + 技能内的 AWAITING_APPROVAL 语义| ✅(机制映射,未重写) |

### 状态模型 / 分发

| Claude 原版 | DSH | 档 |
|---|---|---|
| feature state / release-ready / progress manifest / task ledger | templates 全迁(内容);机器强制未做| 🔽(文件格式在,门禁不读 manifest) |
| setup/upgrade/marketplace | 废弃 → DSH preset 分发 + `INSTALL.md` + git tag/release| 🔼(声明式,无 hook 接线层) |
| 621 Python 测试 | 退役 → 待用 DSH 门禁负控制重表达| ❌(双清单未产出) |

## 2. 比 Claude 好的(DSH 原生优势,真实收益)

1. **硬边界**:Claude 的 hook 是「fail-open 纪律层」,真正的安全靠 `~/.claude/settings.json` 权限;DSH 有 **sandbox + approval + permissionPresets 原生硬边界**,且「提醒≠安全边界」终于有真正的边界可依托。
2. **无状态机黑洞**:Claude→Codex 版自建 `nseosctl.py`(5163 行)+ schema v8 状态机;DSH 用原生 `goals`/`plan-mode`/`todo`/`storageDomain`,门禁包仅 **239 行 JS**。
3. **无 hook 接线层**:Claude 要维护 `~/.claude/hooks/` + `settings.json` 七元组注册 + marketplace 缓存裁决 + 每回合 stale 自检;DSH 是声明式 preset,挂载即生效。
4. **注入更省**:Claude prompt-routing 累计注入 328K 字符;DSH persona 静态 8 条 + 会话首注入 1 次,无每回合重复。
5. **无 worktree `$( )` 逃生问题**:Claude 为绕过 worktree shell 转义专门写了 flow-marker CLI;DSH 的 `write` 工具无此限制,marker 直接写。
6. **subagent 更丰富**:`spawn/fork/continuable/深度限制/后台`,比 Claude 的 Task 工具 + 手写 subagent 定义更强。
7. **skills 分层注册**:DSH skills registry 是 host+per-scope 分层,比 Claude 的平铺 skill 列表更干净。

## 3. 比 Claude 差的 / 缺失的(按优先级,都是可补齐项)

| # | 缺口 | 影响 | 补齐量 |
|---|---|---|---|
| 1 | **prompt-routing 重注入**未做 | Claude 靠它把路由提醒顶到「每用户 prompt」决策点;DSH 现只有静态 persona,长会话里路由可能被后续推理冲淡 | 小(`agent/pre-step` 每人类回合首 step 注入指针,只注入不 reject) |
| 2 | **action-gate 的 prod-schema fail-loud 扫描 + 聚合单条 deny** | Claude 的 release 安全检查(ORM auto-sync 扫不完整→拒绝)丢了;现在 release 判定只有「无 marker 就 deny」 | 中(扫描 prod schema + 一次列全缺项) |
| 3 | **progress-gate 的「账本一问」+「编排者边界 backstop」** | Claude 在第 3 个文件时问「要不要建账本」、编排者写产品码时提醒派 worker;现只做了 done-claim | 中(`tools/pre-execute` 加两分支) |
| 4 | **doc-gate 的「术语歧义 .gate-armed」分支** | Claude 的 D3 硬门(术语未清不许写产品码)现缺,只剩实现边界提醒 | 中 |
| 5 | **feedback 每回合提醒**(≥3 条或 ≥24h) | Claude 的唯一不依赖记忆的链路;现缺 | 小(并进 prompt-routing) |
| 6 | **reviewer 只读的机器强制** | 8 个 agent 现是角色 prompt(advisory);Claude 的 reviewer 也没有机器只读(靠 sandbox),但 DSH 有 `registerProvider` 可做更强只读 | 中(可选增强) |
| 7 | **621 测试 → 门禁负控制**未重表达 | 退役了 Python 测试,但「真的会 deny」的负控制还没写成 DSH 测试 | 中 |
| 8 | **doc-audit 自动 cron** | Claude 每周自动巡检;DSH 无定时 → 降为手动 sweep + 提醒(已诚实标注) | 不可补(DSH 无 cron) |
| 9 | **Obsidian 自动双向同步** | Claude Stop 门禁强制;DSH 降为阶段触发(已诚实标注) | 部分可补(阶段触发 hook) |
| 10 | **行为验证未做** | deny 是否真触发需真实 NSEOS 会话(hand-off) | 需你开会话 |

## 4. 结论

- **结构完整**:Claude 的每个能力在 DSH 都有对应物,preset 可挂载、门禁包可解析、12 技能可加载。
- **内容层 ≈ 完整对等**:技能/引用/模板/agent 角色/HUMAN_COMMUNICATION 都忠实迁移,且去掉了 Claude 专属机制负担。
- **机器层 = 骨架对等、细节有 7 个可补齐缺口**:4 个门禁的核心 deny 条件在,但 Claude 的若干子行为(prod-schema 扫描、账本一问、边界 backstop、术语门、feedback 提醒、prompt 重注入)没迁,是「第一版聚焦」而非「已全量」。
- **净判断**:交付治理的**主线效果对等**,DSH 侧在硬边界/可维护性/注入成本上**显著更好**;差距集中在**机器门禁的细粒度分支**和**两个平台专属降级**(cron/Obsidian),这些是明确可补或已诚实降级,不是结构缺陷。

## 5. 建议的下一步(补齐缺口)

按 §3 优先级:① prompt-routing 重注入 + feedback 提醒(小,一次做)→ ② action-gate prod-schema + 聚合 deny → ③ progress-gate 账本/边界 + doc-gate 术语门 → ④ 门禁负控制测试 → ⑤(可选)reviewer 只读 provider。每个都能独立 git 提交,不阻塞现有主线能力。
