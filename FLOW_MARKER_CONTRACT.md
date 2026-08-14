# flow-marker 接口契约(P1 实现基准)

> 这是全计划**唯一允许自建的状态组件**。契约在 P0 冻结,P1 实现 stub + 共享校验谓词,9 个 skill 与 4 个门禁都对着它写。
> 硬边界:5 属性 / 4h 窗口 / 归属校验 / 空文件 deny;**无 schema 版本号 / 无 checkpoint / 无 receipt / 无 rollback journal**(反 Codex 约束 #1)。

## 1. 记录结构(单行 JSON,写 `<业务仓根>/ai-nseos/state/flow/<session-slug>.json`)

```json
{"session_id": "<dsn session id>", "started_at": "<ISO8601 UTC>", "mode": "<free text>", "contract": "<one-line>", "goal_source": "<path>" | ["<path>", ...], "delivery_mode": "interactive" | "autopilot"}
```

## 2. 字段语义

| 字段 | 必填 | 语义 |
|---|---|---|
| `session_id` | 是 | 当前 DSH session id(属性来源;门禁据此归属) |
| `started_at` | 是 | ISO8601 UTC;refresh 必须**重新生成**(恢复新鲜度是 refresh 的全部目的) |
| `mode` | 是 | **自由文本溯源元数据,永不枚举校验**(枚举会锁死新流程名) |
| `contract` | 是 | 一行合同要点 |
| `goal_source` | 否 | 上层计划/进度真源相对路径;once→string、多次→array;**refresh 时若同 session 已存在且未显式给 → 携带旧值**(`--no-goal-source` 显式丢弃) |
| `delivery_mode` | 否 | 仅在显式给 `--delivery-mode` 时发出(记录「本 run 人工覆盖交付流」);refresh **不**携带 |

## 3. 校验语义(共享谓词 `markerStatus(session_id, marker)` 的唯一真源)

| 情形 | 判定 |
|---|---|
| marker 文件缺失 | deny |
| 空文件 / 非对象 / 不可解析 JSON | deny(unattributable) |
| `session_id` 空 / 与**本会话** session_id 不等 | deny(他人 marker 不解锁本会话) |
| `started_at` 不可解析 / 超出窗口(默认 4h,`NSEOS_FLOW_WINDOW_HOURS`) | deny(stale) |
| 全部通过 | allow(fresh + 归属本会话) |

`mode` 与 `goal_source` **不参与 allow/deny 判定**;`goal_source` 只被 progress-gate 用于解析进度真源。

## 4. 位置与消毒

- 一会话一文件,写**主检出**根(linked worktree 共享主检出;DSH 无 worktree 概念时显式声明「不适用」)。
- `session-slug` = session_id 的非法字符替换、拒绝 `..`(路径穿越)。
- 写路径由 `flow-marker` 工具自行定位并**打印绝对路径**(「写哪去了」可答,不靠猜)。

## 5. 工具接口(DSH 模型工具)

```
flow-marker --session <id> --mode <m> --contract "<c>" [--goal-source <path>]... [--no-goal-source] [--delivery-mode <interactive|autopilot>]
```

- 无 `$( )`/`&&`/`;` 依赖(DSH 无此限制,但保持「一条 flat 调用」的简洁)。
- 输出:写入的绝对路径 + 生效后的字段。

## 6. 共享校验谓词 service(独立交付物)

- `markerStatus(session_id) → 'absent' | 'unattributable' | 'stale' | 'active'`。
- 4 个门禁(skill/doc/action/progress)只做薄壳,读这个谓词;**改 marker 语义 = 四门禁一起改一起验**。

## 7. 复杂度边界(不可越线)

- 只存这一份 JSON;无状态机、无迁移版本、无收据、无回滚日志、无 checkpointer。
- 若未来某需求要求「跨会话续接 + 恢复 + 回滚」,那是 `goals` 的事,不是本组件的扩展理由。
