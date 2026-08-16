// Wiring tests: prove the four gates in index.js actually deny/allow on the
// right events (not just that the pure predicates in core.js are correct).
// This is the "live-session negative control" reduced to a unit test with a
// mocked fs/ctx — the missing layer that FB-20260813-003 named ("0 次 deny
// 无法区分门没 armed").
//
// index.js imports the DSH peer deps (@deepseek-ai/dsh-llm and
// -subagent-in-process-driver), which resolve from ~/.dsh/profiles/node_modules.
// To run from this source tree, create a one-off symlink first:
//   ln -sfn "$HOME/.dsh/profiles/node_modules" node_modules && node --test test/wiring.test.js; rm -f node_modules
// Without that symlink the import fails and the tests below self-skip (not fail).
import assert from "node:assert";
import { test } from "node:test";

let apply;
let skipReason;
try {
  ({ apply } = await import("../lib/index.js"));
} catch (e) {
  skipReason = e.message;
}
const skip = skipReason ? { skip: "peer deps unresolved: " + skipReason } : {};

// ── minimal in-memory fs mock ──────────────────────────────────────────────
// Faithful to the REAL DSH fs contract: `resolve` returns a {targetKey,
// displayPath} OBJECT (not a string), and stat/readText/listDir consume that
// object. This is what makes the mock able to catch the "resolve result is an
// object, not a path string" class of bug (the gitDir/gitHead regression).
function makeFs(tree) {
  // tree: { "abs/path": "content" | null (dir) | ["entry", ...] }
  const keyOf = (t) => (typeof t === "string" ? t : t && t.targetKey);
  const resolve = (rel, opts) => {
    let path;
    if (rel.startsWith("/")) path = rel; // absolute passes through
    else {
      const base = opts && opts.cwd ? opts.cwd.replace(/\/$/, "") : "";
      path = base + "/" + rel;
    }
    return { targetKey: path, displayPath: path };
  };
  const stat = async (target) => {
    const k = keyOf(target);
    if (!(k in tree)) return undefined;
    return { type: Array.isArray(tree[k]) ? "directory" : "file", name: k.split("/").pop() };
  };
  const readText = async (target) => {
    const v = tree[keyOf(target)];
    if (typeof v === "string") return v;
    return undefined;
  };
  const listDir = async (dir) => {
    const k = keyOf(dir);
    const v = tree[k];
    if (!Array.isArray(v)) throw new Error("not a dir: " + k);
    return v.map((name) => ({ name, type: tree[k + "/" + name] === null || Array.isArray(tree[k + "/" + name]) ? "directory" : "file" }));
  };
  return { resolve, stat, readText, listDir };
}

// ── minimal ctx mock: capture handlers, provide services ──────────────────
// userQuestions (optional) is a function taking the ask payload and returning
// the human's answer; calls/asks/lastAsk record how many times the gate asked
// and with what, so the "consolidate to one popup" behavior is testable.
function makeCtx(fs, userQuestions) {
  const handlers = new Map(); // event -> [handler, ...]
  const calls = { asks: 0, lastAsk: undefined };
  const ctx = {
    get(name) {
      if (name === "fs") return fs;
      if (name === "subagents") return { registerProvider() {} };
      if (name === "approval") return undefined;
      if (name === "userQuestions") {
        return userQuestions
          ? {
              ask: async (payload) => {
                calls.asks += 1;
                calls.lastAsk = payload;
                return userQuestions(payload);
              },
            }
          : undefined;
      }
      if (name === "sessionQuery") return undefined;
      return undefined;
    },
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(handler);
    },
  };
  return { ctx, handlers, calls };
}

function makeExec({ name, command, file_path, sessionId, cwd, delegationDepth }) {
  return {
    name,
    arguments: command !== undefined ? { command } : { file_path, name: undefined },
    agent: {
      id: sessionId,
      session: { header: { cwd, delegationDepth: delegationDepth || 0 } },
    },
    signal: undefined,
  };
}

// A business repo: .git present, no preset/preset.yml, no flow marker, no init.
function businessRepoTree() {
  return {
    "/repo/.git": null,
    "/repo/src/index.ts": "// code",
  };
}

