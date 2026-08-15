---
name: nseos-maintain
description: 在 nseos preset 源仓库里跑一轮自维护发布:分诊反馈收件箱与 issue、按策略修 preset 源码、升版本、提交打 tag、重挂载并验证;只在 preset 源仓库内运行,反馈积累到该维护、或用户要求改进 preset 时用。
---

# 维护 nseos preset(自改进循环)

焦点 / 约束:从用户请求归纳(修哪条反馈 / 是否升版本 / 是否重挂载;DSH 的 skill 工具不接收调用参数)。

本技能不自动触发,只在用户明确要求维护、或反馈积累到该维护时运行;且只在 preset 源仓库内运行。

1. 确认当前目录就是 nseos preset 源仓库:本仓库即 nseos preset 源仓库(含 `preset/` 技能目录),且是 git 仓库。否则停止——绝不在安装副本或消费项目里维护(升级会覆盖安装副本,改了也白改)。
2. 读 `DECISIONS.md`(对等边界与已裁决决策)、`AUDIT.md`(能力对账)、`PARITY_CHECKLIST.md`(负控制清单)、`feedback/INBOX.md`、`INSTALL.md` 的更新说明、以及自上个 release tag 起的 `git log`。
2.5. **还要拉 issue 列表——队友把反馈报成 issue,不写进 INBOX.md。** 自捕获改成本地队列后,使用方会话把反馈写进他本机的队列、经确认后发成 GitHub issue;只有维护者自己的会话才直接追加 INBOX.md。所以收件箱不再是整个收件箱:

   ```bash
   gh issue list -R DeliveLee/nseos-dsh -l feedback --state open --limit 100
   gh issue view <n> -R DeliveLee/nseos-dsh --comments
   ```

   把每个 open issue 当作一条 INBOX 条目,在 Step 3 一并分诊。
2.6. **还要扫本机自己的本地队列——未发送的条目不在任何公开收件箱里。** 在业务仓里捕获的条目先落 `~/.dsh/ai-nseos-feedback/` 本地队列,经确认发送后才成 issue;在那之前只读 INBOX.md + issue 的分诊看不见它们。在 preset 源仓库里你就是维护者,所以把队列里翻出来的任何条目直接并进 `feedback/INBOX.md`(Step 2),而不是把它发成 issue 给自己。**跳过这一步 = 把旧版修掉的缺陷往上搬一层重演:报告进来了、没人读,而它的存在制造了「反馈在被处理」的假象。** 注意不对称性——队友看不见 INBOX.md,所以 issue 是他唯一能知道「报告怎么了」的地方。
3. 把每条 INBOX 条目**和每个 open feedback issue** 分诊到唯一去向:
   - `FIX_NOW` — 策略内改动(见下面风险门禁),本轮值得做;
   - `BACKLOG` — 有效但推迟;留在 INBOX 标 Status `BACKLOG` 并写明理由;
   - `REJECTED` — 不是真缺陷或与已记录决策冲突;写明为什么;
   - `NEEDS_USER` — 需要人类决策;本轮呈上并等待。
   写决策请求、以及 Step 4 的风险门禁批准请求时,按 `references/HUMAN_COMMUNICATION.md` 写——默认读者完全不懂 IT。这与既有可读性规则(FB-20260717-003:结论先行、一条一行完整句、内部编号首次出现即解释)叠加而非替代:前者解决「读者没跟看过程」,后者解决「读者不懂技术」。preset 内部黑话是这里的陷阱——FB 编号、门禁名、状态标签对用户毫无意义,直到你说明它对用户意味着什么;所以每个选项都按「他下次在仓库里工作时会经历什么行为」来表述,绝不把人类门禁的放松软化成「小幅调整」。
4. 风险门禁。可自主应用的只有:措辞/清晰度修复、事实更正、增量指引、既有规则的校准、新模板、changelog/文档。必须本会话内取得用户明确批准:状态模型或生命周期改动、决策权/人类门禁改动(尤其任何放松)、新增或删除 agent/skill、安全策略改动、以及任何放松验证标准的事。拿不准就门禁。
5. 在 preset 源码里实现 `FIX_NOW` 条目。每次改动保持最小、可追溯到它的 FB 编号。
6. 发布:升版本(semver:patch = 措辞/文档;minor = 行为/新组件;major = 操作模型变更),在 `INSTALL.md` 加带日期的 Changelog 段并引用 FB 编号,并让 preset 自身文档随版本更新(技能/引用/模板/agent 清单、组件计数等任何本轮改动触及的事实)——版本升了而文档陈旧,视为不完整发布。
7. 提交前验证:每个 JSON 可解析;每个 skill 有合法 frontmatter;编号列表一致;preset 内无密钥或机器特定路径(机器本地事实不写进 preset,留在本机 notes,不上传)。
8. 提交并在 commit message 里带 FB 编号,打 git tag `v<version>`。把已处理条目从 `feedback/INBOX.md` 移到 `feedback/PROCESSED.md` 并写上去向,然后一并提交。**关闭本轮解决的每个 issue,评论里点名版本——用平实语言,因为读者是报它的人,不是你:**

   ```bash
   gh issue close <n> -R DeliveLee/nseos-dsh \
     -c "已在 v<version> 修掉:<一句话说清他下次会经历什么不同>。"
   ```

   对 `BACKLOG` / `REJECTED` 的 issue,**评论但不要静默关闭**——用他能行动的一句话说明决定与理由。这不是客套:收到「你的报告已落地」是任何人再报第二条的唯一原因;一个没解释就被关掉的 issue 读起来就是「被无视」。维护者对自动 push 有常备授权:提交并打 tag 后,`git push origin HEAD` 与 `git push origin --tags`,让私有远端 `DeliveLee/nseos-dsh` 保持同步;确认本地 `HEAD` 等于 `origin/main`。
9. 重挂载并验证(有真实证据):确认新版本 preset 挂载后技能/引用/模板/agent 清单被正确枚举、版本号匹配新 tag。**挂载版本判据(机器可查,不是「我看着像」)**——diff 一个哨兵文件确认挂载副本与源提交一致:

   ```bash
   diff <(git show HEAD:preset/agent.cordis.yml) ~/.dsh/.agent-presets/nseos/agent.cordis.yml
   ```

   记录源 `HEAD`/tag 作为本次挂载版本。preset 按 git 提交快照挂载——未提交的改动不生效;已开会话需重启才拿到新版本。**门禁包是 `cp -R` 拷贝、不是软链**:改过 `packages/nseos-gates/` 必须重跑 `INSTALL.md` 第 1 步的 `cp -R`,否则出现「改了但没生效」——这是实测过的部署滞后 stale 失效模式。
10. 报告:fixed / backlogged / rejected / awaiting-user 各一行计数、新版本号、验证输出。这份报告同样按 `references/HUMAN_COMMUNICATION.md` 写(与 Step 3 相同的 FB-20260717-003 叠加)——它满是对用户没有理由知道的 preset 内部黑话:给每条一句平实语言说明「接下来什么行为会对他不同」,而不是一个 FB 编号加一个去向。`awaiting-user` 桶是一组待决决策,所以把它们作为带建议的实际问题呈出,而不是一个计数。按用户全局指令更新知识库。

收件箱空时,改为跑健康检查(清单可解析、挂载的 preset 版本与最新 tag 一致、preset 声明完整)并报告无需发布。
