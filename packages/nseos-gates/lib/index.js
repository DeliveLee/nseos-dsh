// @deliveli/nseos-gates — AI-NSEOS delivery-governance gates for DSH.
// Fail-open is per-decision, not blanket: the advisory gates (skill/doc/
// ledger/progress) fail OPEN on error, the release prod-schema scan fails LOUD
// (an unknown scan result denies — never reads "couldn't see" as "clean"), and
// a marker read that fails CLOSED for skill-gate means stale/absent still
// denies. Every fail-open degradation emits gateWarn so it is observable, never
// silent. Pure predicates live in core.js (unit-tested); this file wires fs+events.

import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { startInProcessRun } from "@deepseek-ai/dsh-subagent-in-process-driver";
import { DONE_CLAIM_PATTERNS, DEPLOY_PATTERNS, PROD_SCHEMA_CANDIDATES, PROD_SCHEMA_PATTERNS, RELEASE_PATTERNS, enteredFlow, evaluateMarker, isBookkeepingPath, isDoneClaim, isNseosSkill, isProductCodePath, releaseCredentialCheck, releaseGaps, slug } from "./core.js";

const FLOW_DIR = "ai-nseos/state/flow";

// Fail-open alert (MIGRATION_PLAN §0.2 #3 / PARITY_CHECKLIST #15): a gate that
// degrades to allow must be observable, never silent. console.warn lands in the
// DSH process log; wrapped defensively so the alerter itself can never throw.
function gateWarn(where, err) {
  try {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      const msg = err && err.message ? err.message : String(err);
      console.warn("[nseos-gates] fail-open @" + where + ": " + msg);
    }
  } catch (e) {
    /* never throw from the alerter */
  }
}

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

  // A subagent child (delegationDepth > 0) is a bounded worker, not the
  // orchestrator. Reminders that ask the model to "delegate" or "ask the human"
  // (ledger-gate, doc-gate implementation-boundary) must NOT fire for it: the
  // subagent IS the delegatee and cannot reach the human, so a deny there is a
  // dead-end that just wedges the worker (Claude FB-20260805-003: "22 次 100%
  // 打错人").
  function isSubagent(exec) {
    const h = exec && exec.agent && exec.agent.session && exec.agent.session.header;
    return h ? (h.delegationDepth || 0) > 0 : false;
  }

  async function safeRead(target) {
    try {
      return await fs.readText(target);
    } catch (e) {
      return undefined;
    }
  }

  // Tri-state: true = entry exists; false = entry does not exist; undefined =
  // could not determine (fs error). Distinct from "not found" so callers can
  // fail-loud when evidence is missing (MIGRATION_PLAN §0.2 #3/#6), instead of
  // silently conflating "couldn't see" with "clean".
  async function hasEntry(cwd, rel) {
    try {
      const t = await fs.resolve(rel, cwd ? { cwd } : undefined);
      const info = await fs.stat(t);
      return info !== undefined;
    } catch (e) {
      gateWarn("hasEntry:" + rel, e);
      return undefined;
    }
  }

  // Tri-state: true = business repo (.git, not preset source); false =
  // definitively not a business repo; undefined = could not determine.
  async function isBusinessRepo(cwd) {
    if (!cwd) return false;
    try {
      const git = await hasEntry(cwd, ".git");
      if (git === undefined) return undefined;
      if (!git) return false;
      const isPresetSource = await hasEntry(cwd, "preset/preset.yml");
      if (isPresetSource === undefined) return undefined;
      return !isPresetSource;
    } catch (e) {
      gateWarn("isBusinessRepo", e);
      return undefined;
    }
  }

  async function markerStatus(sessionId, cwd) {
    try {
      const rel = FLOW_DIR + "/" + slug(sessionId) + ".json";
      const exists = await hasEntry(cwd, rel);
      if (exists === undefined) {
        // stat error: hasEntry already emitted gateWarn, so this is observable;
        // "absent" is still the fail-open answer the callers need.
        return { status: "absent", reason: "marker stat error" };
      }
      if (!exists) return { status: "absent", reason: "no marker file" };
      const target = await fs.resolve(rel, cwd ? { cwd } : undefined);
      const text = await safeRead(target);
      return evaluateMarker(text, sessionId);
    } catch (e) {
      gateWarn("markerStatus", e);
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

  // "Entered a flow at some point" — active OR stale. Used by the doc-gate
  // implementation-boundary reminder so it does not go silent after the 4h
  // window (see enteredFlow in core.js / FB-20260805-003).
  async function flowEntered(exec) {
    try {
      const cwd = cwdOf(exec);
      const sessionId = sessionIdOf(exec);
      if (!cwd || !sessionId) return false;
      return enteredFlow((await markerStatus(sessionId, cwd)).status);
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
  function homeDir() {
    try {
      if (typeof process !== "undefined" && process.getBuiltinModule) {
        return process.getBuiltinModule("node:os").homedir();
      }
      if (typeof process !== "undefined" && process.env && process.env.HOME) return process.env.HOME;
    } catch (e) {
      /* fall through */
    }
    return undefined;
  }

  // Obsidian vault path: env NSEOS_VAULT, else ~/.dsh/ai-nseos/vault-path (one line).
  async function vaultPath() {
    try {
      if (typeof process !== "undefined" && process.env && process.env.NSEOS_VAULT) return process.env.NSEOS_VAULT;
      const home = homeDir();
      if (!home) return undefined;
      const text = await safeRead(await fs.resolve(home + "/.dsh/ai-nseos/vault-path"));
      return text && text.trim() ? text.trim() : undefined;
    } catch (e) {
      return undefined;
    }
  }

  // Obsidian query pointer: surface the vault's knowledge-base dirs + any
  // project-named folder under <kb>/Projects/. Progressive disclosure — names
  // only, never note content.
  async function vaultPointer(cwd) {
    try {
      const vault = await vaultPath();
      if (!vault) return "";
      const vaultDir = await fs.resolve(vault);
      const top = await fs.listDir(vaultDir);
      const kbDirs = top.filter((e) => e.type === "directory" && !e.name.startsWith(".")).slice(0, 4).map((e) => e.name);
      if (kbDirs.length === 0) return "";
      const project = cwd ? String(cwd).split("/").pop() : "";
      const projectHits = [];
      if (project) {
        for (const kb of kbDirs) {
          try {
            const projectsTarget = await fs.resolve(vault + "/" + kb + "/Projects");
            const pEntries = await fs.listDir(projectsTarget);
            for (const p of pEntries) {
              const name = p.name;
              if (name.startsWith(".") || name.includes(".bak")) continue;
              if (name.toLowerCase().includes(project.toLowerCase())) {
                projectHits.push(kb + "/Projects/" + name);
              }
            }
          } catch (e) {
            // no Projects subfolder under this kb dir
          }
        }
      }
      const hitLine = projectHits.length ? "\n与本项目相关的历史笔记:" + projectHits.slice(0, 6).join(" / ") : "";
      return "\nObsidian vault 配置在 " + vault + ";知识库目录:" + kbDirs.join(" / ") + hitLine + "。要看历史决策/发布/知识记录,用 grep/read 在 vault 里按项目名/关键词搜。";
    } catch (e) {
      return "";
    }
  }

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

  // ── ledger-gate state + resolution ──────────────────────────────────────
  // Per-session in-memory state: distinct product-code files touched, and a
  // one-shot "nudged" latch (this is advisory, so it means "we prompted once",
  // NOT "the human answered"). A process restart merely re-prompts once.
  // Entries are evicted on agent/disposed so the Map stays bounded.
  const ledgerState = new Map(); // sessionId -> { files: Set<string>, nudged: boolean }

  // Resolve the task's countable ledger to a path, the literal "NONE" (human
  // declined), or undefined (no ledger and no answer yet). Order: marker
  // goal_source → PROJECT_PROFILE "Progress source:" → default candidates.
  async function ledgerSource(cwd, sessionId) {
    try {
      const markerTarget = await fs.resolve(FLOW_DIR + "/" + slug(sessionId) + ".json", cwd ? { cwd } : undefined);
      const markerText = await safeRead(markerTarget);
      if (markerText !== undefined) {
        const m = JSON.parse(markerText);
        const gs = m && m.goal_source;
        if (typeof gs === "string" && gs.trim().toUpperCase() === "NONE") return "NONE";
        const list = Array.isArray(gs) ? gs : typeof gs === "string" && gs.trim() !== "" ? [gs] : [];
        if (list.length > 0 && list.every((p) => typeof p === "string" && p.trim().toUpperCase() === "NONE")) return "NONE";
        for (const p of list) {
          if (typeof p !== "string") continue;
          if (p.trim().toUpperCase() === "NONE") continue;
          if (await hasEntry(cwd, p)) return p;
        }
      }
    } catch (e) {
      /* unparseable marker → fall through to next source */
    }
    try {
      const profTarget = await fs.resolve("ai-nseos/PROJECT_PROFILE.md", cwd ? { cwd } : undefined);
      const prof = await safeRead(profTarget);
      if (prof !== undefined) {
        const m = prof.match(/^\s*Progress source\s*:\s*(\S+)/m);
        if (m && m[1]) {
          const v = m[1].trim();
          if (/^(?:NONE|不需要|不建|无)/i.test(v)) return "NONE";
          if (await hasEntry(cwd, v)) return v;
        }
      }
    } catch (e) {
      /* fall through to default candidates */
    }
    for (const p of ["STATUS.md", "PROGRESS.md", "ai-nseos/state/progress.json"]) {
      if (await hasEntry(cwd, p)) return p;
    }
    return undefined;
  }

  // Read the current git HEAD (40-hex, lowercased) via .git/HEAD → loose ref →
  // packed-refs. fs-only so the gate never shells out; returns undefined when
  // the HEAD cannot be determined (the credential check then fails loud).
  async function gitHead(cwd) {
    try {
      const head = await safeRead(await fs.resolve(".git/HEAD", cwd ? { cwd } : undefined));
      if (head === undefined) return undefined;
      const t = head.trim();
      if (/^[0-9a-f]{40}$/i.test(t)) return t.toLowerCase(); // detached HEAD
      const m = t.match(/^ref:\s*(.+?)\s*$/);
      if (!m) return undefined;
      const ref = m[1];
      const loose = await safeRead(await fs.resolve(".git/" + ref, cwd ? { cwd } : undefined));
      if (loose !== undefined) {
        const s = loose.trim();
        if (/^[0-9a-f]{40}$/i.test(s)) return s.toLowerCase();
      }
      const packed = await safeRead(await fs.resolve(".git/packed-refs", cwd ? { cwd } : undefined));
      if (packed !== undefined) {
        for (const line of packed.split("\n")) {
          if (line[0] === "#" || line[0] === "^") continue;
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2 && parts[1] === ref && /^[0-9a-f]{40}$/i.test(parts[0])) return parts[0].toLowerCase();
        }
      }
      return undefined;
    } catch (e) {
      return undefined;
    }
  }

  // Read + parse the release credential. undefined = missing OR unparseable
  // (both treated as "no credential" by releaseCredentialCheck).
  async function readReleaseCredential(cwd) {
    try {
      const text = await safeRead(await fs.resolve("ai-nseos/state/.release-ready.json", cwd ? { cwd } : undefined));
      if (text === undefined) return undefined;
      const obj = JSON.parse(text);
      return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : undefined;
    } catch (e) {
      return undefined;
    }
  }

  // Evict per-session ledger state when the agent leaves, so the Map stays
  // bounded over the process lifetime (fail-open best-effort cleanup).
  ctx.on("agent/disposed", (payload) => {
    try {
      const id = payload && payload.agent && payload.agent.id;
      if (id) ledgerState.delete(id);
    } catch (e) {
      /* best-effort */
    }
  });

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
        if (mode !== undefined) extra += "\nDelivery mode = " + mode + "(缺失/不可判读一律按 interactive)。";
        // Query pointer (progressive disclosure): point at the project's docs,
        // never inject their full content.
        if (await hasEntry(cwd, "docs/domain")) {
          extra += "\n本仓库是 doc-adopted(docs/domain/):动手前先读 GLOSSARY.md / BUSINESS-RULES.md / WORKFLOWS.md 里与任务相关的部分,术语以 GLOSSARY 为准。";
        }
        if (await hasEntry(cwd, "ai-nseos/PROJECT_PROFILE.md")) {
          extra += "\n读 ai-nseos/PROJECT_PROFILE.md 拿治理详情、Always/Ask/Never 与 Progress source(进度真源)。";
        }
        extra += await vaultPointer(cwd);
      }
      agent.inject({
        content: [{
          type: "text",
          text: "[nseos SESSION_ID] = " + agent.id + extra + "\n写 flow marker 时 session_id 填这个值(勿猜、勿留占位)。",
        }],
        source: { kind: "user" },
      });
    } catch (e) {
      gateWarn("session-start injection", e);
      // fail-open
    }
  });

  // ── prompt-routing (每回合首 step 注入) ─────────────────────────────────
  // A one-line anti-drift/discipline pointer injected once per human turn (first
  // step only) so the TDD / report-a-number / independent-review discipline is
  // not diluted by long tool traffic. Fail-open: never rejects a step (a user
  // message is never dropped). Business repos only.
  const PROMPT_ROUTING_REMINDER =
    "[nseos] 本回合若在业务仓库做交付执行:①产品代码交给 feature-developer 子代理(测试驱动,先写测试);②宣称「做完」前按进度真源报剩余 N/M;③自审≠独立评审,release 凭据的 review.independent 要如实写 false;④反复撞到同一框架限制就走 nseos-feedback 记录。纯阅读/问答/预设源仓库忽略本提醒。";
  ctx.on("agent/pre-step", async (payload, next) => {
    try {
      if (payload.step !== 1) return next(); // once per turn, first step only
      const agent = payload && payload.agent;
      if (!agent || !Array.isArray(payload.messages)) return next();
      const cwd = agent.session && agent.session.header ? agent.session.header.cwd : undefined;
      if ((await isBusinessRepo(cwd)) !== true) return next();
      const decision = await next();
      if (decision.kind !== "enter") return decision;
      return {
        kind: "enter",
        messages: [
          ...decision.messages,
          createUserMessage({
            content: [{ type: "text", text: PROMPT_ROUTING_REMINDER }],
            source: { kind: "plugin", plugin: name, form: "snapshot", sections: [{ name, text: PROMPT_ROUTING_REMINDER }] },
          }),
        ],
      };
    } catch (e) {
      gateWarn("prompt-routing", e);
      return next();
    }
  });

  // ── skill-gate ──────────────────────────────────────────────────────────
  ctx.on("tools/pre-execute", async (exec, next) => {
    try {
      if (exec.name !== "skill") return next();
      const skillName = exec.arguments && exec.arguments.name;
      if (!skillName || isNseosSkill(skillName)) return next();
      const cwd = cwdOf(exec);
      if ((await isBusinessRepo(cwd)) !== true) return next();
      if (await flowActive(exec)) return next();
      return {
        kind: "deny",
        reason:
          "在业务仓库且未进入 nseos 流程时,不能顶层调用非 nseos 技能 `" + skillName + "`。先走 nseos-route-work 分类并进入流程(写 flow marker),该技能作为步骤内工具再调用。",
      };
    } catch (e) {
      gateWarn("skill-gate", e);
      return next();
    }
  });

  // ── action-gate ─────────────────────────────────────────────────────────
  // Release/deploy-class bash needs init + a fresh marker + a clean prod-schema
  // scan; report ALL unmet items in one aggregated deny. The prod-schema scan
  // is fail-LOUD (a "couldn't see" is never a "clean"): an unknown scan result
  // denies. The rest is fail-open. DEPLOY_PATTERNS (ssh/scp/rsync/kubectl) are
  // gated alongside RELEASE_PATTERNS so a session cannot deploy to production
  // by shelling out while only git push/tag were covered.
  ctx.on("tools/pre-execute", async (exec, next) => {
    try {
      if (exec.name !== "bash") return next();
      const cmd = exec.arguments && exec.arguments.command;
      if (typeof cmd !== "string") return next();
      const isRelease = RELEASE_PATTERNS.some((re) => re.test(cmd));
      const isDeploy = DEPLOY_PATTERNS.some((re) => re.test(cmd));
      if (!isRelease && !isDeploy) return next();
      const cwd = cwdOf(exec);
      const repo = await isBusinessRepo(cwd);
      if (repo === false) return next(); // definitively not a business repo
      if (repo !== true) {
        // fail-loud: a release/deploy command must not silently pass when the
        // repo type is undeterminable (MIGRATION_PLAN §0.2 #6).
        return {
          kind: "deny",
          reason: "release/deploy 类命令:无法确认当前目录是否为业务仓库(仓库检测出错),按 fail-loud 处理不静默放行——请确认工作目录与 .git 状态后重试。",
        };
      }
      const initd = await hasEntry(cwd, "ai-nseos/PROJECT_PROFILE.md");
      const active = await flowActive(exec);
      const scan = await prodSchemaScan(cwd);
      let prodSchemaGap;
      if (scan.finding) prodSchemaGap = "ORM 自动迁移风险(" + scan.finding.file + " 命中 " + scan.finding.pattern + "),先走 prod-schema 五步并与人类确认";
      else if (scan.unknown) prodSchemaGap = "prod-schema 扫描不完整(无法确认无自动迁移风险),按安全检查 fail-loud 处理";
      // Release credential (RELEASE.md): independent review + doc + prod_schema,
      // each bound to head_sha. Only evaluated once the session is in-flow; a
      // missing/stale credential is aggregated into the same single deny.
      let credGaps = [];
      let selfReview = false;
      if (initd && active) {
        const cred = await readReleaseCredential(cwd);
        const currentHead = await gitHead(cwd);
        const docAdopted = await hasEntry(cwd, "docs/domain");
        const r = releaseCredentialCheck(cred, { currentHead, docAdopted, prodSchemaFinding: scan.finding !== undefined });
        credGaps = r.gaps;
        selfReview = r.selfReview;
      }
      if (initd && active && prodSchemaGap === undefined && credGaps.length === 0) {
        if (selfReview) {
          // Self-review (independent:false) must never be silently packaged as
          // reviewed. Return a DENY (not "ask"): under DSH's "never" approval
          // policy, "ask" degrades to a reason-less "用户拒绝了 bash", hiding
          // WHY and wedging the model. A deny reason always reaches the model,
          // so it can self-resolve (派独立评审 → independent=true) or ask the
          // human, without waiting for the policy to change.
          return {
            kind: "deny",
            reason: "release 凭据的 review.independent=false(自审),自审不能静默冒充独立评审。两条路任选其一后重试:①派一个没参与实现的 quality-reviewer 子代理做独立评审,产出报告后把 review.independent 改成 true 并重写 head_sha;②请人类明确确认这次自审发布放行。",
          };
        }
        return next();
      }
      const gaps = releaseGaps({ initd, flowActive: active, prodSchema: prodSchemaGap }).concat(credGaps);
      const kind = isDeploy && !isRelease ? "部署类命令(ssh/scp/rsync/kubectl)" : "release/deploy 类命令(如 git push / git tag / ssh)";
      return {
        kind: "deny",
        reason:
          kind + "需本会话在 nseos 流程内(新鲜 flow marker)、无 ORM 自动迁移风险、且 release 凭据覆盖独立评审/文档/生产 schema。当前缺:\n- " +
          gaps.join("\n- ") +
          "\n\n注意:flow marker 与 release 凭据是自证/自签,不是人类授权;凭据只在对应真实动作发生后写(自签充数=伪造,比缺更糟)。若本次是真实发布/部署,请先向人类明确确认(问人类工具)并记录答复(FB-20260814-002)。",
      };
    } catch (e) {
      gateWarn("action-gate", e);
      return next();
    }
  });

  // ── ledger-gate (账本一问) ──────────────────────────────────────────────
  // Faithful port of FB-20260805-002: after the 3rd distinct product-code file
  // in a business repo with no resolvable ledger and no prior answer, deny once
  // so the model asks the human whether to create one. Registered BEFORE
  // doc-gate so it counts every product-code write (doc-gate's first-write
  // reminder would otherwise eat write #1). Advisory: the deny asks the model
  // to ask the human — it is not a security boundary.
  ctx.on("tools/pre-execute", async (exec, next) => {
    try {
      if (exec.name !== "write" && exec.name !== "edit") return next();
      if (isSubagent(exec)) return next(); // 子代理是 bounded worker,无法问人类,不触发
      const fp = exec.arguments && exec.arguments.file_path;
      if (!isProductCodePath(fp)) return next();
      if (isBookkeepingPath(fp)) return next(); // bookkeeping: markers, acks, state
      const cwd = cwdOf(exec);
      if ((await isBusinessRepo(cwd)) !== true) return next();
      const sessionId = sessionIdOf(exec);
      if (!sessionId) return next();
      let rec = ledgerState.get(sessionId);
      if (!rec) {
        rec = { files: new Set(), nudged: false };
        ledgerState.set(sessionId, rec);
      }
      if (rec.nudged) return next();
      rec.files.add(fp);
      if (rec.files.size < 3) return next();
      const ledger = await ledgerSource(cwd, sessionId);
      if (ledger !== undefined) {
        rec.nudged = true; // has a ledger, or human already declined ("NONE")
        return next();
      }
      rec.nudged = true; // one-shot: prompt once, then let it go (advisory)
      return {
        kind: "deny",
        reason:
          "账本一问:本会话已尝试写 " + rec.files.size + " 个不同产品文件,但解析不到可数账本(flow marker 的 goal_source / PROJECT_PROFILE 的 Progress source / STATUS.md·PROGRESS.md·progress.json 都没有)。请先问人类要不要为这个任务建一份账本(TASK_LEDGER):他说要 → 建好后继续;他说不要 → 在流程标记里写 \"goal_source\":\"NONE\"。注意:\"NONE\" 只有人类明确说不要才能写,模型不得自己填(自填等于自铸逃生口,FB-20260805-002);写之前先告诉他代价——此后没有机器能替他核对「做完了」。",
      };
    } catch (e) {
      gateWarn("ledger-gate", e);
      return next();
    }
  });

  // ── doc-gate (glossary-armed hard gate + implementation-boundary reminder) ─
  ctx.on("tools/pre-execute", async (exec, next) => {
    try {
      if (exec.name !== "write" && exec.name !== "edit") return next();
      const fp = exec.arguments && exec.arguments.file_path;
      if (!isProductCodePath(fp)) return next();
      if (isBookkeepingPath(fp)) return next(); // bookkeeping: markers, acks, ambiguity-cleared
      const cwd = cwdOf(exec);
      if ((await isBusinessRepo(cwd)) !== true) return next();
      // Branch 1 — hard gate: domain-term ambiguity unresolved.
      const armed = await glossaryArmedNotCleared(cwd);
      if (armed !== undefined) {
        return {
          kind: "deny",
          reason:
            "术语歧义门:feature `" + armed + "` 已武装(.gate-armed)但未清歧义(缺 ambiguity-cleared)。先在 docs/domain/GLOSSARY.md 定义本 feature 触及的每个领域术语并写 ambiguity-cleared,再写产品代码。",
        };
      }
      // Branch 2 — advisory reminder: implementation boundary. Orchestrator
      // only: a subagent IS the feature-worker, so "交给 feature-worker" is
      // nonsense for it (Claude FB-20260805-003: 22 次 100% 打错人). Uses
      // flowEntered (active OR stale), not flowActive, so a long session's
      // expired marker does not silently drop this reminder.
      if (isSubagent(exec)) return next();
      if (!(await flowEntered(exec))) return next();
      if (await hasEntry(cwd, "ai-nseos/state/.impl-boundary-ack")) return next();
      return {
        kind: "deny",
        reason:
          "实现边界提醒:产品代码应交给 feature-worker 子代理(TDD)实现,编排会话只做评审/验证/发布。若确需编排会话直接写,先写一行 ack 到 ai-nseos/state/.impl-boundary-ack(谁在写 + 为什么)。",
      };
    } catch (e) {
      gateWarn("doc-gate", e);
      return next();
    }
  });

  // ── progress-gate (done-claim) ──────────────────────────────────────────
  ctx.on("agent/turn-stopping", async (payload) => {
    try {
      const agent = payload && payload.agent;
      if (!agent || typeof agent.steer !== "function") return;
      // Scope: only in business repos. Preset-source repo, read-only Q&A and
      // personal todos are out of scope (route-work's "不适用/源仓库豁免").
      const cwd = agent.session && agent.session.header ? agent.session.header.cwd : undefined;
      if (!(await isBusinessRepo(cwd))) return;
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
      if (!isDoneClaim(assistantTexts[assistantTexts.length - 1])) return;
      agent.steer({
        content: [{
          type: "text",
          text: "你宣称「做完了」。请先按进度真源重算剩余条目并报一个数字(剩余未绿 N 条,其中 M 条不依赖被挂起项)。若本任务没有可数账本,先说明判定依据。\n若有持久决策 / 已验证成果 / 事故,收口前走 nseos-knowledge 写一行 Obsidian 小结(Updated / Why / Pending):Pending 直接从 TASK_LEDGER / PROGRESS_MANIFEST 投影(红/绿 + 挂起原因 + parent_plan),不得另写一份散文真源;普通进度停点不写。",
        }],
        source: { kind: "user" },
      });
    } catch (e) {
      gateWarn("progress-gate", e);
      // fail-open
    }
  });
}
