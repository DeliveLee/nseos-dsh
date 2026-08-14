# AI-NSEOS (DSH 版) Feedback — Processed

已分诊并处理完的条目从 `INBOX.md` 移入这里,保留去向与版本。维护流程见 `preset/skills/nseos-maintain/SKILL.md`。

<!-- append processed entries below -->

## FB-20260814-001 — 发布(tag push)自动触发生产部署,模型 push 前未说破
- Disposition: FIXED@0.4.0 — `nseos-integrate` 新增「发布 ≠ 部署」:push `v*` tag 会触发部署流水线时,必须在 push 前明说后果并作为独立确认点。保留「发布」与「部署」两个独立的人类授权点。

## FB-20260814-002 — action-gate 被自铸 flow marker 绕过(现场实锤)
- Disposition: PARTIAL@0.4.0 — 已做两件:① action-gate 新增 `DEPLOY_PATTERNS`(`ssh`/`scp`/`rsync`/`kubectl`),生产部署命令不再完全绕过门禁;② deny 文案诚实化(「marker 是自证、不是授权,真实发布/部署先问人类」)。
- **诚实边界(未做、也不该假装做了)**:flow marker 仍是模型自铸,「在流程内」是自证不是核验——这是架构事实(marker 必须模型可写才能进流程),真正的硬边界是 DSH sandbox + approval。`approval=never` 下没有任何机制能强制人类回答,这是用户的显式选择。本地 `sudo`/`systemctl`/`podman`/`docker` 因歧义过大未纳入 `DEPLOY_PATTERNS`。
