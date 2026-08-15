# Nseos DSH 插件 vs Claude AI-NSEOS 能力对账报告(证据版)

> 生成:2026-08-15。方法:主会话 grep/read 第一手证据 + 3 路并行对抗评审 subagent(A=Claude 基准真值 / B=DSH 现状证伪 / E=近期会话复盘)交叉核对。
> 基准源:Claude 插件 `<upstream-nseos>` v0.36.0。迁移产物:`<repo>`(当前 v0.12.0)。
> 本报告取代 `AUDIT.md`(那是 v0.1.0 的过期快照,把已落地的门禁写成「未做」、把「7 缺口」当全量)。

## 一句话结论

**内容层(技能/引用/模板的文案)迁移得忠实且扎实;但机器层「骨架对等、细节大面积缺失」,且存在多处「文档宣称有、代码里没有」的样子货——8 个 agent 是死文件、18 项验收判据全 PENDING、门禁接线零测试、action-gate 是 Claude 的粗糙正则版(既过度拦截又漏拦)、feedback 每轮提醒缺失、升级/自检机制整体缺失。** 差距不是「没对齐」,而是「迁移停留在纸面,机器强制未兑现」。

---

## 一、内容层对账(基本 ✅ 忠实)

| 维度 | Claude v0.36.0 | DSH v0.12.0 | 判定 |
|---|---|---|---|
| skills | 17 | 12(route-work 收敛 init/mode/setup;autopilot 收敛 confirm/accept;knowledge 收敛 obsidian×2)| ✅ 收敛合理,FB-* 教训/HUMAN_COMMUNICATION/autopilot 语义忠实保留 |
| references | 17 | 21 | ⚠ 数量虚高:3 对逐字节重复 + 断链(见 §三) |
| templates | 16+5 | 16+5 | ⚠ 2 个孤儿模板(ADR.md/RISK_ASSESSMENT.md 无人引用) |
| agents | 8(机器强制只读:tools 白名单无 Edit/Write + permissionMode:plan) | 8 个 `.md` **全是死文件** | ❌ 见 §二-A |
| HUMAN_COMMUNICATION 7 条 + Audience | 3 层冗余注入(全局块 + 2 routing hook + skill 引用) | 仅 skill 引用,无每轮注入 | 🔽 见 §二-B |

---

## 二、机器层对账(核心差距所在)

### A. 8 个 agent 是死文件(0/8 被加载)—— ❌ 最重

- `packages/nseos-gates/lib/index.js` 只 `registerProvider(new NseosReviewerProvider("nseos-reviewer"))` **一个** provider,且用硬编码 persona,不读 `preset/agents/*.md`。
- 其余 7 个角色(architect / domain-knowledge / feature-developer / integration-reviewer / knowledge-curator / product-analyst / security-reviewer)的 `.md` 无任何代码/配置加载。
- subagent 工具用 `spawn` 通用 provider,角色只在 prompt 文本里现编。
- 后果:`plan-feature` Step 6 / `autopilot` Step 5 要求「派 product-analyst/architect/security-reviewer 子代理」,但**没有对应的 provider/persona/只读沙箱机制**——这些指令是无法落地的空话(FB-20260719-004 说「嘴上说派不算数」,但机器层连「真的派一个只读子代理」的能力都没给)。
- Claude 版:8 个 agent 靠 frontmatter `tools` 白名单(无 Edit/Write)+ `permissionMode: plan` **机器强制只读**;DSH 完全没迁移这一层。
- `nseos-reviewer` provider 名与 `quality-reviewer.md` 对不上;且它只设 `toolFilter deny`(黑名单),**没设只读沙箱**(MIGRATION_PLAN D3 承诺 `childSession.append('sandbox/mode',{mode:'read-only'})` 未实现)。

### B. action-gate 是 Claude 的粗糙正则版—— ❌ 最重(既过度拦截又漏拦)

