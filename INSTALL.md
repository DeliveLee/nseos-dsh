# NSEOS Preset 安装说明

> 目标:把 `nseos` preset(12 技能 + 门禁)装到本机 DSH,并让门禁自定义包可解析。

## 1. 安装门禁包(一次性)

门禁是自定义 Cordis 包 `@deliveli/nseos-gates`,DSH 从「healed fallback」目录 `~/.dsh/profiles/node_modules/` 解析 preset 引用的包。**必须拷贝(不能软链)**——包内 import 了 `@deepseek-ai/dsh-subagent-in-process-driver`,软链会因真实路径在本仓而解析不到该依赖:

```bash
mkdir -p ~/.dsh/profiles/node_modules/@deliveli
rm -rf ~/.dsh/profiles/node_modules/@deliveli/nseos-gates
cp -R <repo>/packages/nseos-gates \
  ~/.dsh/profiles/node_modules/@deliveli/nseos-gates
```

> 说明:DSH 启动时 `healProfilesModuleFallback` 会把 CLI 自带包软链进该目录,不会删掉手动放的目录。**改门禁代码后要重跑上面的 `cp -R`**(拷贝后不自动同步)。DSH 升级后若解析失效,重跑上面三行即可。

## 2. 安装 preset

```bash
rm -rf ~/.dsh/.agent-presets/nseos
cp -R <repo>/preset ~/.dsh/.agent-presets/nseos
```

## 3. 验证挂载

在 DSH 里用探针插件调用 `standingKeyFor('nseos')`,应返回 OK(无报错即挂载成功)。或在 DSH 的预设选择器里选「NSEOS」开一个会话,确认:
- 12 个 `nseos-*` 技能在 skill 目录可见;
- 业务仓库里未进流程时调非 `nseos-*` 技能会被门禁 deny(带原因);
- release 类 bash(如 `git push`)未进流程会被 deny。

## 3.5 配置 Obsidian vault(可选,用于历史查询 + 知识沉淀)

门禁包会在 session-start 时查 vault 并注入「相关历史目录」指针,`nseos-knowledge` 也用它写 note。两种配置方式,任选其一:

```bash
# 方式 A:环境变量
export NSEOS_VAULT="$HOME/Documents/ObsidianVault"

# 方式 B:配置文件(一行路径)
mkdir -p ~/.dsh/ai-nseos
echo "$HOME/Documents/ObsidianVault" > ~/.dsh/ai-nseos/vault-path
```

> 未配置则跳过 vault 查询与沉淀提醒,不影响其它能力。

## 4. 更新

本仓是「源 + 分发」一体:
- 内容(技能/引用/模板/preset 组合)更新 = 改 `preset/` → `git commit` → 重跑第 2 步 `cp -R`。
- 门禁代码更新 = 改 `packages/nseos-gates/` → `git commit` + 重跑第 1 步 `cp -R`(拷贝不自动同步)。
- 每次完成打 tag + release(私有库 `DeliveLee/nseos-dsh`)。

## 5. Changelog

### v0.13.0 — 2026-08-15 差距对账落地:内容层去重断链 + action-gate 精确化 + 门禁接线测试

> 依据 `GAP_ANALYSIS.md`(取代过期的 `AUDIT.md`)。本次是「样子货→真绿」的第一批:消除内容层假绿 + 修机器层正确性 + 给接线补测试。

**内容层(P0)**:
- 删除 3 对逐字节重复 reference(`DECISION_RIGHTS`≡`AUTHORITY`、`SECURITY_POLICY`≡`SECURITY`、`PARALLEL_DEVELOPMENT`≡`PARALLEL`),统一到被引用更多的新名。
- 修 6 处断链(`INTEGRATION_AND_RELEASE`→`RELEASE`、`VERIFICATION_INTEGRITY`→`VERIFICATION`、`KNOWLEDGE_ENGINEERING`→`KNOWLEDGE`),此前 `VERIFICATION_STATUS.md`「36 处引用全解析」是假绿。
- 替换 4 个 skill 里 DSH 不支持的 `$ARGUMENTS` 占位符;`AUDIT.md` 标注为过期快照。