// A business repo fully ready to release: init'd, fresh flow marker, and a
// release credential bound to the current HEAD (independent review). This is
// what lets the action-gate reach the human-approval layer instead of denying
// earlier on a missing credential.
function releaseReadyTree(head) {
  const h = head || "a".repeat(40);
  return {
    "/repo/.git": null,
    "/repo/.git/HEAD": "ref: refs/heads/main",
    "/repo/.git/refs/heads/main": h,
    "/repo/ai-nseos/PROJECT_PROFILE.md": "Delivery mode: interactive",
    "/repo/ai-nseos/state/flow/s1.json": JSON.stringify({ session_id: "s1", started_at: new Date().toISOString(), mode: "x", contract: "x" }),
    "/repo/ai-nseos/state/.release-ready.json": JSON.stringify({ review: { head_sha: h, independent: true, note: "quality-reviewer: 测试绿 + 变异负控制转红" } }),
    "/repo/src/index.ts": "// code",
  };
}

// next() simulates "downstream allowed" — a gate that passes through returns
// next()'s value ({kind:"enter"}), a gate that denies returns {kind:"deny"}.
const enter = () => ({ kind: "enter" });

test("skill-gate denies a non-nseos skill in a business repo without flow marker", skip, async () => {
  const { ctx, handlers } = makeCtx(makeFs(businessRepoTree()));
  apply(ctx);
  const skillGate = handlers.get("tools/pre-execute").find((h) => h.length === 2);
  // skill-gate is the first tools/pre-execute handler; distinguish by behavior.
  const all = handlers.get("tools/pre-execute");
  // There are 4 handlers: skill-gate, action-gate, ledger-gate, doc-gate.
  assert.strictEqual(all.length, 4, "expected 4 tools/pre-execute handlers");
  // skill-gate is registered first (index.js order): it keys on exec.name === "skill"
  const result = await all[0](makeExec({ name: "skill", command: undefined, file_path: undefined, sessionId: "s1", cwd: "/repo" }), enter);
  // skill-gate: exec.arguments.name is undefined (we didn't set it) → passes through.
  // Set arguments.name properly via a custom exec.
  const execWithSkill = {
    name: "skill",
    arguments: { name: "some-other-skill" },
    agent: { id: "s1", session: { header: { cwd: "/repo", delegationDepth: 0 } } },
  };
  const denied = await all[0](execWithSkill, enter);
  assert.strictEqual(denied.kind, "deny", "non-nseos skill must be denied");
  assert.ok(denied.reason.includes("nseos-route-work"), "deny reason should route to flow");
});

test("skill-gate allows an nseos-* skill", skip, async () => {
  const { ctx, handlers } = makeCtx(makeFs(businessRepoTree()));
  apply(ctx);
  const all = handlers.get("tools/pre-execute");
  const exec = {
    name: "skill",
    arguments: { name: "nseos-route-work" },
    agent: { id: "s1", session: { header: { cwd: "/repo", delegationDepth: 0 } } },
  };
  const r = await all[0](exec, enter);
  assert.strictEqual(r.kind, "enter", "nseos skill must pass through");
});

test("action-gate: feature-branch push is NOT release-class (no deny), trunk push denies without flow", skip, async () => {
  const { ctx, handlers } = makeCtx(makeFs(businessRepoTree()));
  apply(ctx);
  const all = handlers.get("tools/pre-execute");
  // action-gate is the 2nd handler (index.js order: skill-gate then action-gate)
  const actionGate = all[1];
  // feature-branch push → not release-class → pass through
  const feature = await actionGate(makeExec({ name: "bash", command: "git push origin feature/foo", sessionId: "s1", cwd: "/repo" }), enter);
  assert.strictEqual(feature.kind, "enter", "feature-branch push must NOT be gated");
  // trunk push in a business repo without init/marker → deny (aggregated)
  const trunk = await actionGate(makeExec({ name: "bash", command: "git push origin main", sessionId: "s1", cwd: "/repo" }), enter);
  assert.strictEqual(trunk.kind, "deny", "trunk push without flow must be denied");
  assert.ok(trunk.reason.includes("flow marker"), "deny must name the missing flow marker");
});

