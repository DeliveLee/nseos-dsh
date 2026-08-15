---
name: nseos-route-work
description: NSEOS 外层操作模型——先分类、再路由到最小够用的交付流程。业务仓库里的开发执行(修 bug / 建功能 / 评审 / 发布)一律先走这里,作为顶层入口;其它任何技能都是流程步骤内的工具。
---

# 路由 NSEOS 工作

先分类,再只加载需要的流程。不要每个回合塞进全部策略。

## 插件源仓库豁免

结构性谓词:仓库根含 `.agent-presets/nseos/preset.yml` 且声明本 preset,或本仓库就是 nseos preset 源仓库。当前工作目录在该仓库内时,例行开发/修复**不进入** NSEOS 生命周期(不建 run、不写 marker、不建审批挑战)。此豁免只覆盖「流程入口路由 / 技能拦截 / 文档门禁」;**绝不豁免 push / merge / tag / 发布 / 生产动作**的授权与门禁。

## 路由(分类 → 选最小流程)

- 解释 / 状态 / 只读诊断:直接查答,不建流程状态。
- 单点 bug / 小改(有明显 oracle):走 `nseos-build-feature` 的轻量模式(合同要点 + **先复现根因并取证,再动手**;交接/历史里写的根因是上一棒的假设,先验证再采信)。
- 跨模块 / 语义不清 / 产品敏感:走 `nseos-plan-feature`;用户可见界面在计划阶段内先 `product-ux-redesign` 立旅程与交互模型。材料决策解决且 `APPROVED` 后才进 build。
- 审计 / 回归排查 / 安全评审 / 发布候选:走 `nseos-review-feature`。
- 集成 / tag / 部署 / 迁移 / 生产:走 `nseos-integrate`。
- 项目 onboarding / 持久决策 / 可复用教训:走 `nseos-learn`。
- 全仓健康 / 多扇区漂移 / 反馈闭环:走 `nseos-doc-audit`(文档扇区)+ 反馈闭环。
- 已批准计划 / 持久决策 / 交接 / 已验证完成 / 事故 → `nseos-knowledge`(vault 配置了就写;普通进度停点不写)。

## 外层控制原则(框架决定一切技能调用)

**任何技能——包括你自己的项目专用技能、其它框架技能——都是 nseos 各步骤【内】的工具,不是顶层入口。** 需求发现/计划在 `nseos-plan-feature` 内、实现在 `nseos-build-feature` 内、修 bug/UX 根因/对齐在轻量模式内调用它们。机器级 skill-gate 会机械拦截「业务仓库里、未进入流程时」对任何非 `nseos-*` 技能(skill 工具)的顶层调用,引导先进流程。进入流程后自动放行。

## 标记流程激活(flow marker)

进入任何流程前,先写本会话的 flow marker——每个门禁都读它判断「是否在流程内」。用 `write` 工具写单行 JSON 到 `<仓库根>/ai-nseos/state/flow/<session-slug>.json`:

```json
{"session_id":"<本会话 id>","started_at":"<ISO8601 UTC>","mode":"<lightweight|plan-feature|build-feature|review-feature|integrate|learn>","contract":"<一行合同要点>"}
```

- `session_id` 取本会话 id,勿猜;`mode` 自由文本(provenance 元数据,不枚举校验);`contract` 一行要点。
- `<session-slug>` = session_id 的非法字符替换、拒绝 `..`。
- 长流程跨小时要刷新:重写同一文件、`started_at` 重新生成;`goal_source`(上层计划路径)刷新时携带旧值,除非显式丢弃。
- 完整校验语义见 `FLOW_MARKER_CONTRACT.md`(空文件/错 session/过期 >4h → 门禁 deny)。

## 人类门禁不变

合同范围批准、merge、release 仍需显式确认;自动化只去「记命令」的摩擦,不去审批。

## 长任务防跑偏

宣布「做完了 / 没活可推进」前,按进度真源重算剩余条目并报数。真源顺序:本会话 marker 的 `goal_source` → `ai-nseos/PROJECT_PROFILE.md` 的 `Progress source:` → 仓库根 `STATUS.md`/`PROGRESS.md`/`ai-nseos/state/progress.json`。**交接单 / 本批次是批次,不是目标。** 长跑目标必须写成「终态 + 验收判据 + 停止条件 + 证据形式」。

## 每个任务都要账本

够门槛的任务一律要一份能数的清单(红/绿,一行一条)。本会话用 `write`/`edit` 工具改到第 3 个不同产品文件而解析不出账本时,门禁会拦一次、让模型去问人类「要不要建账本」。他说不要 → 在流程标记里写 `"goal_source":"NONE"`,门禁此后安静;拒绝前先告诉他代价(此后没有机器能替他核对「做完了」)。小修(1–2 个文件)不问。**注意:走 `bash`(sed/echo/cp)改文件不计入这 3 个文件**,这是已知的计数盲点——账本一问不是安全边界,是催办。

## 不适用(不触发 nseos)

个人待办 / 提醒、纯阅读 / 问答、nseos preset 源仓库自身。

## 加载引用(按需)

- `references/OPERATING_MODEL.md` — 流程归属/宿主行为不清时读。
- `references/STATE_MODEL.md` — 多回合状态。
- `references/VERIFICATION.md` — oracle 与评审权限。
- `references/HUMAN_COMMUNICATION.md` — 决策/呈报/阻塞(默认读者不懂 IT)。
- `references/RELEASE.md` — 集成或发布。