**机器层(P1)**:
- **action-gate 精确化 + 分支感知**(忠实移植 Claude `_release_class`/`_push_targets`):`git push origin feature/foo` 不再误拦(原 `\bgit\s+push\b` 拦所有 push);补上漏拦的 `--mirror/--all/--tags/--follow-tags` 多 ref、版本 tag、`gh workflow run <deploy>`(lint/test 不拦)、docker compose prod 信号。**第二轮代码正确性评审实跑反例后补的根修**:分类器此前是「分支盲」,漏放行 `git merge feature/x`(主干上)、`git push origin HEAD`、`HEAD:refs/heads/main`、`--delete main`、`--git-dir=/x`、`gh workflow run --repo x deploy.yml`,又误拦 `git merge main`(feature 上)、本地 `git tag`、feature 上裸 push;现按当前分支(`.git/HEAD`,跟 gitdir 指针支持 worktree)判定,漏放行/误拦双修。
- **修源仓库豁免 bug**:`git push`/release 在 preset 源仓库不再直接放行——仍走人类批准层(route-work「绝不豁免 push」),只有非 git 目录才放行。
- **修 prod_schema 凭据死代码**:扫描到 ORM 风险不再无条件 deny,改为要求 `prod_schema` 凭据(走五步+人类确认+写凭据)可消解,与 RELEASE.md 语义一致;只有「扫不动」才 fail-loud。
- **feedback 每轮提醒**:prompt-routing 注入加队列计数(≥3 条或最早 ≥24h),兑现 `nseos-feedback` 早已宣称、代码里没有的那条链路。
- **8 个 agent 角色卡从完全死文件改为软指引**:`nseos-route-work` 新增指引——派角色子代理前先 `read agents/<role>.md` 作为 prompt 前缀。**诚实标注:这是软指引,不是机器强制**;Claude 版 `registerProvider`+只读工具集的机器强制仍未做(见 `GAP_ANALYSIS.md` §七)。

**验证(P3)**:
- 新增 `test/wiring.test.js`:mock fs/ctx 捕获四个 `tools/pre-execute` handler,证明 skill-gate 真 deny、action-gate 真放行 feature-branch 且真 deny 主干、ledger/doc-gate 真接线。此前接线层 0 覆盖(纯谓词 29 项测试证明「谓词会 deny」,但「门真的 armed」从未被证明)。
- `package.json` 加 `test` script + 版本 0.13.0;测试 32 谓词 + 8 接线 = 40。`npm test` 自动建 symlink 到 profile node_modules(接线测试不再 self-skip)。

**尚未落地(见 `GAP_ANALYSIS.md` §七,经两轮对抗评审修正)**:
- **8 个 agent 的机器强制**(`registerProvider` + 只读工具集/沙箱)——当前只有软指引。
- **stale 三态机器自检**——当前是维护流程里手动 diff 哨兵(DSH 无 hook 接线层,合理降级)。
- **PARITY_CHECKLIST 剩余项活会话验收 + 接线测试扩展**(humanApprove/prod-schema-unknown/ledger-第3文件/doc-gate术语门 等未覆盖分支)。

### v0.14.0 — 2026-08-15 发布/部署确认合并成一次 + 弹窗讲清「要做什么 → 所以要执行什么」

> 用户反馈:每次部署 `git push → ssh → rsync` 会连弹好几次「发布/部署确认」,且弹窗只写「要动 ssh / 提交」,没有解释。本次把同一发布/部署 episode 的多次弹窗合并成一次,并让弹窗讲清意图→命令→后果。

