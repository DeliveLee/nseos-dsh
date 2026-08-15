# 差距调查草稿(主会话第一手证据,待 subagent 交叉验证)

> 生成于 2026-08-15。这是主会话自己 grep/read 得到的第一手证据,不是 subagent 结论。最终报告需与 3 个 subagent 结论交叉核对后写入仓库正式文件。

## A. 机器层缺口(与 Claude 未对齐)

### A1. 8 个 agent 只有 1 个真接线(其余 7 个是孤儿 .md)
- `packages/nseos-gates/lib/index.js` 只 `registerProvider(new NseosReviewerProvider("nseos-reviewer"))`(1 个)。
- `preset/agents/*.md` 有 8 个文件(architect/domain-knowledge/feature-developer/integration-reviewer/knowledge-curator/product-analyst/quality-reviewer/security-reviewer),但全仓无任何代码/配置加载它们。
- subagent 工具用 `spawn` 通用 provider,不读这些 .md;role 只在 prompt 文本里。
- VERIFICATION_STATUS.md:33 自认「5 个 agent 角色是角色 prompt 资产;reviewer 只读沙箱机器强制未做」。
- 影响:Claude 的「reviewer 只读/禁递归」机器强制只做了 1/8;product-analyst/architect/security-reviewer 等角色在 plan-feature/autopilot 里被要求「派 subagent」,但没有对应的 provider/persona 机制,只能靠 prompt 文本现编。

### A2. PARITY_CHECKLIST 18 项全部 PENDING(验收判据从未执行)
- `PARITY_CHECKLIST.md` 18 行状态列全是 PENDING。
- VERIFICATION_STATUS.md 的「✅ 代码级已验证」只证明:挂载通过、import 解析、grep 零 Claude 残留、12/12 frontmatter——全部是「能加载」,没有一条是「门禁真的 deny / 注入真的发生」的活会话负控制。
- FB-20260813-003 说的正是这个:「0 次 deny 无法区分门没 armed」。

### A3. index.js(接线层 780 行)零测试覆盖
- `test/marker.test.js` 只 import `core.js` 的纯谓词(marker 五态/release patterns/deploy patterns/release consent/release credential/done-claim/product-code/bookkeeping)。
- index.js 的四个 `tools/pre-execute` 门禁 + session-start 注入 + prompt-routing 注入 + turn-stopping progress-gate **没有任何一条被测试**。
- 即「谓词正确」被证明,但「门禁真的 armed」从未被证明。这正是 FB-20260813-003 的活会话负控制缺口。

### A4. feedback 每回合提醒缺失(文档-代码不符)
- `nseos-feedback/SKILL.md:75` 宣称「每轮路由会在队列里有未发条目且(≥3 条或最早超过 24h)时加一行提醒」。
- 但 `index.js:468` 的 PROMPT_ROUTING_REMINDER 里**没有** feedback 队列提醒逻辑。
- Claude 版有 `_unsent_feedback_block` / `_unsent_feedback`(UNSENT_FEEDBACK_MIN_HOURS=24 + 阈值)。DSH 只做了捕获 + 投递,缺「唯一不依赖人记性的提醒」这一环。AUDIT.md §3-5 也自认「缺」。

### A5. upgrade/setup/stale-三态/一键升级 未落地
- DSH skills 列表无 nseos-upgrade / nseos-setup。
- INSTALL.md 安装是「cp -R 两段」,无「已装 vs 最新」的 stale 三态检测。
- P0_VERIFICATION.md §5 把这些标为「保留效果,待实测」,但从未落地;Claude 的 setup/upgrade(byte 比较三态 + wiring/provenance 检测 + git commit-sha 裁决 + 每回合自检提醒)在 DSH 全部缺失。
- 实测当前 installed == source(无 diff),但这是人工 diff,不是机制。

### A6. action-gate 远不如 Claude 精确(over-block + under-block 并存)
- DSH `RELEASE_PATTERNS` = `/\bgit\s+push\b/` + `gh pr merge` + `gh workflow run` + `gh release create` + `git tag`。
- `\bgit\s+push\b` 匹配**任何** `git push`(含 feature 分支)。core.js 注释写「never blocks feature-branch or local work」,但代码实际会 deny 业务仓里无 marker 的 `git push origin feature/foo`。这是注释-代码不符 + 过度拦截(Claude 设计哲学:false deny is expensive, trains user to set =off)。
- `gh workflow run` 匹配**所有** workflow(含 lint.yml),Claude 用 DEPLOYISH_WORKFLOW 只拦 deploy 形 workflow。
- Claude 有 GIT_VALUE_FLAGS/GH_VALUE_FLAGS 参数解析、PUSH_MULTIREF_FLAGS(--mirror/--all/--tags/--follow-tags)、TAG_REFSPEC/VERSION_TAG、HEAD_CHANGING_GIT_SUBS(switch/checkout)、COMPOSE prod 检测;DSH 全部没有 → `git push --mirror` / `git push --tags` / docker-compose prod 部署会漏。
- prod-schema 扫描:DSH 只查 12 个固定文件;Claude 扫最多 4000 文件 + PRIORITY_HINTS/DIRS + SKIP_DIRS + 多扩展名。