Claude 用 `_release_class()`/`_classify()`(TRUNK_BRANCHES / PUSH_MULTIREF_FLAGS / TAG_REFSPEC / VERSION_TAG / DEPLOYISH_WORKFLOW / PRODISH / COMPOSE_PROD_FLAGS / GIT_VALUE_FLAGS / _foreign_repo_target / _target_ambiguity),DSH 只匹配 5 条裸正则:

| 场景 | Claude 判定 | DSH 现状 | 问题 |
|---|---|---|---|
| `git push origin feature/foo` | 放行(只拦主干) | **deny**(`\bgit\s+push\b` 匹配所有 push) | 过度拦截,core.js 注释「never blocks feature-branch」是假的 |
| `git push --mirror` / `--all` / `--tags` / `--follow-tags` | deny(多 ref 发布) | **漏拦** | 漏拦发布 |
| `git push origin v1.2.3`(版本 tag) | deny(VERSION_TAG) | 漏拦(除非含 `git tag`) | 漏拦发布 |
| `gh workflow run lint.yml` | 放行(非 deploy) | **deny**(匹配所有 workflow run) | 过度拦截 |
| `gh workflow run deploy.yml` | deny(DEPLOYISH_WORKFLOW) | deny | ✅ 一致 |
| `docker compose -f docker-compose.prod.yml up` | deny(PRODISH+COMPOSE_PROD_FLAGS) | **漏拦** | 漏拦生产部署 |
| `git -C <别的仓库> push` | deny(foreign-repo-target) | 按当前 cwd 判,漏 | 漏拦跨仓 |
| `cd x && git push` / `git switch x && git push` | deny(target-ambiguity,要求拆) | 漏 | 漏拦歧义 |
| `review.independent=false`(自审) | `_ask`(结构交给人类确认,不 deny) | **deny** | 过度(但 v0.7.2 已说明 DSH `ask` 会退化为无理由拒绝,是平台差异的有意选择) |
| prod-schema 扫描 | 扫 ≤4000 文件 + PRIORITY_HINTS/DIRS + SKIP_DIRS + 多扩展名 | 只查 12 个固定文件 | 漏扫 |

### C. feedback 每轮提醒缺失(文档-代码不符)—— ❌

- `nseos-feedback/SKILL.md:75` 宣称「每轮路由会在队列有未发条目且(≥3 条或最早超 24h)时加一行提醒」。
- `index.js:468` PROMPT_ROUTING_REMINDER **无** feedback 队列逻辑。Claude 有 `_unsent_feedback_block`(UNSENT_FEEDBACK_MIN_COUNT=3 / MIN_HOURS=24 + legacy 必提醒)。DSH 只做了捕获 + 投递,缺「唯一不依赖人记性的提醒」。AUDIT §3-5 自认「缺」。

### D. upgrade / setup / stale 三态 / 每回合自检 / 一键升级——整体缺失 ❌

- Claude 的 setup/upgrade 提供:byte 比较 stale 三态(CURRENT/STALE/MISSING)、wiring/provenance 检测(7 条注册四元组逐条码)、git commit-sha 裁决(绝不报「已是最新」)、备份 + 复验、每回合自检提醒。DSH 全部没有。
- DSH 安装 = INSTALL.md 里「cp -R 两段」,无任何版本/stale 检测;无 nseos-setup / nseos-upgrade skill。P0_VERIFICATION §5 把「stale 三态 / 自检提醒 / 一键升级」标「保留效果,待实测」,**从未落地**。

### E. progress manifest / feature state / task ledger 无机器强制 🔽

- templates 全迁(PROGRESS_MANIFEST 有 schema_cmd/staleness_cmd/enforced_by 三判据),但门禁代码从不读这些文件。AUDIT §1 自认「文件格式在,门禁不读 manifest」。Claude 版同样只有模板 + 诚实边界,差异不大,但 DSH 把「机器可判」写进了模板正文却没给任何检查。

### F. 双交付模式:路由缺 autopilot 入口 🔽