**门禁(`@deliveli/nseos-gates`)**:
- **合并成一次(episode 同意锁存)**:`humanApprove` 现在按「flow-marker `started_at` + 当前 git HEAD」识别一个发布/部署 episode,同一 episode 内后续 deploy-class 命令(ssh/scp/rsync/kubectl、以及同 HEAD 的再 push)共享那次人类「同意」,不再逐条弹窗。新流程(标记刷新)或新版本(HEAD 变化)是新 episode,重新问;纯内存、`agent/disposed` 时清、进程重启即失效(不是第二个有生命周期状态组件,同 `ledgerState`)。
- **弹窗讲清意图→命令→后果**:`kindLabel` 从笼统的「部署类命令(ssh/scp/rsync/kubectl)」改成具体意图(`部署:通过 ssh 登录服务器执行命令` / `发布:git push 到主干 main`),弹窗正文变为「要做什么 / 所以要执行:`<命令>` / 后果:改动会出去到远程仓库/生产环境 / 是否允许?」。
- **诚实边界(不重开 FB-20260814-003)**:episode 合并只在「已经拿到一次真实人类『同意』」之后生效——自主长跑仍需至少一次人类批准;新版本(HEAD 变化)会先被 release 凭据的 `head_sha` 校验拦下,重做凭据后仍是新 episode 重问。DSH sandbox/approval 仍是真实安全边界,本层是治理层。

**验证(P3)**:
- `evaluateMarker` 新增暴露 `started_at`(供 episode 键);`deployIntent` 纯函数(部署类别→平实描述)。
- 接线测试新增 2 条:「release + deploy 序列只问一次(合并弹窗)+ 弹窗含意图/命令/后果」「刷新 flow marker 是新 episode 重新问」。测试 45 全绿(34 谓词 + 11 接线)。

### v0.12.0 — 2026-08-15 「根因是假设,先证明再动手」——治「自以为知道根因、完全不调查」

**门禁(`@deliveli/nseos-gates`)**:
- 每回合纪律指针第⑤条收紧(FB-20260815-003):从「先 grep vault 历史」扩成「修 bug/下决策/卡住前先调查再动手」——grep 历史 + 复现/取证证明根因,并明说「交接单/历史里写的根因是上一棒的假设、不是事实,复现不出就先查,别自以为知道根因就下手」。治的是「继续开发AI功能交接会话」这类反复出现的行为:模型拿着上一棒的根因结论直接动手,从不复现。

**引用/技能**:
- `FAILURE_RECOVERY.md` 根因纪律新增第一条铁律:「根因是假设不是事实,动手前必须复现+取证(负控制);证明不了就继续调查;交接单/历史/上一棒结论里的根因同样是假设,接手先验证再采信」。
- `nseos-route-work` 轻量模式路由:从「活路径复现根因」改为「**先复现根因并取证,再动手**;交接/历史里的根因是假设,先验证」。

### v0.11.0 — 2026-08-15 撞问题前主动搜 Obsidian 历史(模型不再重蹈旧坑)

**门禁(`@deliveli/nseos-gates`)**:
- 会话开头的 vault 指针从「被动指路」升级为「主动指引」(FB-20260815-002):除 vault 路径与知识库目录外,现在列出历史子目录(`Decisions`/`Releases`/`Sessions`/`Runbooks`/`Conflicts`)与匹配本项目名的 `Projects/` 索引笔记,并明令「撞到问题/要下决策/修 bug 之前,先按本项目名+关键词 grep 这些历史目录,命中就 read 按历史结论走,别重新推导撞同一堵墙」。此前只提示「可以搜」,模型从不真的搜,导致反复踩同一个旧坑。
- 每回合纪律指针新增第⑤条:下决策/修 bug/卡住前先 grep vault 历史目录(自守卫:仅当会话开头给了 vault 路径),把「搜历史」做成每回合重注入的纪律,而不是会话开头一句然后被长对话冲淡。

**引用**:
- `OBSIDIAN_INTEGRATION.md` 新增「读侧/按问题搜历史」一节,说明渐进披露(只注入目录名与路径、绝不批量注入 note 正文,模型按需 grep/read 具体笔记)。

### v0.10.0 — 2026-08-15 发布/部署确认改用「直接问人类」,approval=never / full-access 下也要明确同意才放行

