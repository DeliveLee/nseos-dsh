# 技能迁移规范(SKILL_MIGRATION_SPEC)

> 把 Claude 插件 `<upstream-nseos>/plugins/ai-nseos/skills/<name>/SKILL.md`
> 迁移为 DSH 技能 `preset/skills/nseos-<name>/SKILL.md`。
> 目标 = 效果对等:工作流步骤 / 门禁判据 / 模板 / 引用 全部保留;只替换 Claude 专属机制为 DSH 等价。

## 1. 命名与 frontmatter

```markdown
---
name: nseos-<name>
description: <一句话,讲清何时用;去掉 Claude 专属词>
---

# <标题>
```

- `name` 必须 kebab-case,统一 `nseos-` 前缀(已定)。生命周期技能名见下表。

## 2. 必改(Claude 专属 → DSH 等价)

| Claude 原写法 | DSH 写法 |
|---|---|
| `/ai-nseos:init` 等斜杠命令 | 直接写「运行 `nseos-init` 技能」或「初始化 ai-nseos/PROJECT_PROFILE.md」 |
| `python3 ~/.claude/hooks/ai-nseos-flow-marker.py --session ... --mode ... --contract ...` | 「用 `write` 工具把 flow marker 写入 `<仓库>/ai-nseos/state/flow/<session-slug>.json`,JSON 结构见 `FLOW_MARKER_CONTRACT.md`;session_id 取本会话 id,mode 自由文本,contract 一行要点」 |
| `CLAUDE_PLUGIN_ROOT/references/...` | `references/...`(nseos preset 内) |
| `~/.claude/CLAUDE.md` / `~/.claude/hooks/` / `settings.json` 注册 | 删除(DSH 无此层) |
| `claude plugin update` / marketplace / zip 分发 | 「用 `nseos-upgrade` 更新 preset」 |
| `AINSEOS_SKILL_GATE=off` 等阀门 | 「门禁逃生舱见 DECISIONS.md D5#10(人类运维,模型不得自关)」 |
| `[ai-nseos SESSION_ID]` 注入值 | 「本会话 id」 |
| worktree / main checkout | workspace(DSH 无 worktree,声明不适用) |
| subagent(Task 工具)/ agent | DSH `subagent` 工具 + 角色 prompt |
| Stop hook / Stop 门禁 | 「done-claim 报数」由 progress-gate 在 `agent/turn-stopping` 机械执行 |

## 3. 必留(效果对等核心)

- 所有工作流步骤、门禁判据、验收/证据标准、回退语义。
- 对 `references/`、`templates/` 的引用路径(相对)。
- HUMAN_COMMUNICATION(说人话)规则、双交付模式、autopilot 判据一致。
- 「诚实边界」(什么没被强制)的声明。

## 4. 生命周期技能收敛映射(12 个)

| DSH 技能 | Claude 源(收敛自) |
|---|---|
| `nseos-route-work` | session-routing 注入 + init + mode + setup 的路由部分 |
| `nseos-plan-feature` | plan-feature |
| `nseos-build-feature` | build-feature |
| `nseos-review-feature` | review-feature |
| `nseos-integrate` | integrate |
| `nseos-learn` | learn |
| `nseos-feedback` | feedback |
| `nseos-maintain` | maintain |
| `nseos-doc-audit` | doc-audit |
| `nseos-autopilot` | autopilot-confirm + autopilot-accept |
| `nseos-generate-domain-knowledge` | generate-domain-knowledge |
| `nseos-knowledge` | configure-obsidian + sync-obsidian(降级为阶段触发写 vault) |

## 5. 参考资产(references/ 与 templates/)

- 17 个 reference → 收敛为 `references/OPERATING_MODEL.md`(主)+ 附录(按需加载),不全文塞 system prompt。
- 16 个模板 → `templates/`(原样保留,替换 Claude 专属路径)。
- 5 个 Obsidian note 模板 → `nseos-knowledge` 的资产。

## 6. 验收(每技能)

- frontmatter `name`/`description` 合规;无 `/ai-nseos:`、无 `python3 ~/.claude/`、无 `CLAUDE_PLUGIN_ROOT`、无 marketplace/zip 残留(grep 零命中)。
- 引用 `references/`/`templates/` 的路径都能解析到 `preset/` 下真实文件。
- 工作流步骤与门禁判据语义与源一致(逐条对照)。
