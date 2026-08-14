---
name: nseos-integrate
description: 评估同一项目里两个及以上 READY_FOR_INTEGRATION 功能的语义冲突、顺序、回归、迁移、回滚与发布就绪度。不自动合并或部署,merge 与 release 仍需人类显式授权。
---

# 集成项目功能

0. 标记 ai-nseos 流程为激活,让机器 skill-gate 放行步骤内的技能。用 `write` 工具写单行 JSON 到 `<仓库根>/ai-nseos/state/flow/<session-slug>.json`:

```json
{"session_id":"<本会话 id>","started_at":"<ISO8601 UTC>","mode":"integrate","contract":"<一行合同要点>"}
```

- `session_id` 取本会话 id,勿猜、勿留占位:门禁据此归属 marker。`contract` 一行要点、单行、不含双引号。
- `<session-slug>` = session_id 的非法字符替换、拒绝 `..`。
- 长流程跨小时要刷新:重写同一文件、`started_at` 重新生成。
- 完整校验语义见 `FLOW_MARKER_CONTRACT.md`(空文件/错 session/过期 >4h → 门禁 deny)。

1. 要求所有功能都属于当前已初始化的项目,处于 `READY_FOR_INTEGRATION`,并带完整的 Handoff 与 Review Report。处于 `PENDING_LIVE_VERIFY` 的功能、或带着一条未关闭的具名 PENDING 活路径验证条目的功能,都不合格:退回去,而不是只靠测试就发布。
2. 读 `references/PARALLEL.md` 与 `references/RELEASE.md`(parallel development 与 integration/release)。
3. 确定 branches/workspace、base 修订、文件/接口/schema/config/依赖的重叠与迁移归属。
4. 用 `subagent` 工具派 `integration-reviewer` 角色子代理做合并后的只读分析。
5. 用本项目的命令定义 merge/迁移顺序与一张合并验证矩阵。
6. 把改动作为 `NEEDS_FIX` 退回其归属功能;不要把修复藏进一条不相干的集成分支。
7. 若合并门禁通过,用 `templates/RELEASE_EVIDENCE.md` 生成 Release Evidence,并建议 `RELEASE_READY`。
8. 在已授权的 merge 或 release 之后,同步每个受影响功能在 `ai-nseos/state/FEATURE_INDEX.md` 里的那一行(`references/STATE_MODEL.md` 拥有那份账本的规则),并确认每个功能的耐久文档已提交——`git ls-files ai-nseos/state/features/<feature-id>/` 必须列出它们。一个已发布功能,若其 contract、plan、evidence 与 handoff 只活在未提交的工作区里,就根本没有交接:另一个账号或机器只读得到 git 里的东西。

按 `references/HUMAN_COMMUNICATION.md` 呈报发布就绪摘要与 merge/release 授权请求——默认读者完全不懂 IT。这与常设可读性规则(FB-20260717-003:结论先行、一条一行完整句、内部 ID 首次出现即解释)是叠加关系,而非替代:FB-20260717-003 解决「读者没看过过程」,`HUMAN_COMMUNICATION.md` 解决「读者不懂技术」。具体说,上线会给用户改变什么、以及如果必须撤销会发生什么——merge 顺序、迁移归属、回滚窗口、以及任何不可逆步骤(一个无法回退的数据迁移、一个先于需要它的代码应用的 schema 变更)都必须陈述成平白的后果,并保留其不可逆性。这是整条流程里被橡皮图章盖过代价最高的一份请求;一个批准发布的人必须能用 TA 自己的话复述出 TA 在批准什么。

等待对 merge、迁移、release 与生产访问的单独的、显式的人类授权。

**「发布」和「部署」是两件事，不是一件（`FB-20260814-001`）。** 若 push 一个 `v*` tag / 合入某个分支会触发部署流水线（CI/CD 在 tag/branch push 时自动跑），必须在 push **之前**显式告诉人类「这一步会触发什么部署、动哪些机器/容器、是否可回滚」，并把它作为**独立于发布**的确认点——不要因为人类说了「执行发布」就假定也授权了部署。实测：一个会话 push 了 `v2.89.1` tag，`deploy.yml` 随即自动触发生产部署，人类问「可以进行部署吗」时部署已经在跑。
