---
name: nseos-knowledge
description: 把已批准的 Feature/ADR/Release/Knowledge 摘要沉淀到 Obsidian vault 指定路径:先配置(vault 文件夹、note 类型与 Properties、单向 project→vault 方向、脱敏与冲突政策),再在阶段边界/手动触发时写入,写前请求批准、带预览与溯源、不静默覆盖。当项目需要把批准过的知识写进 Obsidian 供人导航时使用;vault 路径待配置,默认单向、不自动双向同步。
---

# Obsidian 知识沉淀(阶段边界 / 手动)

Git 与项目内 `ai-nseos/` 工件仍是权威执行记录;Obsidian 是可选的人类知识层,用于导航、综合、跨项目发现与经批准的长期记忆。本技能并入 `nseos-learn` 体系,**在阶段边界触发或手动触发**(不是自动后台同步),把已批准的 Feature / ADR / Release / Knowledge 摘要写进 vault 指定路径。

**降级边界(诚实声明):** 默认单向(项目 → vault);没有自动双向同步,Obsidian 端改动只作为提案回流、绝不自动改项目 scope/state;不装 Obsidian 插件、不改 `.obsidian/`。vault 绝对路径待用户配置(见 `DECISIONS.md` 待提供项)。

## 触发时机(阶段边界 / 手动)

- 触发点:已批准计划、持久决策、交接、已验证完成、事故(见 `nseos-route-work`);普通进度停点不写。
- 只写已批准的工件摘要;不存在持续后台同步。

## 一、配置(一次)

1. 前置:项目已初始化;读 `ai-nseos/PROJECT_PROFILE.md` 与 `ai-nseos/OBSIDIAN_PROFILE.md`。
2. 读 preset 内 `references/OBSIDIAN_INTEGRATION.md` 与 `templates/obsidian/` 下的 note 模板。
3. 不扫家目录或全盘。没给 vault 路径/名称就留 `UNKNOWN`,请用户选一个 vault/文件夹。
4. 经批准后,只 inspect 所选 vault 内为学习现有文件夹、Properties、模板、链接约定所需的最小区域;不读无关 note。
5. 提议:vault 内项目文件夹;note 类型与触发点;必需 Properties 与稳定 source identity;方向(默认单向 project→vault);脱敏、敏感、冲突与备份政策;Obsidian URI 还是 plain filesystem Markdown 合适。
6. 默认 plain Markdown 与 `project-to-obsidian` 单向;不装 Obsidian 社区插件、不改 `.obsidian/`。
7. 若自定义 vault 约定需要自动化,先说明需求、涉及文件、权限与测试,经用户批准后落地一个范围精确的项目本地技能/规则。
8. 更新 `OBSIDIAN_PROFILE.md`,但 Decision 保持 `UNCONFIGURED`,直到用户批准每一个写边界与政策。
9. 用一个非敏感工件做 dry-run 预览;不写 vault。

## 二、写入(阶段边界 / 手动)

1. 若用户的全局指示或记忆已定义权威知识库工作流(既有 vault 约定、会话/决策 note),走那条工作流,不要为同一内容建平行管线。
2. 需要 `ai-nseos/OBSIDIAN_PROFILE.md` Decision `APPROVED` 且 Enabled `true`;否则先走本技能的「配置」节。
3. 读 preset 内 `references/OBSIDIAN_INTEGRATION.md` 与相关 Obsidian 模板。
4. 校验每个源资格:Feature summary — `READY_FOR_INTEGRATION` 或按配置的 `RELEASED`;ADR — `ACCEPTED`;Release — `RELEASED` 且带证据;Knowledge — `ACTIVE`,绝不把 `CANDIDATE`/`HYPOTHESIS` 当事实。
5. 用 `knowledge-curator` subagent 角色做只读映射、敏感审查与冲突评估。
6. 生成 preview:目标路径、完整 Properties、source revision、脱敏项、链接与 content diff。
7. 会话内第一次写,或任何 overwrite/冲突解决前,请求批准。
8. 只写批准的 vault 项目文件夹内;永不改 `.obsidian/`、附件或无关 note。
9. 不静默覆盖上次 source revision 之后改过的 note;做冲突提案并停下。
10. 在项目工件/Handoff 或本地 sync ledger 记录 published note 路径、时间戳与 source revision。
11. Obsidian 改动永不自动改项目 scope/state;import 是提案,走正常审批工作流。

## 资产:5 个 Obsidian note 模板

本技能的资产(vault 路径待用户配置,模板原样可用):

- `templates/obsidian/ADR_NOTE.md` —— ADR 决策 note(`nseos_type: adr`,来源 `ACCEPTED`)。
- `templates/obsidian/FEATURE_SUMMARY.md` —— Feature 摘要 note(`nseos_type: feature`,来源 `HANDOFF.md`)。
- `templates/obsidian/KNOWLEDGE_NOTE.md` —— 知识 note(`nseos_type: knowledge`,来源 `ACTIVE`)。
- `templates/obsidian/PROJECT_INDEX.md` —— 项目索引 note(`nseos_type: project-index`,来源 `PROJECT_PROFILE.md`)。
- `templates/obsidian/RELEASE_NOTE.md` —— 发布 note(`nseos_type: release`,来源 `RELEASED`)。

每个模板都带稳定身份字段 `nseos_source_id` / `nseos_source_path` / `nseos_source_revision`,文件名可变、身份不依赖 note 标题。

## 每次对人请求的书写规则

本技能每一处向人类发出的请求——配置节第 3 步选 vault/文件夹、第 5 步提案、第 8 步写边界与政策批准、写入节第 7 步写批准、第 9 步冲突提案——一律按 `references/HUMAN_COMMUNICATION.md` 书写,默认读者完全不懂 IT。这与既有可读性规则(FB-20260717-003:结论先行、一条一行完整句、内部编号首次出现即解释)是**叠加**而非替代:前者解决「读者没跟看过程」,后者解决「读者不懂技术」。配置节第 5 步是术语最重的一步:`Properties`、`one-way`、`stable source identity`、`Obsidian URI vs plain filesystem Markdown` 对多数 Obsidian 用户无意义,要把每项讲成「vault 里会看到什么、之后能/不能做什么」;明说哪些会写进他现有 note、哪些是 Obsidian 自己的 undo 撤不回来的。写入请求关乎用户自己的 note,要点名实际文件、说清对他已写内容会发生什么:哪些 note 新建、哪些被改,冲突时他的新编辑和这版各说什么、哪边即将被覆盖。不许把 overwrite 说成「同步」或「更新」;若他的编辑会被替换,就明说会被替换。
