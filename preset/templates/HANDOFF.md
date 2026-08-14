# Handoff: <FEATURE-ID>

This file must allow a new Claude Code session or human engineer to continue without prior chat history.

## Objective and status

- Feature outcome:
- Current state:
- Contract version:
- Branch/worktree/base:
- Owner:

## What changed

| File/module | Change | Reason |
|---|---|---|
| | | |

## Decisions and constraints

- Approved decisions:
- ADRs:
- Explicit non-goals:
- Invariants that must be preserved:

## Evidence

- Tests/checks passed:
- Checks failed:
- Not run and why:
- Manual verification:
- Live-path evidence (screenshot/console/network/real response/DB readback/CLI output):
- Deferred live verification: list each as a named PENDING item (item, real path, owner); if any is open, the state is `PENDING_LIVE_VERIFY`.

**硬规则(`FB-20260728-002`):把 URL 和一份待测清单交给用户,不构成完成报告。** 缺少你自己做过的活路径验证时不得声称完成,而**用户的验收测试永远不计作开发 QA**——它是第二道防线,不是第一道。实测形态:admin 页面返回 HTTP 200 → URL 交给用户 → 用户打开是白页(构建继承了 `NODE_ENV=development`,入口 JS 动态 import 404,DOM 空、控制台红)。**状态码看不见白屏,只有打开页面能看见。**

## 文档入库(交接成立的前提)

- `git ls-files ai-nseos/state/features/<FEATURE-ID>/` 输出:
- 六件套是否已全部提交:

**只有已提交的部分才是交接。** 换账号、换机器、重新克隆之后,别人读到的只有 git 里的东西;留在工作树里的合同、计划、证据与本文件等于不存在(`FB-20260802-002` 实测:一个已上线功能的这几份文档全部未提交,含「部署后必须人工补的两步」)。

## Operational impact

- Configuration/flags:
- Migration/data:
- Deployment order:
- Monitoring:
- Rollback:

## Remaining work

- Blocking:
- Backlog/P2/P3:
- Required human approvals:

## Next safe action

Provide one concrete next action and the files/commands needed.

