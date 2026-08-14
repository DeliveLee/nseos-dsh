# P0 验证结论(R1/R2/R3 + §5 Retired 效果论证)

## R1 · scope 落点(已定)

- **结论:全局 standing 预设 + 业务仓谓词。** `nseos` preset 以 standing scope 常驻(`agentPresets.standingKeyFor()`),但门禁/注入靠「业务仓判定」只在实际开发仓生效;个人待办、纯问答、插件源仓库不触发(对齐 Claude 的 `_is_business_repo` + `_is_plugin_source` 豁免)。
- 待 P2/P3 实测:standing 预设的确切挂载入口与「会话如何 join standing scope」。

## R2 · `tools/pre-execute` 分类能力(已核)

- `ToolExecution = {callId, rootCallId?, name, arguments, agent?, parent?, signal}`——**无 cwd / 无 category / 无 agent_id/agent_type**。
- 结论:工具分类靠 `exec.name`(`skill`/`bash`/`write`/`edit`);参数在 `arguments`(`bash.command`、`skill.name`、`write/edit.file_path`);仓库根靠 `sandboxPolicy.resolve({session}).workspaceRoot` + `.git` 上溯;orchestrator-vs-subagent 靠 `exec.agent` + `agents.requireInitiator()`/`isOwnedBy()`。
- deny 通道 = `tools/pre-execute` 返回 `{kind:'deny', reason}`(reason 即 Claude stderr 等价物)。`tools.guard`(同步)、`fs/write-intent`(版本守卫)都不用于 deny。
- **Phase 4 入口前仍需实测**:① deny reason 是否真的回到模型;② 门禁作用域是否覆盖 subagent 调用;③ turn-stopping 的 sessionQuery 能否读到收口文本。

## R3 · goals 能否承接 flow-marker(已核)

- `goals` 契约 = 「backed exclusively by the owning session log」、单 agent 单 goal、字段只有 objective + round cap。
- 结论:**覆盖不了** flow-marker 的「5 属性 / 跨 session 归属 / 4h 新鲜度 / 空文件 deny」。→ flow-marker 自建(唯一自建状态组件,硬边界见 `FLOW_MARKER_CONTRACT.md` §7)。`goals` 只用于「单会话长任务防跑偏」。

## §5 · 需论证的 Retired 效果(逐个定性)

| 效果 | 定性 | 论证/落点 |
|---|---|---|
| 安装 hook 文件本身 | **Retire(真等价)** | DSH 门禁 = preset 内 Cordis service,随声明式挂载生效,无「机器级副本与包分离」层 |
| 「新版本决定正确安装」 | **Retire(真等价)** | cordis.yml 声明式组合天然满足:新 preset 自带新行,旧版无需知道新行长啥样 |
| wiring/provenance 检测 | **保留效果(映射)** | → cordis 挂载诊断(`editing-cordis-compositions` 的「行是否真挂载/贡献」能力);完成判据 = 一个 `nseos-setup` 挂载自检 |
| stale 三态检测 | **保留效果** | → 比较 preset 目录版本标记 vs GitHub 最新 release,报 current/missing/stale 三态 |
| 每回合自检提醒 | **保留效果** | → 并入路由注入(stale 时注入一句「升级」提醒) |
| 一键升级路径 | **保留效果** | → `nseos-upgrade` skill 封装一条命令;**待实测** DSH 重挂是否热加载 |
| marketplace git 源(commit-sha 裁决) | **需实测后 Retire** | **待实测** DSH preset 目录改动是否立即生效 or 有缓存滞后;无缓存则 Retire |
| zip 离线分发 | **保留效果(改机制)** | 用户已裁决:私有 GitHub 库 + 每次完成 release |

## P0 待实测清单(进入 P1/P2 时补)

1. DSH 重挂 preset 是否热加载(决定 `nseos-upgrade` 是 1 步还是多步)。
2. DSH preset 目录改动是否有缓存滞后(决定 marketplace 效果是否 Retire)。
3. standing 预设的挂载入口与 session join 方式(决定 R1 的落地)。
4. 门禁作用域是否覆盖 subagent 调用(决定 doc-gate Branch2 的 orchestrator 判定面)。