- 交付模式判定/回退/单次覆盖语义在 `nseos-autopilot` 里忠实迁移。但 persona(agent.cordis.yml rule 1)与 `nseos-route-work` 的路由清单都**没有**「Delivery mode = autopilot → 走 nseos-autopilot」这一条;模式切换依赖 session-start 注入的「Delivery mode = X」+ autopilot skill 描述被模型自行联想。Claude 版靠 session-routing 每轮注入 `_delivery_mode_block()` 显式点出模式。

### G. 复杂度预算超线(违反 D4)❌

- DECISIONS D4 / MIGRATION_PLAN §4:机器层 JS ≤1000 行。实测 core.js 253 + index.js 780 = **1033 行**,已超。对抗评审 C 早就警告「三年后即第二个 Codex 覆辙」。

---

## 三、样子货清单(看起来全,实则残)

### 1. reference 重复(3 对逐字节相同)
- `PARALLEL_DEVELOPMENT.md` ≡ `PARALLEL.md`
- `SECURITY_POLICY.md` ≡ `SECURITY.md`
- `DECISION_RIGHTS.md` ≡ `AUTHORITY.md`
- 迁移改名时旧文件没删,「21 references」被虚高(Claude 17 个)。

### 2. 断链引用(指向已改名/不存在文件)
- `FAILURE_RECOVERY.md:58` → `references/INTEGRATION_AND_RELEASE.md`(不存在,已改 RELEASE.md)
- `VERIFICATION.md:178` → `INTEGRATION_AND_RELEASE.md`(不存在)
- `VERIFICATION.md:3` → `KNOWLEDGE_ENGINEERING.md`(不存在,已改 KNOWLEDGE.md)
- `QUALITY_AND_EVALUATION.md:3` → `VERIFICATION_INTEGRITY.md`(不存在,已改 VERIFICATION.md)
- `agents/feature-developer.md` / `agents/quality-reviewer.md` → `VERIFICATION_INTEGRITY.md`(不存在)
- 结论:VERIFICATION_STATUS.md「36 处 references 引用全解析」是**假绿**。

### 3. 命名漂移(仅 3 对重复文件的「新/旧名混用」)
- `KNOWLEDGE_POLICY.md` 与 `KNOWLEDGE.md` 是**两个不同概念**(前者 = 知识治理/分类/准入,后者 = 知识工程/单一真源/有界上下文),不是改名,均正确保留。
- 真正混用新旧名的只有那 3 对逐字节重复文件:AUTHORITY vs DECISION_RIGHTS(不同文件各自称「唯一真源」)、SECURITY vs SECURITY_POLICY、PARALLEL vs PARALLEL_DEVELOPMENT。

### 4. `$ARGUMENTS` 占位符残留
- nseos-feedback / nseos-learn / nseos-doc-audit / nseos-maintain 四个 skill 正文有未替换的 `$ARGUMENTS`。

### 5. 孤儿模板
- `templates/ADR.md`、`templates/RISK_ASSESSMENT.md` 无任何 skill 引用。

### 6. AUDIT.md 是 v0.1.0 过期快照
- 把已落地的门禁(prod-schema 扫描、release 凭据、账本一问)写成「未做」,把「7 缺口」当现状。它是误导源。

---

## 四、门禁代码正确性问题(两处实质 bug)

### Bug 1:源仓库豁免把 git push/release 也放行了
- `index.js` action-gate:`if (repo === false) return next()`——`isBusinessRepo` 对 preset 源仓库(`preset/preset.yml` 存在)返回 false,于是 `git push` / `git tag` / release 类命令**完全不过门禁**。
- 但 `nseos-route-work/SKILL.md:12` 明写「此豁免只覆盖流程入口路由/技能拦截/文档门禁;**绝不豁免 push/merge/tag/发布/生产动作**的授权与门禁」。文档-代码矛盾,且把 FB-20260814-003 加的「发布/部署强制人类批准」在源仓库里架空。

