// @deliveli/nseos-gates — AI-NSEOS delivery-governance gates for DSH.
// All gates are fail-open: any error degrades to allow (or no-op), never to a
// swallowed deny. The pure predicate lives in core.js (unit-tested); this file
// only wires fs + events.

import { startInProcessRun } from "@deepseek-ai/dsh-subagent-in-process-driver";
import { DONE_CLAIM_PATTERNS, PROD_SCHEMA_CANDIDATES, PROD_SCHEMA_PATTERNS, RELEASE_PATTERNS, evaluateMarker, isNseosSkill, releaseGaps, slug } from "./core.js";

const FLOW_DIR = "ai-nseos/state/flow";

// Read-only reviewer: no file writes, no shell, no recursive delegation. The
// role persona arrives in the prompt; this provider only enforces the boundary.
const READ_ONLY_PERSONA =
  "You are a read-only independent reviewer subagent. You may read, search, and reason, but you must not write or edit files, run shell commands, or delegate further. Return your analysis as text.";
const READ_ONLY_TOOL_FILTER = {
  deny: ["write", "edit", "bash", "subagent", "subagent_fork", "workflow", "ralph", "todo_write"],
};

class NseosReviewerProvider {
  name;
  capabilities = { outputSchema: false, depthLimit: true, toolFilter: true, persona: true };
  inheritsParentContext = false;
  constructor(name) {
    this.name = name;
  }
  start(request) {
    if (request.persona === undefined) request.persona = READ_ONLY_PERSONA;
    request.toolFilter = READ_ONLY_TOOL_FILTER;
    request.maxDepth = 1;
    return startInProcessRun(request, {});
  }
  prepareContinuable() {
    return Promise.resolve({});
  }
}

export const name = "@deliveli/nseos-gates";
export const inject = [];

export function apply(ctx) {
  const fs = ctx.get("fs");
  if (fs === undefined) return;

  // Register the read-only reviewer subagent backend. The spawn backend already
  // runs a child with zero parent context; this provider additionally removes
  // every write/delegation tool so the reviewer cannot mutate or recurse.
  const subagents = ctx.get("subagents");
  if (subagents !== undefined) {
    subagents.registerProvider(new NseosReviewerProvider("nseos-reviewer"));
  }

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

  // Glossary gate: a doc-adopted repo (docs/domain/GLOSSARY.md) with any feature
  // armed (.gate-armed) but not cleared (ambiguity-cleared) holds product code.
  // Returns the offending feature name, or undefined (gate holds nothing).
  async function glossaryArmedNotCleared(cwd) {
    try {
      if (!(await hasEntry(cwd, "docs/domain/GLOSSARY.md"))) return undefined;
      const dir = await fs.resolve("ai-nseos/state/features", cwd ? { cwd } : undefined);
      let entries;
      try {
        entries = await fs.listDir(dir);
      } catch (e) {
        return undefined; // no features dir → nothing armed
      }
      for (const e of entries) {
        if (e.type !== "directory") continue;
        const base = "ai-nseos/state/features/" + e.name;
        if (!(await hasEntry(cwd, base + "/.gate-armed"))) continue;
        if (await hasEntry(cwd, base + "/ambiguity-cleared")) continue;
        return e.name; // armed but not cleared
      }
      return undefined;
    } catch (e) {
      return undefined; // fail-open: can't read → don't hold
    }
  }

  // Prod-schema scan: fail-loud on ORM auto-sync markers. Returns an object
  // { finding } (matched pattern + file) or { unknown } (a candidate could not
  // be read) or {} (clean). "unknown" is a deny, never a silent allow.
  async function prodSchemaScan(cwd) {
    try {
      for (const rel of PROD_SCHEMA_CANDIDATES) {
        const target = await fs.resolve(rel, cwd ? { cwd } : undefined);
        const info = await fs.stat(target);
        if (info === undefined) continue; // candidate absent → not an unknown
        const text = await safeRead(target);
        if (text === undefined) return { unknown: true, file: rel }; // present but unreadable
        for (const re of PROD_SCHEMA_PATTERNS) {
          if (re.test(text)) return { finding: { file: rel, pattern: re.source } };
        }
      }
      return {};
    } catch (e) {
      return { unknown: true };
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
  // Release-class bash needs init + a fresh marker + a clean prod-schema scan;
  // report ALL unmet items in one aggregated deny. The prod-schema scan is
  // fail-LOUD (a "couldn't see" is never a "clean"): an unknown scan result
  // denies. The rest is fail-open.
  ctx.on("tools/pre-execute", async (exec, next) => {
    try {
      if (exec.name !== "bash") return next();
      const cmd = exec.arguments && exec.arguments.command;
      if (typeof cmd !== "string" || !RELEASE_PATTERNS.some((re) => re.test(cmd))) return next();
      const cwd = cwdOf(exec);
      if (!(await isBusinessRepo(cwd))) return next();
      const initd = await hasEntry(cwd, "ai-nseos/PROJECT_PROFILE.md");
      const active = await flowActive(exec);
      const scan = await prodSchemaScan(cwd);
      let prodSchemaGap;
      if (scan.finding) prodSchemaGap = "ORM 自动迁移风险(" + scan.finding.file + " 命中 " + scan.finding.pattern + "),先走 prod-schema 五步并与人类确认";
      else if (scan.unknown) prodSchemaGap = "prod-schema 扫描不完整(无法确认无自动迁移风险),按安全检查 fail-loud 处理";
      if (initd && active && prodSchemaGap === undefined) return next();
      const gaps = releaseGaps({ initd, flowActive: active, prodSchema: prodSchemaGap });
      return {
        kind: "deny",
        reason: "release 类命令(如 git push / gh pr merge)需本会话在 nseos 流程内且无 ORM 自动迁移风险。当前缺:\n- " + gaps.join("\n- "),
      };
    } catch (e) {
      return next();
    }
  });

  // ── doc-gate (glossary-armed hard gate + implementation-boundary reminder) ─
  ctx.on("tools/pre-execute", async (exec, next) => {
    try {
      if (exec.name !== "write" && exec.name !== "edit") return next();
      const fp = exec.arguments && exec.arguments.file_path;
      if (typeof fp !== "string" || /\.(md|json|ya?ml|toml|lock)$/i.test(fp)) return next();
      const cwd = cwdOf(exec);
      if (!(await isBusinessRepo(cwd))) return next();
      // Branch 1 — hard gate: domain-term ambiguity unresolved.
      const armed = await glossaryArmedNotCleared(cwd);
      if (armed !== undefined) {
        return {
          kind: "deny",
          reason:
            "术语歧义门:feature `" + armed + "` 已武装(.gate-armed)但未清歧义(缺 ambiguity-cleared)。先在 docs/domain/GLOSSARY.md 定义本 feature 触及的每个领域术语并写 ambiguity-cleared,再写产品代码。",
        };
      }
      // Branch 2 — advisory reminder: implementation boundary.
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
