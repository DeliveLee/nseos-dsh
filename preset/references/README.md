# NSEOS References(迁移自 Claude 插件)

这些 reference 是从 Claude 插件 `plugins/ai-nseos/references/` 迁移来的治理规则与事故记录。

**读法**:规则(哲学)仍然当前有效;**机制**已随迁移替换为 DSH 原生面。文中出现的 Claude 专属机制名是历史语境,按此映射理解:

| Claude 机制(历史) | DSH 等价(当前) |
|---|---|
| `~/.claude/hooks/*.py` + `settings.json` 注册 | nseos preset 内 Cordis service/event(`tools/pre-execute` 等) |
| `AINSEOS_*_GATE=off` 环境变量阀门 | 门禁逃生舱(settings / 权限预设,人类运维,模型不得自关) |
| `CLAUDE.md` / `CLAUDE_PLUGIN_ROOT` | preset persona + `references/` |
| flow-marker Python CLI | `write` 工具写 marker JSON(见 `FLOW_MARKER_CONTRACT.md`) |
| worktree / main checkout | workspace(DSH 无 worktree) |
| PreToolUse / Stop / SessionStart hook | `tools/pre-execute` / `agent/turn-stopping` / `agent/session-start` |
| Task 工具 / subagent | DSH `subagent` 工具 + 角色 prompt |

事故记录(`FB-*`)保留原文,因为它们记录了「为什么要这条规则」,历史语境不可改。