### Bug 2:release 凭据的 `prod_schema` 字段是死代码
- `prodSchemaFinding: scan.finding !== undefined` 只在「扫到 ORM 风险」时才对凭据要求 `prod_schema` 字段;但「扫到风险」同时会设 `prodSchemaGap` → 直接走 deny,**永远走不到「凭据清风险」的放行分支**。即:有 prod-schema 风险 = 无条件 deny,`prod_schema` 凭据字段填了也白填(技能却教模型填)。

### Bug 3(轻微):README/reference 层「AUTHORITY/DECISION_RIGHTS」双名并存,改 marker 语义时易漏一处。

---

## 五、测试覆盖现状

- `test/marker.test.js` 26 个 test 块、~130 断言,**只测 core.js 纯谓词**(marker 五态 / release·deploy patterns / release consent / release credential / done-claim / product-code / bookkeeping)。
- **index.js 四道门禁接线 + 三处注入 0 覆盖**。即「谓词会 deny」被证明,但「活会话里门真的 armed」从未被证明——正是 FB-20260813-003 的缺口。
- PARITY_CHECKLIST 18 项负控制 **全 PENDING**,一个没跑。
- 无 CI。Claude 版 621 测试含 drift-lock(TestHookDriftLock 等 AST 锁多份复制),DSH 没有等价物。

---

## 六、优先级开发计划

> 判据:每条都有「能证伪」的验收(负控制),不是「跑一下绿了」。按「样子货消除 → 机器层真实现 → 补齐 → 验证」排序。

### P0 内容层正确性(低风险、快、消除假绿)—— 先做
1. 去重 3 对 reference(删 PARALLEL/SECURITY/AUTHORITY 或保留单名,统一引用)。
2. 修 6 处断链引用(INTEGRATION_AND_RELEASE→RELEASE、VERIFICATION_INTEGRITY→VERIFICATION、KNOWLEDGE_ENGINEERING→KNOWLEDGE)。
3. 统一命名漂移(nseos-learn 等改引新名)。
4. 替换 4 处 `$ARGUMENTS` 占位符。
5. 删 2 个孤儿模板,或补引用。
6. 重写 AUDIT.md(或标注被 GAP_ANALYSIS 取代)。
- **验收**:`grep -r "INTEGRATION_AND_RELEASE\|VERIFICATION_INTEGRITY\|KNOWLEDGE_ENGINEERING" preset/` 零命中;`diff` 三对文件不再重复;所有 reference 路径 `fs.resolve` 可解。

### P1 机器层真实现(高杠杆)—— 接着做
7. **action-gate 精确化**:移植 Claude 的 trunk-branch 判定 + PUSH_MULTIREF_FLAGS + VERSION_TAG + DEPLOYISH_WORKFLOW + COMPOSE prod + foreign-repo + target-ambiguity。既消除 feature-branch 误拦,又补上漏拦的发布/部署形态。
8. **修源仓库豁免 bug**:action-gate 对 release/deploy 类命令**不**因 `isBusinessRepo=false` 直接放行(至少保留人类批准层)。
9. **修 prod_schema 死代码**:风险扫到 → 允许凭据 `prod_schema`(human-confirmed)清风险,或把死字段从契约里删掉并诚实标注「扫到即 deny」。
10. **把 8 个 agent 接线成 subagent provider**(persona 读 `agents/*.md` + 只读沙箱 + 禁递归),让 plan-feature/autopilot 的「派子代理」指令能落地。
11. **feedback 每轮提醒**:prompt-routing 注入里加队列计数(≥3 或 ≥24h)。
- **验收**:负控制测试——feature-branch push 放行、`git push --mirror` deny、`gh workflow run lint.yml` 放行、deploy.yml deny、源仓库 `git push` 仍过人类批准、8 个 agent provider 可 spawn 且只读。