**门禁(`@deliveli/nseos-gates`)**:
- 人类批准层(FB-20260815-001 真正修法):发布/部署的确认从 `approval.request()` 改走 `userQuestions.ask()`。前者受审批策略影响——`approval=never` 下直接拒绝、弹不出窗、人类无法授权(正是 v0.9.0 只靠「转述改回 ask」没解决的那个死路);后者**不受审批策略影响**:门禁直接向人类提问,答案回到门禁而非模型,所以**即使开了 full access 沙箱、即使审批策略是 never,发布/部署前都会问一次,只有人类点选「同意」才放行**。`userQuestions` 服务不可用时才退回 `approval.request()` 老路径。
- 新增纯谓词 `releaseConsentGranted`:只有人类对「release-confirm」问题明确选了「同意」才算授权;拒绝、空选、自定义文字、答错 id、畸形答案一律 deny(绝不静默放行)。
- 子代理(`delegationDepth > 0`)发起的发布/部署直接 deny:子代理没有可对话的人类回答者,不该代推,回编排会话发起。

**测试**:`releaseConsentGranted` 新增 8 条负控制断言,共 26 测试全绿。

### v0.9.0 — 2026-08-15 子代理零输出降级指引 + 审批=never 死路的人类可见恢复

**门禁(`@deliveli/nseos-gates`)**:
- `releaseApprovalDenyReason("rejected")` 重写(FB-20260815-001):明说「对话里打字说允许不算授权——门禁只认审批弹窗的真实点击」,并给模型一段**一字不改**转给人类的话。此前这条恢复指引只写给模型、靠模型转述,转述有损耗,形成「人类已说允许、模型却怎么都推不出去」的死路;现在人类能直接看到恢复动作(把审批策略改回 ask),不再经过模型翻译。
- 每回合纪律指针(prompt-routing)第①条新增子代理零输出降级(FB-20260814-005):`feature-developer` 子代理多轮零文件输出时,降级为主会话直接实现 + `.impl-boundary-ack` 记越界 + 独立评审兜底,不再无信号等待。

**技能/引用**:
- `nseos-build-feature` Step 5:子代理多轮零文件输出列为「必须直接改」的正当情形,降级实现并把越界记录作为独立评审必查项。
- `AUTONOMY_POLICY` 实现边界行:补唯一例外(子代理多轮零输出的降级出口),并强调这不是放宽边界。

**测试**:`releaseApprovalDenyReason` 增 2 条断言(对话文字授权不算数 + 一字不改转达),共 25 测试全绿。

### v0.8.0 — 2026-08-14 发布/部署强制人类批准 + 产品/UX 纳入流程硬步骤

**门禁(`@deliveli/nseos-gates`)**:
- action-gate 新增「人类批准层」(FB-20260814-003):发布/部署命令在通过 marker+凭据自证检查后,还要关到一次真实人类批准上——`approval=never` 下确定性拒绝(模型无法自铸绕过,只能请人类把审批策略改回 ask),`ask` 下弹真实审批。修的是现场事故:某业务仓库「继续开发AI功能交接会话」在 `approval=never` + 自主长跑下连推 v2.90.0→v2.90.14 共 15 版上生产。新增纯谓词 `releaseApprovalDenyReason`(`allowed-once` 是唯一放行,其余 fail-closed)。
- 诚实边界:审批策略仍是人控的硬边界,门禁现在把「发布/部署在 never 下不可绕过」做实;但「ask 下弹窗」依赖部署挂载了审批服务——未挂载时 fail-closed 拦截。

**技能**:
- `nseos-plan-feature` 第 6.5 步(FB-20260814-004):用户可见界面功能必须在计划阶段跑 `product-ux-redesign`(必要时先 `requirements-discovery`)产出 UX 模型(用户旅程 + 交互 + 视觉/一致性约束)并纳入合同,`Complex`/`Exceptional` 不得跳过。
- `nseos-review-feature` 第 5 步:产品性(好不好用/好不好看/交互顺畅)纳入评审发现维度,与功能正确性并列。

### v0.7.2 — 2026-08-14 自审(independent=false)从 ask 改为 deny+理由

