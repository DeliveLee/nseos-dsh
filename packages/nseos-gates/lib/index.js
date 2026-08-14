// @deliveli/nseos-gates — AI-NSEOS delivery-governance gates for DSH.
// All gates are fail-open: any error degrades to allow (or no-op), never to a
// swallowed deny. The marker predicate is the single shared validation source.

const FLOW_DIR = "ai-nseos/state/flow";
const WINDOW_HOURS = 4;
const NSEOS_PREFIX = "nseos-";

// Release-class bash: only trunk push / merge / prod deploy / release actions.
// Deliberately conservative — never blocks feature-branch or local work.
const RELEASE_PATTERNS = [
  /\bgit\s+push\b/,
  /\bgh\s+pr\s+merge\b/,
  /\bgh\s+workflow\s+run\b/,
  /\bgh\s+release\s+create\b/,
  /\bgit\s+tag\b/,
];

// Closing text that claims global completion.
const DONE_CLAIM_PATTERNS = [
  /(?:没有|无)(?:可自主推进|剩余|要做的)(?:的)?(?:活|工作|任务)/,
  /(?:都|全部|已经)(?:做|完成)完了/,
  /no work remains/i,
  /\b(?:all done|everything is done)\b/i,
];

function slug(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

function cwdOf(exec) {
  const c = exec && exec.agent && exec.agent.session && exec.agent.session.header;
  return c ? c.cwd : undefined;
}

function sessionIdOf(exec) {
  return exec && exec.agent ? exec.agent.id : undefined;
}

function isNseosSkill(name) {
  return typeof name === "string" && name.startsWith(NSEOS_PREFIX);
}

export const name = "@deliveli/nseos-gates";
export const inject = [];

export function apply(ctx) {
  const fs = ctx.get("fs");
  if (fs === undefined) return;

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

  // Business repo = a git repo that is not the nseos preset source repo.
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

  // The single shared marker predicate: absent | unattributable | stale | active.
  async function markerStatus(sessionId, cwd) {
    try {
      const target = await fs.resolve(FLOW_DIR + "/" + slug(sessionId) + ".json", cwd ? { cwd } : undefined);
      const info = await fs.stat(target);
      if (info === undefined) return { status: "absent", reason: "no marker file" };
      const text = await safeRead(target);
      if (text === undefined) return { status: "unattributable", reason: "marker unreadable" };
      if (text.trim() === "") return { status: "unattributable", reason: "empty marker" };
      let obj;
      try {
        obj = JSON.parse(text);
      } catch (e) {
        return { status: "unattributable", reason: "unparseable JSON" };
      }
      if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return { status: "unattributable", reason: "not a JSON object" };
      if (typeof obj.session_id !== "string" || obj.session_id === "") return { status: "unattributable", reason: "missing or empty session_id" };
      if (obj.session_id !== sessionId) return { status: "unattributable", reason: "marker belongs to another session" };
      const t = Date.parse(obj.started_at);
      if (Number.isNaN(t)) return { status: "unattributable", reason: "unparseable started_at" };
      if (Date.now() - t > WINDOW_HOURS * 3600 * 1000) return { status: "stale", reason: "marker older than " + WINDOW_HOURS + "h window" };
      return { status: "active", reason: "fresh marker attributed to this session" };
    } catch (e) {
      return { status: "absent", reason: "marker path unresolvable" };
    }
  }

  async function flowActive(exec) {
    try {
      const cwd = cwdOf(exec);
      const sessionId = sessionIdOf(exec);
      if (!cwd || !sessionId) return false;
      const s = await markerStatus(sessionId, cwd);
      return s.status === "active";
    } catch (e) {
      return false;
    }
  }

  // ── session-start injection ─────────────────────────────────────────────
  // Seed the session id once so the model can write a correctly-attributed
  // flow marker (the gates match on exec.agent.id). Fail-open: no id, no marker.
  ctx.on("agent/session-start", (payload) => {
    try {
      const agent = payload && payload.agent;
      if (!agent || typeof agent.inject !== "function" || typeof agent.id !== "string") return;
      agent.inject({
        content: [{
          type: "text",
          text: "[nseos SESSION_ID] = " + agent.id + "\nWhen writing the flow marker, set session_id to exactly this value (never guess it, never leave a placeholder).",
        }],
        source: { kind: "user" },
      });
    } catch (e) {
      // fail-open
    }
  });

  // ── skill-gate ──────────────────────────────────────────────────────────
  // A non-nseos skill (the `skill` tool) in a business repo, outside an active
  // flow, is denied: nseos is the outer operating model.
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
  // A release-class bash command needs an active flow (init + marker). Fail-open.
  ctx.on("tools/pre-execute", async (exec, next) => {
    try {
      if (exec.name !== "bash") return next();
      const cmd = exec.arguments && exec.arguments.command;
      if (typeof cmd !== "string") return next();
      if (!RELEASE_PATTERNS.some((re) => re.test(cmd))) return next();
      const cwd = cwdOf(exec);
      if (!(await isBusinessRepo(cwd))) return next();
      if (await flowActive(exec)) return next();
      return {
        kind: "deny",
        reason:
          "release 类命令(如 git push / gh pr merge)需本会话在 nseos 流程内(已 init + 有新鲜 flow marker)。先进 nseos-route-work 标记流程,再执行发布。",
      };
    } catch (e) {
      return next();
    }
  });

  // ── doc-gate (implementation-boundary reminder) ─────────────────────────
  // First product-code write in a flow without the ack reminds the orchestrator
  // to delegate to a feature worker. Advisory: denies once, ack is self-mintable.
  ctx.on("tools/pre-execute", async (exec, next) => {
    try {
      if (exec.name !== "write" && exec.name !== "edit") return next();
      const fp = exec.arguments && exec.arguments.file_path;
      if (typeof fp !== "string") return next();
      if (/\.(md|json|ya?ml|toml|lock)$/i.test(fp)) return next(); // non-product-code
      const cwd = cwdOf(exec);
      if (!(await isBusinessRepo(cwd))) return next();
      if (!(await flowActive(exec))) return next();
      const ack = await hasEntry(cwd, "ai-nseos/state/.impl-boundary-ack");
      if (ack) return next();
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
  // A closing claim of global completion must be backed by a fresh read of the
  // progress source; otherwise steer once to ask for the number. Serial event.
  ctx.on("agent/turn-stopping", async (payload) => {
    try {
      const agent = payload && payload.agent;
      if (!agent || typeof agent.steer !== "function") return;
      const sessionQuery = ctx.get("sessionQuery");
      if (sessionQuery === undefined) return;
      const events = await sessionQuery.listEvents(agent.id);
      const assistantTexts = [];
      for (const ev of events) {
        // assistant messages carry a role; only look at text blocks
        if (!ev || !ev.message) continue;
        const m = ev.message;
        if (m.role !== "assistant") continue;
        const blocks = m.content || [];
        for (const b of blocks) {
          if (b && b.type === "text" && typeof b.text === "string") assistantTexts.push(b.text);
        }
      }
      if (assistantTexts.length === 0) return;
      const closing = assistantTexts[assistantTexts.length - 1];
      if (!DONE_CLAIM_PATTERNS.some((re) => re.test(closing))) return;
      agent.steer({
        role: "user",
        content:
          "你宣称「做完了」。请先按进度真源重算剩余条目并报一个数字(剩余未绿 N 条,其中 M 条不依赖被挂起项)。若本任务没有可数账本,先说明判定依据。",
      });
    } catch (e) {
      // fail-open: never block a turn close on a gate error
    }
  });
}
