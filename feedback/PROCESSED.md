# AI-NSEOS (DSH 版) Feedback — Processed

已分诊并处理完的条目从 `INBOX.md` 移入这里,保留去向与版本。维护流程见 `preset/skills/nseos-maintain/SKILL.md`。

<!-- append processed entries below -->

## FB-20260814-001 — 发布(tag push)自动触发生产部署,模型 push 前未说破
- Disposition: FIXED@0.4.0 — `nseos-integrate` 新增「发布 ≠ 部署」:push `v*` tag 会触发部署流水线时,必须在 push 前明说后果并作为独立确认点。保留「发布」与「部署」两个独立的人类授权点。

## FB-20260814-002 — action-gate 被自铸 flow marker 绕过(现场实锤)
- Disposition: PARTIAL@0.4.0 — 已做两件:① action-gate 新增 `DEPLOY_PATTERNS`(`ssh`/`scp`/`rsync`/`kubectl`),生产部署命令不再完全绕过门禁;② deny 文案诚实化(「marker 是自证、不是授权,真实发布/部署先问人类」)。
- **诚实边界(未做、也不该假装做了)**:flow marker 仍是模型自铸,「在流程内」是自证不是核验——这是架构事实(marker 必须模型可写才能进流程),真正的硬边界是 DSH sandbox + approval。`approval=never` 下没有任何机制能强制人类回答,这是用户的显式选择。本地 `sudo`/`systemctl`/`podman`/`docker` 因歧义过大未纳入 `DEPLOY_PATTERNS`。
- **后续**:该「诚实边界」被真实事故证伪(某业务仓库在 `approval=never` + 自主长跑下连推 15 版上生产),于 v0.8.0 由 FB-20260814-003 闭环——见下。

## FB-20260814-003 — 生产部署在 approval=never + 自主长跑下可无限推版(自铸可绕过,现场 15 版本上生产)
- Disposition: FIXED@0.8.0 — action-gate 新增「人类批准层」:发布/部署命令通过 marker+凭据自证检查后,还要关到一次真实人类批准上。`approval=never` 下 `approval.request()` 确定性拒绝(模型无法自铸绕过,只能请人类把审批策略改回 ask),`ask` 下弹真实审批。新增纯谓词 `releaseApprovalDenyReason`(`allowed-once` 唯一放行,其余 fail-closed);未挂载审批服务或无归属 agent 时 fail-closed 拦截。测试 +1(共 25)。

## FB-20260814-004 — 流程缺产品/UX/视觉设计环节,交付物「能用但不好用」
- Disposition: FIXED@0.8.0 — `nseos-plan-feature` 第 6.5 步:用户可见界面功能必须在计划阶段跑 `product-ux-redesign` 产出 UX 模型(用户旅程 + 交互 + 视觉约束)并纳入合同,`Complex`/`Exceptional` 不得跳过;`nseos-review-feature` 第 5 步把产品性(好不好用/好不好看/交互顺畅)纳入发现维度,与功能正确性并列。
