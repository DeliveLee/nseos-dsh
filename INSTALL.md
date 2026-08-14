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

### v0.4.0 — 2026-08-14 部署命令纳入门禁 + 诚实化授权语义(某业务仓库 会话复盘)

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
