// @deliveli/nseos-gates — AI-NSEOS delivery-governance gates for DSH.
// All gates are fail-open: any error degrades to allow (or no-op), never to a
// swallowed deny. The pure predicate lives in core.js (unit-tested); this file
// only wires fs + events.

import { DONE_CLAIM_PATTERNS, RELEASE_PATTERNS, evaluateMarker, isNseosSkill, releaseGaps, slug } from "./core.js";

const FLOW_DIR = "ai-nseos/state/flow";

export const name = "@deliveli/nseos-gates";
export const inject = [];

export function apply(ctx) {
  const fs = ctx.get("fs");
  if (fs === undefined) return;

  function cwdOf(exec) {
    const c = exec && exec.agent && exec.agent.session && exec.agent.session.header;
    return c ? c.cwd : undefined;
  }

  function sessionIdOf(exec) {
    return exec && exec.agent ? exec.agent.id : undefined;
  }

  async function safeRead(target) {
    try {
      return await fs.readText(target);
    } catch (e) {
      return undefined;
    }
  }

  async function hasEntry(cwd, rel) {
    try {
      const t = await fs.resolve(rel, cwd ? { cwd } : undefined);
      const info = await fs.stat(t);
      return info !== undefined;
    } catch (e) {
      return false;
    }
  }

  async function isBusinessRepo(cwd) {
    if (!cwd) return false;
    try {
      const git = await hasEntry(cwd, ".git");
      if (!git) return false;
      const isPresetSource = await hasEntry(cwd, "preset/preset.yml");
      return !isPresetSource;
    } catch (e) {
      return false;
    }
  }

  async function markerStatus(sessionId, cwd) {
    try {
      const target = await fs.resolve(FLOW_DIR + "/" + slug(sessionId) + ".json", cwd ? { cwd } : undefined);
      const text = await safeRead(target);
      return evaluateMarker(text, sessionId);
    } catch (e) {
      return { status: "absent", reason: "marker path unresolvable" };
    }
  }

  async function flowActive(exec) {
    try {
      const cwd = cwdOf(exec);
      const sessionId = sessionIdOf(exec);
      if (!cwd || !sessionId) return false;
      return (await markerStatus(sessionId, cwd)).status === "active";
    } catch (e) {
      return false;
    }
  }

  async function deliveryMode(cwd) {
    try {
      const target = await fs.resolve("ai-nseos/PROJECT_PROFILE.md", cwd ? { cwd } : undefined);
      const text = await safeRead(target);
      if (text === undefined) return undefined;
      const m = text.match(/^\s*Delivery mode\s*:\s*(\S+)/m);
      return m ? m[1] : undefined;
    } catch (e) {
      return undefined;
    }
  }

  // ── session-start injection ─────────────────────────────────────────────
  // Seed session id (needed for marker attribution) + the repo's delivery mode
  // once. Static routing lives in the persona (assembled every step); this is
  // only the per-session dynamic part. Fail-open: no id, no injection.
  ctx.on("agent/session-start", async (payload) => {
    try {
      const agent = payload && payload.agent;
      if (!agent || typeof agent.inject !== "function" || typeof agent.id !== "string") return;
      const cwd = agent.session && agent.session.header ? agent.session.header.cwd : undefined;
      let extra = "";
      if (cwd) {
        const mode = await deliveryMode(cwd);
        if (mode !== undefined) extra = "\nDelivery mode = " + mode + "(缺失/不可判读一律按 interactive)";
      }
      agent.inject({
        content: [{
          type: "text",
          text: "[nseos SESSION_ID] = " + agent.id + extra + "\n写 flow marker 时 session_id 填这个值(勿猜、勿留占位)。",
        }],
        source: { kind: "user" },
      });
    } catch (e) {
      // fail-open
    }
  });

  // ── skill-gate ──────────────────────────────────────────────────────────
  ctx.on("tools/pre-execute", async (exec, next) => {
    try {
      if (exec.name !== "skill") return next();
      const skillName = exec.arguments && exec.arguments.name;
      if (!skillName || isNseosSkill(skillName)) return next();
      const cwd = cwdOf(exec);
      if (!(await isBusinessRepo(cwd))) return next();
      if (await flowActive(exec)) return next();
      return {
        kind: "deny",
        reason:
          "在业务仓库且未进入 nseos 流程时,不能顶层调用非 nseos 技能 `" + skillName + "`。先走 nseos-route-work 分类并进入流程(写 flow marker),该技能作为步骤内工具再调用。",
      };
    } catch (e) {
      return next();
    }
  });

  // ── action-gate ─────────────────────────────────────────────────────────
  // Release-class bash needs init + a fresh marker; report ALL unmet items in
  // one aggregated deny (no deny staircase). Fail-open.
  ctx.on("tools/pre-execute", async (exec, next) => {
    try {
      if (exec.name !== "bash") return next();
      const cmd = exec.arguments && exec.arguments.command;
      if (typeof cmd !== "string" || !RELEASE_PATTERNS.some((re) => re.test(cmd))) return next();
      const cwd = cwdOf(exec);
      if (!(await isBusinessRepo(cwd))) return next();
      const initd = await hasEntry(cwd, "ai-nseos/PROJECT_PROFILE.md");
      const active = await flowActive(exec);
      if (initd && active) return next();
      const gaps = releaseGaps({ initd, flowActive: active });
      return {
        kind: "deny",
        reason: "release 类命令(如 git push / gh pr merge)需本会话在 nseos 流程内。当前缺:\n- " + gaps.join("\n- "),
      };
    } catch (e) {
      return next();
    }
  });

  // ── doc-gate (implementation-boundary reminder) ─────────────────────────
  ctx.on("tools/pre-execute", async (exec, next) => {
    try {
      if (exec.name !== "write" && exec.name !== "edit") return next();
      const fp = exec.arguments && exec.arguments.file_path;
      if (typeof fp !== "string" || /\.(md|json|ya?ml|toml|lock)$/i.test(fp)) return next();
      const cwd = cwdOf(exec);
      if (!(await isBusinessRepo(cwd))) return next();
      if (!(await flowActive(exec))) return next();
      if (await hasEntry(cwd, "ai-nseos/state/.impl-boundary-ack")) return next();
      return {
        kind: "deny",
        reason:
          "实现边界提醒:产品代码应交给 feature-worker 子代理(TDD)实现,编排会话只做评审/验证/发布。若确需编排会话直接写,先写一行 ack 到 ai-nseos/state/.impl-boundary-ack(谁在写 + 为什么)。",
      };
    } catch (e) {
      return next();
    }
  });

  // ── progress-gate (done-claim) ──────────────────────────────────────────
  ctx.on("agent/turn-stopping", async (payload) => {
    try {
      const agent = payload && payload.agent;
      if (!agent || typeof agent.steer !== "function") return;
      const sessionQuery = ctx.get("sessionQuery");
      if (sessionQuery === undefined) return;
      const events = await sessionQuery.listEvents(agent.id);
      const assistantTexts = [];
      for (const ev of events) {
        if (!ev || !ev.message || ev.message.role !== "assistant") continue;
        for (const b of ev.message.content || []) {
          if (b && b.type === "text" && typeof b.text === "string") assistantTexts.push(b.text);
        }
      }
      if (assistantTexts.length === 0) return;
      if (!DONE_CLAIM_PATTERNS.some((re) => re.test(assistantTexts[assistantTexts.length - 1]))) return;
      agent.steer({
        content: [{
          type: "text",
          text: "你宣称「做完了」。请先按进度真源重算剩余条目并报一个数字(剩余未绿 N 条,其中 M 条不依赖被挂起项)。若本任务没有可数账本,先说明判定依据。",
        }],
        source: { kind: "user" },
      });
    } catch (e) {
      // fail-open
    }
  });
}
