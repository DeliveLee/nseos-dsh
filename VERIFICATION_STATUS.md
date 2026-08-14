# 验证状态(P6 收口)

> 迁移已交付全量资产;行为验证分两类:✅ 代码级已验(挂载 + 确定性逻辑)/ ⏳ 需真实 NSEOS 会话行为验证(deny/inject 实际触发)。后一类需你在 DSH 里开一个 NSEOS preset 会话才能完成,是「hand off」步骤。

## ✅ 代码级已验证(本会话)

| # | 项 | 证据 |
|---|---|---|
| P3 | preset 挂载 | `standingKeyFor('nseos')` 两次通过(含门禁包) |
| P4 | 门禁包解析 | `import('@deliveli/nseos-gates')` → `{apply, inject, name}`;从 profile 目录解析 OK |
| P2 | 12 技能 + 引用 | grep 零 Claude 残留;36 处 references/templates 引用全解析 |
| P2 | 技能 frontmatter | 12/12 `name: nseos-*` + 一句 description |
| — | flow-marker 谓词五态 | 确定性代码(absent/unattributable/stale/active 分支齐),见 `packages/nseos-gates/lib/index.js` |
| — | 4 门禁条件 | skill/action/doc/progress 四门禁的 deny 条件均 fail-open + 确定性 |

## ⏳ 需真实 NSEOS 会话(你操作)

1. 开一个 NSEOS preset 会话(预设选择器选「NSEOS」)。
2. 确认 12 个 `nseos-*` 技能在 skill 目录可见。
3. 在业务仓库(有 `.git`、非 preset 源)里,未进流程时:
   - 调一个非 `nseos-*` 技能(skill 工具)→ 应被 skill-gate deny(带原因)。
   - 跑 `git push` / `gh pr merge` → 应被 action-gate deny(带原因)。
   - 用 `write` 写一个 `.ts` 产品码文件(在流程内、无 ack)→ 应被 doc-gate 提醒一次。
4. 写一个空/错 session 的 flow marker → `flow_marker_status` 应报 unattributable/stale(负控制)。
5. 宣称「做完了」而未读进度真源 → 应被 progress-gate steer 一次问「报数」。

## 已知诚实边界(不伪装对等)

- skill-gate 拦的是 `skill` 工具调用;「直接 `read` 某个 skill 文件」是已知 residual 旁路(未做 read 目录黑名单,留待需要时定)。
- 门禁是 fail-open 纪律层,不是安全边界;DSH 的 sandbox + approval 才是硬边界。
- doc-audit 无自动 cron(降级为手动 sweep + 路由 stale 提醒,见 `nseos-doc-audit`)。
- Obsidian 无自动双向同步(降级为阶段触发写 vault,见 `nseos-knowledge`)。
- 5 个 agent 角色是「角色 prompt 资产」;reviewer「只读沙箱」的机器强制未做(需 registerProvider 自定义 provider,属增强项,非本版)。