- action-gate 的 `review.independent=false`(自审) 由 `{kind:"ask"}` 改为 `{kind:"deny"}` 并带两条解法。原因:DSH 的 `never` 审批策略会把「ask」转成一句无理由的「用户拒绝了 bash」,模型的 release 被卡死却看不到「自审→派独立评审→independent=true 就解锁」。deny 的理由永远回到模型眼前,它能自解,不必等你改策略(现场:某业务仓库「继续开发AI功能交接会话」卡住 30 分钟)。

### v0.7.1 — 2026-08-14 会话小结 = 账本投影,不是第二份散文真源

- progress-gate steer 文案:收口时走 `nseos-knowledge` 写 Obsidian 小结(Updated/Why/Pending),并明说 **`Pending` 直接从 TASK_LEDGER/PROGRESS_MANIFEST 投影**,不得另写散文真源。
- `nseos-knowledge` 触发时机节新增「会话小结是账本投影」:账本没有就写「无账本」,不在 Obsidian 另起散文进度。

### v0.7.0 — 2026-08-14 release 凭据必答测试证据 + 门禁只对编排者生效

**门禁(`@deliveli/nseos-gates`)**:
- release 凭据 `review.note` **必答测试证据**:必须提「测试绿 + 关键负控制/变异」,否则 deny `MISSING_TEST_EVIDENCE`。这是「必答」不是「可核」——真伪交给独立评审,门禁只拦「连说都没说」。
- **ledger-gate(账本一问)与 doc-gate 实现边界提醒改为「只对编排者(主会话)生效」**:`delegationDepth > 0` 的子代理是 bounded worker,无法问人类、本就是 feature-worker,这两道门对它 deny 是死局(Claude FB-20260805-003「22 次 100% 打错人」;现场:bonohair 子任务弹出「要不要建账本」把 worker 卡住)。

### v0.6.0 — 2026-08-14 prompt-routing 每回合重注入 + 实现边界审计可核化