test("action-gate: non-git directory release command passes through (nothing to push)", skip, async () => {
  const { ctx, handlers } = makeCtx(makeFs({ "/tmp/x": null }));
  apply(ctx);
  const actionGate = handlers.get("tools/pre-execute")[1];
  const r = await actionGate(makeExec({ name: "bash", command: "git push origin main", sessionId: "s1", cwd: "/tmp/x" }), enter);
  assert.strictEqual(r.kind, "enter", "non-git dir has nothing to push");
});

test("ledger-gate + doc-gate are wired (deny on product-code write without flow)", skip, async () => {
  const { ctx, handlers } = makeCtx(makeFs(businessRepoTree()));
  apply(ctx);
  const all = handlers.get("tools/pre-execute");
  const ledgerGate = all[2];
  const docGate = all[3];
  // writing a product-code file without flow marker: doc-gate's implementation-
  // boundary reminder fires only when flowEntered (active/stale) — with no
  // marker, flowEntered=false, so doc-gate passes through. ledger-gate only
  // fires on the 3rd distinct file. So a single write passes through both.
  const exec = makeExec({ name: "write", file_path: "/repo/src/index.ts", sessionId: "s1", cwd: "/repo" });
  const lr = await ledgerGate(exec, enter);
  assert.strictEqual(lr.kind, "enter", "1st write: ledger-gate not yet at 3 files");
  const dr = await docGate(exec, enter);
  assert.strictEqual(dr.kind, "enter", "no flow marker: doc-gate boundary reminder not armed");
});

test("ledger-gate: 3rd distinct product-code write without a ledger denies once", skip, async () => {
  const { ctx, handlers } = makeCtx(makeFs(businessRepoTree()));
  apply(ctx);
  const ledgerGate = handlers.get("tools/pre-execute")[2];
  const write = (fp) => makeExec({ name: "write", file_path: fp, sessionId: "s1", cwd: "/repo" });
  assert.strictEqual((await ledgerGate(write("/repo/src/a.ts"), enter)).kind, "enter", "1st file");
  assert.strictEqual((await ledgerGate(write("/repo/src/b.ts"), enter)).kind, "enter", "2nd file");
  const third = await ledgerGate(write("/repo/src/c.ts"), enter);
  assert.strictEqual(third.kind, "deny", "3rd file must trigger the ledger question");
  assert.ok(third.reason.includes("账本"), "deny reason must name the ledger question");
  // one-shot: a 4th write is not denied again (nudged latch)
  assert.strictEqual((await ledgerGate(write("/repo/src/d.ts"), enter)).kind, "enter", "4th file: one-shot");
});

test("doc-gate: glossary-armed-but-uncleared feature denies product-code write", skip, async () => {
  const tree = {
    ...businessRepoTree(),
    "/repo/docs/domain/GLOSSARY.md": "# Glossary",
    "/repo/ai-nseos/state/features": ["f1"],
    "/repo/ai-nseos/state/features/f1": [".gate-armed"],
    "/repo/ai-nseos/state/features/f1/.gate-armed": "",
  };
  const { ctx, handlers } = makeCtx(makeFs(tree));
  apply(ctx);
  const docGate = handlers.get("tools/pre-execute")[3];
  const exec = makeExec({ name: "write", file_path: "/repo/src/index.ts", sessionId: "s1", cwd: "/repo" });
  const r = await docGate(exec, enter);
  assert.strictEqual(r.kind, "deny", "glossary-armed uncleared feature must deny product code");
  assert.ok(r.reason.includes("术语"), "deny reason must name the glossary/term gate");
});

test("action-gate: prod-schema scan unknown (unreadable candidate) is fail-loud deny", skip, async () => {
  const now = new Date().toISOString();
  const tree = {
    "/repo/.git": null,
    "/repo/ai-nseos/PROJECT_PROFILE.md": "Delivery mode: interactive",
    "/repo/ai-nseos/state/flow/s1.json": JSON.stringify({ session_id: "s1", started_at: now, mode: "x", contract: "x" }),
    "/repo/package.json": ["unreadable"], // present but readText returns undefined → unknown
  };
  const { ctx, handlers } = makeCtx(makeFs(tree));
  apply(ctx);
  const actionGate = handlers.get("tools/pre-execute")[1];
  const exec = makeExec({ name: "bash", command: "git push origin main", sessionId: "s1", cwd: "/repo" });
  const r = await actionGate(exec, enter);
  assert.strictEqual(r.kind, "deny", "prod-schema unknown must be fail-loud deny, never a silent allow");
  assert.ok(r.reason.includes("prod-schema"), "deny reason must name the prod-schema unknown");
});