### A7. HUMAN_COMMUNICATION 7 条 + Audience 字段 无机器强制
- persona(agent.cordis.yml)只有第 7 条一句(说人话)。7 条完整规则 + Audience 字段在 `references/HUMAN_COMMUNICATION.md`(186 行,内容忠实),但只靠 skill 按需加载,无每回合注入。
- Claude 版靠「全局 CLAUDE.md 标记块 + 两个 routing hook 每轮注入 + skill 引用」三层冗余提升遵守率;DSH 少了前两层(全局 snippet + 每轮注入),只剩 skill 引用。

### A8. progress manifest / feature state / task ledger 无机器强制
- templates 全迁(PROGRESS_MANIFEST/TASK_LEDGER/FEATURE_STATE 等),但门禁代码从不读这些文件。
- Claude 版 PROGRESS_MANIFEST 有 schema_cmd/staleness_cmd/enforced_by 三判据;DSH 只剩模板文件。AUDIT.md §1 自认「文件格式在,门禁不读 manifest」。

### A8b. reviewer「只读沙箱」降级为 toolFilter denylist(文档-代码不符)
- MIGRATION_PLAN D3 / 评审 H7 承诺:只读 reviewer = provider `start()` 内 `childSession.append('sandbox/mode',{mode:'read-only'})`(沙箱级只读)。
- 实际 `index.js` 的 NseosReviewerProvider 只设 `toolFilter = {deny:[write,edit,bash,subagent,...]}` + `maxDepth=1`,**没有**设只读沙箱。
- toolFilter 是黑名单,非白名单:若有别的可写工具(或漏列工具)不在 deny 列表,reviewer 仍可写;沙箱级只读才是 airtight。
- 即「只读」的机器强制强度低于计划承诺。

### A9. 复杂度预算超线(违反 D4)
- MIGRATION_PLAN §4 / DECISIONS D4:机器层 JS ≤1000 行。
- 实测 core.js 253 + index.js 780 = 1033 行,已超 1000。对抗评审 C 早就警告「三年后即第二个 Codex 覆辙」。

## B. 内容层问题(样子货:看起来全,实则残)

### B1. 重复 reference 文件(3 组逐字节相同)
- `PARALLEL_DEVELOPMENT.md` == `PARALLEL.md`(IDENTICAL)
- `SECURITY_POLICY.md` == `SECURITY.md`(IDENTICAL)
- `DECISION_RIGHTS.md` == `AUTHORITY.md`(IDENTICAL)
- 迁移把 Claude 的文件改了名,旧文件没删,「21 references」被虚高。

### B2. 断链引用(指向已改名/不存在的文件)
- `FAILURE_RECOVERY.md:58` → `references/INTEGRATION_AND_RELEASE.md`(不存在,已改 RELEASE.md)
- `VERIFICATION.md:178` → `INTEGRATION_AND_RELEASE.md`(不存在)
- `VERIFICATION.md:3` → `KNOWLEDGE_ENGINEERING.md`(不存在,已改 KNOWLEDGE.md)
- `QUALITY_AND_EVALUATION.md:3` → `VERIFICATION_INTEGRITY.md`(不存在,已改 VERIFICATION.md)
- `agents/feature-developer.md` / `agents/quality-reviewer.md` → `VERIFICATION_INTEGRITY.md`(不存在)
- 结论:VERIFICATION_STATUS.md 的「36 处 references 引用全解析」是**假绿**。

### B3. 命名漂移(skill 同时引用新旧两套名)
- `nseos-learn` 引 `KNOWLEDGE_POLICY.md`(旧),其它 skill 引 `KNOWLEDGE.md`(新)。
- 门禁/引用层混用 AUTHORITY.md 与 DECISION_RIGHTS.md、SECURITY.md 与 SECURITY_POLICY.md。

### B4. `$ARGUMENTS` 占位符残留
- nseos-feedback / nseos-learn / nseos-doc-audit / nseos-maintain 四个 skill 正文里有未替换的 `$ARGUMENTS`。

## C. 流程/行为问题(来自用户反馈 + 会话复盘)

### C1. 用户 9 条抱怨(session-0367d3c5「Obsidian Vault 配置说明」)
1. 看 feedback
2. 修完了吗
3. 都修一下吧
4. 审批关掉后发布卡死、人说话不管用(v0.10.0 已改 userQuestions.ask)
5. 现在插件有让模型维护 obsidian、遇问题搜 obsidian 的逻辑么
6. 需要有,模型老是撞以前出的问题(v0.11.0 已加)
7. 「继续开发AI功能交接会话」好几次了,自以为知道根因,完全不调查(v0.12.0 已加)
8. 扫一下最近项目会话,开工前到底有没有先写计划(v0.12.0 部分)
9. 好好研究 claude 版插件,很多功能没迁移或没迁移明白(本任务)

### C2. 已修的(INSTALL changelog 证实):v0.8.0 发布强制人类批准 + 产品UX纳入流程;v0.10.0 userQuestions.ask;v0.11.0 搜 Obsidian 历史;v0.12.0 根因纪律。

### C3. 未修/浅修的:子代理裁决丢失(FB-20260813-002)、0-deny 负控制(FB-20260813-003)、指标博弈(FB-20260813-004)、prompt-routing 重注入只做了骨架没做 feedback 提醒(FB-20260813-005 的 feedback 子项)。

## D. 待办(报告 + 计划 + 落地)
1. 收 subagent A/B/E 结论,交叉核对。
2. 第二轮对抗:让一个独立 subagent 证伪本清单(有没有误报/漏报)。
3. 产出正式 `GAP_ANALYSIS.md` + 优先级开发计划。
4. 落地修复(按优先级)。