**门禁(`@deliveli/nseos-gates`)**:
- 新增 `agent/pre-step` 每回合首 step 注入(AUDIT #1):业务仓库每个回合顶一句反漂移/纪律指针(交给 feature-developer TDD / 报数收口 / 自审≠独立 / 撞框架限制走 feedback),长会话里纪律不被工具流量冲淡。**只注入、不 reject,用户消息零丢失**;仅首 step 一次、仅业务仓库。
- 新增 peer 依赖 `@deepseek-ai/dsh-llm`(`createUserMessage`)。

**技能**:
- `nseos-review-feature` Step 7.5 实现边界审计可核化:三步核「谁写的」(读 ack + `git log` 查 diff 来历 + 以「commit 是否有对应子代理 closing message」为准),并写诚实边界——DSH 里编排者与子代理同机同 git 身份,`git log` 分不出两者,ack 是自证不是证据。

### v0.5.0 — 2026-08-14 release 凭据门真正接入 action-gate(补文档-代码缺口)

**门禁(`@deliveli/nseos-gates`)**:
- action-gate 现在**真正校验** `ai-nseos/state/.release-ready.json`(此前 `RELEASE.md` 写了、代码没做——文档-代码缺口)。release/deploy 命令在流程内还需:`review`(独立评审,必带 `independent` + `head_sha`)、doc-adopted 仓的 `doc`、prod-schema 扫描有发现时的 `prod_schema`,每字段 `head_sha` 与当前 HEAD 不符即 `EVIDENCE_STALE`。
- `review.independent=false`(自审)→ 返回 `ask`,自审不静默冒充独立评审(与 Claude 一致)。
- 新增 `gitHead`(纯 fs 读 `.git/HEAD`→ loose ref→ packed-refs)与 `releaseCredentialCheck`(纯谓词),单条聚合 deny 列全缺失项。

**诚实边界**:凭据仍是自签(advisory),「自签充数=伪造」由 deny 文案 + `RELEASE.md`/`AUTONOMY_POLICY.md` 纪律兜底,不是硬门;硬边界仍是 sandbox+approval。

### v0.4.0 — 2026-08-14 部署命令纳入门禁 + 诚实化授权语义(某业务仓库会话复盘)

**门禁(`@deliveli/nseos-gates`)**:
- action-gate 新增 `DEPLOY_PATTERNS`(`ssh`/`scp`/`rsync`/`kubectl`),与 `RELEASE_PATTERNS` 同层 gating:业务仓库无新鲜 flow marker 时 deny。此前生产部署可用 `ssh mp 'sudo bash'` + `scp` 完全绕过门禁(只有 `git push/tag` 被拦,`FB-20260814-002`)。
- action-gate deny 文案诚实化:明说「flow marker 是流程自证、不是人类授权;真实发布/部署先向人类确认再继续」,不再暗示「写个 marker 就能过」。

**技能**:
- `nseos-integrate`:新增「发布 ≠ 部署」——push `v*` tag 会触发部署流水线时,必须在 push 前明说后果并作为独立确认点(`FB-20260814-001`)。

**诚实边界**:`DEPLOY_PATTERNS` 仍只覆盖远程/production 命令;本地 `sudo`/`systemctl`/`podman`/`docker` 因歧义过大未纳入(留待需要时定)。flow marker 仍是模型自铸,「在流程内」是自证不是核验——真正的硬边界是 DSH sandbox + approval。

### v0.3.0 — 2026-08-14 长对话漂移防护 + 对抗评审修复

**门禁(`@deliveli/nseos-gates`)**:
- 修 `doc-gate` 实现边界提醒的极性 bug:改用 `enteredFlow`(active **或** stale),4h 窗口过期后不再静默失效(`FB-20260805-003`)。
- `done-claim` 从窄词表改成语义式 + `isDoneClaim` 守卫:抓「本批次完成 / 没活可推进」等漂移说法,排除问句(「都完成了吗」)、否定(「还没做完 / 还剩 2 步未完成」)、配额词(「没有剩余空间」)。
- 新增 `ledger-gate`(账本一问):第 3 个不同产品文件 + 解析不到账本 → deny 一次让模型问人类(`FB-20260805-002`),`NONE` 归一化 + 明令「模型不得自填」。
- fail-open 全程可观测:`gateWarn` + `hasEntry`/`isBusinessRepo` 改三态;release 类仓库检测失败改 fail-loud deny(`MIGRATION_PLAN §0.2 #3/#6`)。
- 修 ack 死锁:清门禁的 `.impl-boundary-ack`/`.gate-armed`/`ambiguity-cleared` 此前会被 doc-gate 自己拦截,新增 `isBookkeepingPath` 放行。
- 修扩展名盲区:`Dockerfile`/`.env`/dotfile 等不再误判为产品码(不误触发账本一问)。

**引用/模板**:
- `STATE_MODEL` 新增「人类已确立的事实是锚,不是待验证项」;`FAILURE_RECOVERY` 新增「先杀整类,别在类内换假设」;`VERIFICATION` 新增「某件事悄悄不成立时,有检查会红吗」+「负控制必须在真实环境做」;`TASK_LEDGER` 诚实化(门看不出「账本被读过」)。
- `MIGRATION_PLAN §4` 声明 `ledgerState` 为进程内瞬时计数(非状态机/非持久化)。

**技能**:
- `nseos-maintain`:修 6 个幽灵文件引用(Claude 布局残留)+ 新增「挂载版本判据」(diff 哨兵文件);`nseos-doc-audit` 去 `.claude` 残留;`nseos-route-work` 补充账本一问的 `bash` 计数盲点说明。

**分发**:
- 新建 `feedback/INBOX.md` + `PROCESSED.md`(5 条 design-level backlog:自铸逃生口 / 子代理裁决丢失 / 0-deny 负控制 / 指标博弈 / prompt-routing 重注入)。

> 三份独立对抗评审(代码正确性 / 假绿 / 约束)抓出并修掉:否定失明、问句误判、ack 死锁、自铸逃生口、静默降级、扩展名盲区、NONE 大小写、幽灵计数、marker 静默 fail-closed。