test("action-gate: gitBranch reads .git/HEAD → bare push on trunk is release (regression guard)", skip, async () => {
  // Regression guard for the gitDir object-vs-string bug: `fs.resolve` returns a
  // {targetKey, displayPath} OBJECT; gitDir must extract the string path before
  // concatenating "/HEAD". If it returns the object, gitBranch yields undefined,
  // a bare `git push` on main is NOT flagged, and the release slips through.
  const tree = {
    "/repo/.git": null,
    "/repo/.git/HEAD": "ref: refs/heads/main",
    "/repo/.git/refs/heads/main": "a".repeat(40),
    "/repo/ai-nseos/PROJECT_PROFILE.md": "Delivery mode: interactive",
    "/repo/src/index.ts": "// code",
  };
  const { ctx, handlers } = makeCtx(makeFs(tree));
  apply(ctx);
  const actionGate = handlers.get("tools/pre-execute")[1];
  const exec = makeExec({ name: "bash", command: "git push", sessionId: "s1", cwd: "/repo" });
  const r = await actionGate(exec, enter);
  assert.strictEqual(r.kind, "deny", "bare push on trunk must be release-class (gitBranch must resolve main)");
  assert.ok(/主干.*main|git push/.test(r.reason), "deny reason must name the trunk");
});

test("action-gate: release + deploy sequence asks the human ONCE (consolidated popup)", skip, async () => {
  const tree = releaseReadyTree();
  const answer = () => ({ answers: [{ id: "release-confirm", selected: ["同意"] }] });
  const { ctx, handlers, calls } = makeCtx(makeFs(tree), answer);
  apply(ctx);
  const actionGate = handlers.get("tools/pre-execute")[1];
  // 1) the release push: full credentials + human consent → allowed, one ask
  const push = await actionGate(makeExec({ name: "bash", command: "git push origin main", sessionId: "s1", cwd: "/repo" }), enter);
  assert.strictEqual(push.kind, "enter", "release push with credentials + consent must pass");
  assert.strictEqual(calls.asks, 1, "the first release command asks the human once");
  // 2) the deploy command in the SAME episode (same marker + HEAD) → no re-ask
  const deploy = await actionGate(makeExec({ name: "bash", command: "ssh deploy@prod 'deploy.sh'", sessionId: "s1", cwd: "/repo" }), enter);
  assert.strictEqual(deploy.kind, "enter", "the deploy command in the same episode must pass");
  assert.strictEqual(calls.asks, 1, "the deploy command must NOT re-ask — one popup per episode");
  // the popup explains intent → command → consequence
  const q = calls.lastAsk.questions[0];
  assert.strictEqual(q.header, "发布/部署确认");
  assert.ok(q.question.includes("要做什么"), "popup must state the intent");
  assert.ok(q.question.includes("git push origin main"), "popup must show the actual command");
  assert.ok(q.question.includes("所以要执行"), "popup must state the action (命令)");
  assert.ok(q.question.includes("后果"), "popup must state the consequence");
});

test("action-gate: a refreshed flow marker is a NEW episode and re-asks", skip, async () => {
  const tree = releaseReadyTree();
  const answer = () => ({ answers: [{ id: "release-confirm", selected: ["同意"] }] });
  const { ctx, handlers, calls } = makeCtx(makeFs(tree), answer);
  apply(ctx);
  const actionGate = handlers.get("tools/pre-execute")[1];
  await actionGate(makeExec({ name: "bash", command: "git push origin main", sessionId: "s1", cwd: "/repo" }), enter);
  assert.strictEqual(calls.asks, 1);
  // refresh the flow marker (new started_at) → new episode → must re-ask
  tree["/repo/ai-nseos/state/flow/s1.json"] = JSON.stringify({ session_id: "s1", started_at: new Date(Date.now() + 1000).toISOString(), mode: "x", contract: "x" });
  const again = await actionGate(makeExec({ name: "bash", command: "git push origin main", sessionId: "s1", cwd: "/repo" }), enter);
  assert.strictEqual(again.kind, "enter");
  assert.strictEqual(calls.asks, 2, "a refreshed flow marker (new episode) must re-ask, not a blanket session grant");
});