### P2 补齐 Claude 能力(中高杠杆)
12. **nseos-setup/upgrade + stale 三态**:装一个「已装 vs 源 vs GitHub 最新 release」三态自检 + 一键重装。
13. **HUMAN_COMMUNICATION 三层冗余**:persona/每轮注入补「说人话」压缩提醒。
14. **reviewer 只读沙箱**(sandbox read-only 替代 toolFilter denylist)。
15. 复杂度预算:把 index.js 拆薄或重估 D4 预算(诚实承认超线,而非假装没超)。

### P3 验证闭环(把「样子货」变「真绿」)
16. **给 index.js 接线写测试**(四门禁 + 三注入的负控制,用 mock fs/exec)。
17. **执行 PARITY_CHECKLIST 18 项**(或转成可自动化的 test)。
18. 加 CI(跑 `node --test`)。
- **验收**:`node --test` 全绿且**覆盖接线层**;PARITY 18 项逐条 PASS/FAIL 有证据;故意注入错误 marker → 门真的 deny。

---

## 六、近期会话复盘(流程/行为问题,E subagent 结论)

### 核心判断:DSH 版「门禁 armed」的证据退化成了代理指标

Claude 版历史(`Hermes/Projects/nseos.md`)早已建立的标准动作是**「故意注入 → 门真 deny → 清除 → 放行」的活会话负控制闭环**;DSH 版把它退化成了「单测绿 + 哨兵 diff 为空」。INBOX `FB-20260813-003` 早就点名「0 次 deny 无法区分门没 armed」,到 v0.12.0 仍未执行。

### 6 条「样子货」证据链(用户原话 + 会话出处)

1. **「先写计划再开工」是样子货**:`session-0367d3c5` T8 用户点名「怎么感觉这些会话都没先写计划」;模型自证约每 5 份收口笔记才有 1 份计划,但发现后把球踢回用户、git 无后续处置。
2. **「先调查根因」是样子货**:T7 用户点名「自以为知道根因不调查」;`session-8e12787c` T20→T21 模型当场再犯(误诊 `{prepend:true}` 是 bug,实为重启后没新回合);v0.12.0 修复被模型自己承认「门禁拦不住它没查」。
3. **「搜 Obsidian 历史」是样子货**:模型自认「只告诉去哪搜,不会真的去搜,全靠模型自觉」。
4. **审批门禁连续三次「修好了」被证伪**:v0.8.0(approval.request,never 下死路)→ v0.9.0(只改文案让模型转述)→ v0.10.0(userQuestions.ask 才真修),前两版用户原话「这个等于没修」。
5. **「验证过/真凭据」全是代理指标**:每版只报「测试绿 + 哨兵 diff 空」,0 次活会话故意注入负控制。
6. **feedback 台账不完整**:`FB-20260815-002/003` 只在 commit/代码/INSTALL.md 里,不在 INBOX/PROCESSED 台账;T8(计划)/T9(claude 版没迁移明白,缺 init/mode/setup/upgrade+assets)从未修复。

### vault 可复用教训(Hermes/Decisions/,11 条已踩过的坑)

绿≠验到(6 形态) / 门禁射程本身可漏项 / 单向空断言在扫描器瞎掉时无条件成立 / 静默失败长得像真结论 / 为缺陷写的门禁长着缺陷的形态(自铸豁免) / 守卫强度=最弱兄弟边 / 机器生成≠机器重算 / 按内容枚举出口 / 长跑收口必须带数字 / 某件事悄悄不成立没有检查会红 / 恰等断言红了先问是代码还是探测器。

### 最高杠杆补救(并入 P3)

**恢复 Claude 版历史标准动作**:每个新版本发布前做一次「故意注入 → 门真 deny → 清除 → 放行」的活会话负控制,取代「测试绿 + diff 空」作为门 armed 的证据。这本身就是 `FB-20260813-003` 早已提出、到 v0.12.0 仍未执行的那条。

---

## 七、待办状态

- [ ] P0(内容层)落地 + 提交
- [ ] P1(机器层)落地 + 负控制测试 + 提交
- [ ] P2(补齐)落地 + 提交
- [ ] P3(验证)PARITY 18 项 + 活会话负控制 + CI + 提交
