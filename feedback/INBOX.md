# AI-NSEOS (DSH 版) Feedback Inbox

本仓库是 nseos preset 源仓库。使用方会话的反馈走 `~/.dsh/ai-nseos-feedback/` 本地队列 → 确认后发成 GitHub issue(`DeliveLee/nseos-dsh`,label `feedback`);维护者自己的会话直接追加到本文件。处理完的条目移入 `PROCESSED.md`,详见 `preset/skills/nseos-maintain/SKILL.md`。

**范围:只记这个 DSH 版 preset 自己的问题。** Claude 版(`nseos`)与 Codex 版(`nseos-chatgpt-migration`)的缺陷记进它们自己仓库。

<!-- append entries below -->

## FB-20260813-001 — 门禁文案在教模型自铸逃生口(承诺不是锁,但要如实写)
- Date: 2026-08-13
- Component: `packages/nseos-gates` 的 deny 文案 + `nseos-route-work` 的 flow marker 自写指引
- Severity: P2
- Status: BACKLOG
- Observation: `doc-gate` 的 deny 写「先写一行 ack 到 `.impl-boundary-ack`」,flow marker 也是模型用 `write` 自铸。Claude 版实测教训(42c85be7 会话):「false deny is expensive: it trains the user to set `=off`」——每条 deny 自带逃生口,压力下会被当真用。这些 ack/marker 本质是**承诺不是锁**,牙在「违约可被溯源看见」,不在「不可伪造」。
- Expected: 文案保留诚实性(明说这是承诺、不是安全边界),但不把「写个 ack 就能过」写成「门禁会拦住」。安全边界仍是 DSH 的 sandbox + approval。
- Suggested change: 复核四道门禁的 deny 文案,凡「你先写 X 就能继续」类措辞,补一句「这是自证承诺,不是安全控制;真实边界在 sandbox/approval」。

## FB-20260813-002 — 子代理裁决丢失/截断会重问重跑(丢的是最贵的人类裁决)
- Date: 2026-08-13
- Component: `subagent`(backgroundMode: continuable)+ `nseos-review-feature` / 对抗评审流程
- Severity: P2
- Status: BACKLOG
- Observation: Codex 迁移那个 36.5h 会话实测「你的裁决没有送达主会话」×4、「输出太长会被截断,请分两条发」。异步子代理的裁决丢失,会让已完成的评审被重问、重跑,而丢的往往是最贵的那份(人类裁决)。
- Expected: 裁决类子代理要有可核对的交付确认(裁决编号 + 摘要回执),主会话收到后显式登记;「只收到一句『继续』」要被识别为「未送达」而非「已裁决」。
- Suggested change: 在 `nseos-review-feature`/对抗评审里加一条:子代理裁决必须带「PG-N 编号 + 结论摘要」,主会话核对编号连续才收口;对不上的重新索取,不默认已收到。

## FB-20260813-003 — 「0 次 deny」无法区分「门没 armed」(活会话负控制缺失)
- Date: 2026-08-13
- Component: `packages/nseos-gates` 四门禁 + `PARITY_CHECKLIST.md`
- Severity: P2
- Status: BACKLOG
- Observation: 单元级负控制(marker 五态等)证明「谓词会 deny」,但不证明「活会话里门是 armed 的」。Codex 迁移会话实测「6 次独立假绿复现」,其中「0 次拒绝」和「门从没触发」长得一模一样。
- Expected: 活会话里做一次**故意注入**证明门 armed(比如临时写一个错 session 的 marker,确认 skill-gate 真的 deny,再还原),而不是只看「没撞过门」。
- Suggested change: 在 `nseos-maintain` 的验证步或 `PARITY_CHECKLIST` 里,把「一次故意注入 → 门真的 deny」列为活会话验收判据。

## FB-20260813-004 — 复杂度预算的行数/条数是代理指标,可被「搬家即达标」绕过
- Date: 2026-08-13
- Component: `MIGRATION_PLAN.md` §4(D4 复杂度预算:JS≤1000 / test≤100)
- Severity: P2
- Status: BACKLOG
- Observation: Codex 版实测:ratchet 只数 `plugins/**`,把代码挪到 `scripts/` 就绕过了行数门;`rglob` 与 `git ls-files` 对「产品代码」的定义还不一致。`D4` 的「JS≤1000 行」是同一类代理指标——它是「别过度工程」的代理,不是过度工程本身。
- Expected: 预算该守,但要防「把代码挪出 `lib/` 就假装达标」。判据应是「机器层逻辑真的没膨胀」,不是「某目录的行数没超」。
- Suggested change: 在 D4 里补一句:行数预算的对象是「nseos 机器层逻辑的语义总量」,挪目录不改变它;审计时以功能为准,不以路径为准。

## FB-20260813-005 — prompt-routing 每回合重注入缺失(AUDIT #1,漂移最高杠杆)
- Date: 2026-08-13
- Component: `packages/nseos-gates` 注入层 + `AUDIT.md` §3-1
- Severity: P1
- Status: BACKLOG
- Observation: 反漂移/feedback/doc-audit 的「每轮提醒」全部悬空:现在只在 session-start 注入一次,8 小时工具流量会把它冲淡。三处文档(route-work 防跑偏、nseos-feedback 每轮提醒、nseos-doc-audit stale 提醒)都写着「每轮路由会提醒」,但路由层没有重注入。
- Expected: `agent/pre-step`(每人类回合首 step)注入一行反漂移指针,只注入不 reject;同回合不重复注入。
- Suggested change: 补一个 `agent/pre-step` listener,注入一行「报数才算收口 + 账本 + feedback 队列」指针,并让三处文档的「每轮提醒」真正兑现。这是长会话上下文稀释的最便宜、最高杠杆的修复。

