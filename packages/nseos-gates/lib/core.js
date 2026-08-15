// Pure, testable core of @deliveli/nseos-gates — no fs, no ctx, no side effects.
// index.js wires these into the runtime; tests import them directly.

export const NSEOS_PREFIX = "nseos-";
export const WINDOW_HOURS = 4;

// ── Release/deploy classification (ported from Claude's _release_class) ──
// Claude's action-gate distinguishes trunk pushes, multi-ref pushes, version
// tags, deploy-shaped workflow runs, and prod-target docker compose from
// ordinary feature-branch/local work. A feature-branch `git push` is NOT
// release-class; a bare/trunk push, `--mirror/--all/--tags/--follow-tags`, a
// version-tag push, and deploy/prod commands ARE. A false deny is expensive
// (it trains the user to disable the gate); a false allow on a real release is
// a production incident — so the split matters and must be precise, not a bare
// `\bgit\s+push\b` (which both over-blocks feature branches and under-blocks
// multi-ref/tag pushes).

export const TRUNK_BRANCHES = new Set(["main", "master", "production"]);
export const PUSH_MULTIREF_FLAGS = new Set(["--mirror", "--all", "--tags", "--follow-tags"]);
// A version-TAG refspec must be `v`-prefixed. Unprefixed `2.0` / `2.0-hotfix`
// are far more often BRANCH names than tags; flagging them trains the user to
// disable the gate (Claude's own "not crying wolf" rule). Unprefixed tags are
// still caught by TAG_REFSPEC / `--tags` / `git tag` below.
const VERSION_TAG = /^v\d+(?:\.\d+)+([-.+][0-9A-Za-z.-]+)?$/;
const TAG_REFSPEC = /^refs\/tags\//;
const DEPLOYISH_WORKFLOW = /(?:deploy|release|publish|ship-it|promote|prod|^cd\b|[-_.]cd\b)/i;
const PRODISH = /(?:prod|production|staging|release)/i;
const COMPOSE_PROD_FLAGS = new Set(["-f", "--file", "--profile", "--context", "--env-file"]);

// Flags whose NEXT token is a value (not a positional). Skipped so
// `git -C /tmp/x push` reads the subcommand "push", not "/tmp/x".
const GIT_VALUE_FLAGS = new Set([
  "-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path",
  "--super-prefix", "-o", "--push-option", "--repo", "--receive-pack", "--exec",
]);
const GH_VALUE_FLAGS = new Set(["-R", "--repo", "-b", "--body", "-t", "--title", "-F", "--body-file"]);

// Split a command into tokens, honoring single/double quotes and backslash.
function tokenize(cmd) {
  const out = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === "\\" && i + 1 < cmd.length) {
      cur += cmd[++i];
    } else if (/\s/.test(ch)) {
      if (cur) { out.push(cur); cur = ""; }
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// Drop leading env assignments (VAR=value) and the program name itself.
function programArgs(tokens) {
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
  if (i < tokens.length) i++; // the program name
  return tokens.slice(i);
}

// Non-flag args, with value-taking flags consuming their value. Handles both
// `--flag value` and `--flag=value`; a non-value flag (e.g. `--delete`, `-f`,
// `-u`) is skipped WITHOUT consuming the next token. Faithful port of Claude's
// `_positional`.
function positional(tokens, valueFlags) {
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.startsWith("-")) {
      if (t.includes("=")) i += 1;        // --flag=value
      else if (valueFlags.has(t)) i += 2; // --flag value
      else i += 1;
      continue;
    }
    out.push(t);
    i += 1;
  }
  return out;
}

// Refspec destination branch names (remote arg dropped, HEAD resolved, force
// `+` and refs/heads/ stripped). Faithful port of Claude's `_push_targets`.
function pushTargets(positionalAfterPush, head) {
  const refs = positionalAfterPush.slice(1); // first positional is the remote
  const out = [];
  for (let tok of refs) {
    if (tok.startsWith("+")) tok = tok.slice(1);
    let dest = tok.includes(":") ? tok.split(":").pop() : tok;
    if (dest.startsWith("refs/heads/")) dest = dest.slice("refs/heads/".length);
    if (dest === "HEAD") dest = head || "";
    if (dest) out.push(dest);
  }
  return out;
}

// Raw destination refs WITHOUT refs/heads stripping or HEAD resolution — tag
// detection needs to see `refs/tags/...` intact. Port of Claude's `_push_refs`.
function pushRefs(positionalAfterPush) {
  const out = [];
  for (let tok of positionalAfterPush.slice(1)) {
    if (tok.startsWith("+")) tok = tok.slice(1);
    const dest = tok.includes(":") ? tok.split(":").pop() : tok;
    if (dest) out.push(dest);
  }
  return out;
}

function classifyGit(args, head) {
  const pos = positional(args, GIT_VALUE_FLAGS);
  if (!pos.length) return undefined;
  const sub = pos[0];
  if (sub === "push") {
    for (const flag of PUSH_MULTIREF_FLAGS) {
      if (args.includes(flag)) return "git push 多 ref(" + flag + ")";
    }
    const targets = pushTargets(pos.slice(1), head);
    const trunk = targets.find((t) => TRUNK_BRANCHES.has(t));
    if (trunk) return "git push 到主干 " + trunk;
    const tags = pushRefs(pos.slice(1)).filter((t) => TAG_REFSPEC.test(t) || VERSION_TAG.test(t));
    if (tags.length) return "git push 标签 " + tags[0];
    // Bare push (no refspec): release only when the CURRENT branch is trunk.
    if (targets.length === 0 && head && TRUNK_BRANCHES.has(head)) {
      return "在主干 " + head + " 上 git push(裸推送)";
    }
    return undefined;
  }
  // `git merge` is a release only when the CURRENT branch is trunk (merging a
  // feature INTO trunk); `git merge main` on a feature branch is a sync, not a
  // release. `git tag` alone is NOT flagged — only the tag PUSH is (via
  // --tags / `push v1.2.3` / refs/tags/ above).
  if (sub === "merge" && head && TRUNK_BRANCHES.has(head)) {
    return "在主干 " + head + " 上 git merge";
  }
  return undefined;
}

function classifyGh(args) {
  const pos = positional(args, GH_VALUE_FLAGS);
  if (pos[0] === "pr" && pos[1] === "merge") return "gh pr merge(合并 PR)";
  if (pos[0] === "workflow" && pos[1] === "run") {
    const name = pos[2] || "";
    if (!name) return "gh workflow run(未指定 workflow,保守按发布处理)";
    return DEPLOYISH_WORKFLOW.test(name) ? "gh workflow run 部署型流水线 " + name : undefined;
  }
  if (pos[0] === "release" && pos[1] === "create") return "gh release create(发版)";
  return undefined;
}

function classifyCompose(args) {
  // docker compose up/down with a prod signal in a FILE/PROFILE/CONTEXT/ENV
  // flag value (e.g. `-f docker-compose.prod.yml`) is a production deploy.
  // Deliberately NOT flagging a bare token like `production-backend` — that is
  // usually a SERVICE name, not a prod target (Claude's COMPOSE_PROD_FLAGS).
  const hasProdFlag = args.some((a, idx) =>
    (COMPOSE_PROD_FLAGS.has(a) && idx + 1 < args.length && PRODISH.test(args[idx + 1]))
  );
  return hasProdFlag ? "docker compose 指向生产(prod 信号)" : undefined;
}

// Split a command on shell separators (&& || ; | newline), honoring quotes, so
// `git status && git push origin main` still classifies the trailing release
// segment (the gate runs before execution and cannot know which segment wins).
function splitSegments(cmd) {
  const segs = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
    } else if (ch === "\\" && i + 1 < cmd.length) {
      cur += ch + cmd[++i];
    } else if ((ch === "&" && cmd[i + 1] === "&") || (ch === "|" && cmd[i + 1] === "|")) {
      if (cur.trim()) segs.push(cur.trim());
      cur = "";
      i++; // consume the second separator char
    } else if (ch === ";" || ch === "|" || ch === "\n") {
      if (cur.trim()) segs.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) segs.push(cur.trim());
  return segs;
}

// Returns a human-readable reason when the bash command is release/deploy
// class, or undefined when it is ordinary feature-branch/local work.
// `head` is the CURRENT branch name (from .git/HEAD); it is what makes the
// classifier "branch-aware" — `git merge feature/x` is a release only when
// head is trunk, and a bare `git push` is a release only on trunk.
export function classifyReleaseBash(cmd, head) {
  if (typeof cmd !== "string" || cmd.trim() === "") return undefined;
  for (const seg of splitSegments(cmd)) {
    const tokens = tokenize(seg);
    const prog = tokens.find((t) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(t));
    if (!prog) continue;
    const base = prog.split("/").pop();
    const args = programArgs(tokens);
    let reason;
    if (base === "git") reason = classifyGit(args, head);
    else if (base === "gh") reason = classifyGh(args);
    else if (base === "docker" || base === "docker-compose" || /docker-compose$/.test(base)) reason = classifyCompose(args);
    if (reason !== undefined) return reason;
  }
  return undefined;
}

// Production-remote / deployment commands. These are deploy-class regardless
// of repo: in a business repo without a fresh flow marker they are denied.
// This closes the gap where a session could deploy via ssh/scp/rsync/kubectl
// while only git push/tag were gated (business-repo session FB-20260814-002). `ssh`/
// `scp`/`rsync` require a following space, so ssh-keygen/ssh-add/ssh-copy-id
// are not caught.
export const DEPLOY_PATTERNS = [
  /\bssh\s+/,
  /\bscp\s+/,
  /\brsync\s+/,
  /\bkubectl\s+/,
];

// Closing text that declares completion — deliberately BROAD. The progress-gate
// is an advisory "report a number" steer: a false positive costs one extra
// nudge while a false negative is the drift itself (FB-20260805-001/004 — "坏
// 说法的尾巴没有尽头"). So batch/item completion ("本批次完成", "第3步做完了")
// is caught as eagerly as global completion — treating a batch as the whole
// goal is exactly the failure this exists to catch. The only shapes excluded
// are questions (a speech-act error, handled by isDoneClaim) and quota/space
// wording ("没有剩余空间"), which are not completion claims.
export const DONE_CLAIM_PATTERNS = [
  // no-work-remains, completion words, noun optional
  /(?:没有|无|没了|不再有|没)\s*(?:可自主推进|可推进|待办|未完成|未了|要做的|pending)(?:的)?(?:活|工作|任务|事项|事情)?/i,
  // "没/无活 + 可推进/可做/可干/了" — the project's own anti-drift wording
  /(?:没|无)活(?:可推进|可做|可干|了)?/,
  // 剩余 requires a completion noun so quota words (剩余空间/名额/时间) don't fire
  /(?:没有|无|没了)\s*剩余(?:的)?(?:活|工作|任务|事项|事情)/,
  // global/batch subject + completion verb (the subject carries the "global" sense)
  /(?:全部|所有|都|整体|已经|至此|这一棒|这批|本批|本批次|本阶段|本轮)(?:完成|做完|搞定|收口|收尾|收官|结束|收工|完工)/,
  // bare completion-sense verb, optional 了/完/好 suffix
  /(?:完成|结束|收工|完工|搞定|收口|收尾|收官)(?:了|完|好|定)?/,
  // "做/改/写/修/整 + 完" — 做完了 (claim) vs 做了 (partial)
  /(?:做|改|写|修|整)完/,
  // English
  /\b(?:all done|all finished|everything(?:'s| is) done|all tasks? (?:complete|done)|no (?:work|tasks?|items?|pending) (?:remains?|left)|nothing left to do)\b/i,
];

// Reports of INCOMPLETE work must never be labeled a completion claim.
// "未完成" / "没做完" / "还没做完" / "尚未收口" / "还剩 2 步未完成" are the
// opposite of "做完了"; firing the steer on them is a speech-act error, worse
// than a false negative. Known tradeoff: a double negation like "没有未完成的
// 事项了" is a completion claim but is skipped here — rare phrasing, and the
// cost is one missed nudge, not a wrong accusation.
const NEGATED_COMPLETION = /(?:未|没|不|还没|尚未|仍未|还未)(?:做|完成|做完|搞定|收口|收尾|收官|结束|收工|完工)/;

// A completion DECLARATION, not a question and not a report of incomplete work.
export function isDoneClaim(text) {
  if (typeof text !== "string" || text.trim() === "") return false;
  const t = text.trim();
  if (/[吗？?]\s*$/.test(t)) return false; // a question is not a claim
  if (NEGATED_COMPLETION.test(t)) return false; // incomplete, not done
  return DONE_CLAIM_PATTERNS.some((re) => re.test(t));
}

export function slug(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

export function isNseosSkill(name) {
  return typeof name === "string" && name.startsWith(NSEOS_PREFIX);
}

// Whether a marker status means "this session has entered a flow". Both
// "active" AND "stale" count: a stale marker is a long-running session whose 4h
// window expired — exactly when the implementation-boundary reminder must NOT
// go silent (FB-20260805-003). Only "absent"/"unattributable" mean "never
// entered". This keeps the reminder's polarity consistent with skill/action
// gates (which fail closed on stale).
export function enteredFlow(status) {
  return status === "active" || status === "stale";
}

// A path counts as "product code" for the doc-gate and ledger-gate when it is
// NOT a doc/config file. One shared predicate so both gates draw the same line
// instead of drifting apart. Extensionless boilerplate/config (Dockerfile,
// Makefile, .env, .gitignore, LICENSE, …) is explicitly NOT product code so a
// session touching three of those does not trip the 3-file ledger-gate.
const NON_PRODUCT_BASENAME = /^(?:Dockerfile(?:[.\-].*)?|Jenkinsfile|Makefile|Procfile|LICENSE|LICENCE|NOTICE|CHANGELOG|README|\..*)$/i;

export function isProductCodePath(fp) {
  if (typeof fp !== "string") return false;
  if (/\.(md|json|ya?ml|toml|lock)$/i.test(fp)) return false;
  const base = fp.split("/").pop() || "";
  if (NON_PRODUCT_BASENAME.test(base)) return false;
  return true;
}

// Bookkeeping under ai-nseos/ (flow markers, .impl-boundary-ack, .gate-armed,
// ambiguity-cleared, state files) is never "product code" for the gates. Writing
// these must NOT be denied, otherwise the ack/marker files that CLEAR a gate
// could themselves never be written (a deadlock: "write an ack to proceed",
// and writing the ack is denied).
export function isBookkeepingPath(fp) {
  return typeof fp === "string" && /^ai-nseos\//.test(fp);
}

// The single shared marker predicate. Pure: takes the raw marker text, the
// session id to attribute against, and the current time (ms). Returns
// { status: 'absent'|'unattributable'|'stale'|'active', reason }.
export function evaluateMarker(text, sessionId, now = Date.now()) {
  if (text === undefined) return { status: "absent", reason: "no marker file" };
  if (text.trim() === "") return { status: "unattributable", reason: "empty marker" };
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { status: "unattributable", reason: "unparseable JSON" };
  }
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return { status: "unattributable", reason: "not a JSON object" };
  }
  if (typeof obj.session_id !== "string" || obj.session_id === "") {
    return { status: "unattributable", reason: "missing or empty session_id" };
  }
  if (obj.session_id !== sessionId) {
    return { status: "unattributable", reason: "marker belongs to another session" };
  }
  const t = Date.parse(obj.started_at);
  if (Number.isNaN(t)) return { status: "unattributable", reason: "unparseable started_at" };
  if (now - t > WINDOW_HOURS * 3600 * 1000) {
    return { status: "stale", reason: "marker older than " + WINDOW_HOURS + "h window" };
  }
  return { status: "active", reason: "fresh marker attributed to this session" };
}

// Release readiness: which of init / flow-marker / prod-schema are unmet.
// Returns a list of unmet-item labels for the single aggregated deny.
export function releaseGaps({ initd, flowActive, prodSchema }) {
  const gaps = [];
  if (!initd) gaps.push("仓库未 init(缺 ai-nseos/PROJECT_PROFILE.md)");
  if (!flowActive) gaps.push("本会话无新鲜 flow marker");
  if (prodSchema !== undefined && prodSchema !== null) gaps.push(prodSchema);
  return gaps;
}

// Evaluate the release credential (ai-nseos/state/.release-ready.json) against
// the current HEAD and repo state. Faithful port of the Claude release-cred
// gate (RELEASE.md): review/doc/prod_schema each bind to head_sha; missing
// evidence or a moved HEAD is a gap. `independent:false` is NOT a gap — it
// means self-review. It is surfaced as a DENY (selfReview), never a silent pass
// and never an "ask": DSH's `never` approval policy turns "ask" into a
// reason-less "用户拒绝了 bash", which hides WHY the release was blocked and
// wedges the model (it cannot see "派独立评审 → independent=true 就解锁").
export function releaseCredentialCheck(credential, { currentHead, docAdopted, prodSchemaFinding }) {
  const gaps = [];
  if (currentHead === undefined) {
    gaps.push("无法确定当前 git HEAD,无法校验 release 凭据的 head_sha 绑定");
  }
  if (credential === undefined || credential === null || typeof credential !== "object" || Array.isArray(credential)) {
    gaps.push("缺 release 凭据(ai-nseos/state/.release-ready.json,含 review/doc/prod_schema)");
    return { gaps, selfReview: false };
  }
  const review = credential.review;
  if (review === undefined || review === null) {
    gaps.push("缺独立评审凭据(review: 谁审/结论/head_sha/independent)");
  } else {
    if (typeof review.head_sha !== "string" || review.head_sha.trim() === "") gaps.push("review 缺 head_sha(凭据必须绑定代码)");
    else if (currentHead !== undefined && review.head_sha.trim().toLowerCase() !== currentHead) gaps.push("review 的 head_sha 与当前 HEAD 不符(证据已过期,需重评)");
    if (review.independent === undefined) gaps.push("review 缺 independent 字段(自审 false / 独立 true 必须写明)");
    // 必答(MISSING_TEST_EVIDENCE): review.note must state test-green + negative
    // control. This is a "did you at least say it" check, NOT a "is it true"
    // check — the truth is the independent reviewer's job, not the gate's.
    const note = typeof review.note === "string" ? review.note : "";
    if (!/(?:测试|test|负控制|negative\s*control|变异|mutation)/i.test(note)) {
      gaps.push("review.note 缺测试绿 + 关键负控制证据(必答:写明测试怎么绿的、哪个负控制/变异让它转红过)");
    }
  }
  if (docAdopted === undefined) {
    // "couldn't tell" is never "clean": a doc-adopted check that errors must
    // not silently drop the doc credential requirement.
    gaps.push("无法确定仓库是否 doc-adopted(docs/domain 检测出错),按 fail-loud 处理");
  } else if (docAdopted) {
    const doc = credential.doc;
    if (doc === undefined || doc === null) gaps.push("缺文档维护凭据(doc)");
    else if (typeof doc.head_sha !== "string" || doc.head_sha.trim() === "") gaps.push("doc 缺 head_sha");
    else if (currentHead !== undefined && doc.head_sha.trim().toLowerCase() !== currentHead) gaps.push("doc 的 head_sha 与当前 HEAD 不符");
  }
  if (prodSchemaFinding) {
    const detail = typeof prodSchemaFinding === "string" ? prodSchemaFinding : "扫描到 ORM 自动迁移风险";
    const ps = credential.prod_schema;
    if (ps === undefined || ps === null) gaps.push("缺 prod_schema 凭据(" + detail + "),先走 prod-schema 五步并与人类确认、再把确认写进凭据");
    else if (typeof ps.head_sha !== "string" || ps.head_sha.trim() === "") gaps.push("prod_schema 缺 head_sha");
    else if (currentHead !== undefined && ps.head_sha.trim().toLowerCase() !== currentHead) gaps.push("prod_schema 的 head_sha 与当前 HEAD 不符");
  }
  const selfReview = gaps.length === 0 && review !== undefined && review !== null && review.independent === false;
  return { gaps, selfReview };
}

// The release/deploy gate's human-approval decision for the approval.request()
// FALLBACK path — used only when the userQuestions service is unavailable.
// 'allowed-once' is the ONLY grant; every other outcome denies with a reason
// that tells the model exactly what to do next. Pure so the table is
// unit-tested without a runtime. The approval service is a channel the model
// cannot self-mint, BUT it is gated by the session approval policy: under
// 'never' it auto-rejects (no human reachable). That is exactly the wedge
// FB-20260815-001 reported, so the PRIMARY path now asks through
// userQuestions.ask() (releaseConsentGranted below) which is NOT policy-gated.
export function releaseApprovalDenyReason(outcome) {
  switch (outcome) {
    case "allowed-once": return undefined;
    case "rejected": return "发布/部署未获人类批准,未执行任何发布/部署。对话里打字说「允许/同意」不算授权:本门禁只认审批弹窗的真实点击(这是防止模型自说自话替你授权的硬边界),不要靠复述对话里的同意去重试。请把下面这段一字不改放进你给人类的下一条消息,不要转述、不要改写:\n「这次发布/部署被拦下了。最常见的原因:你把这个会话的审批策略设成了 never(审批弹窗被关),我这边弹不出授权窗口。要让这次发布真正执行:请把本会话的审批策略改回 ask(在界面里重新打开审批弹窗),改好后告诉我,我重试时你会看到弹窗、在弹窗里点允许即可。如果你刚才是主动点了拒绝,请直接告诉我,我尊重你的决定、不再重试。」";
    case "cancelled": return "发布/部署的人类确认被取消,未执行任何发布/部署。";
    default: return "发布/部署的人类确认不可用(" + outcome + "),按 fail-closed 拦截,未执行任何发布/部署。";
  }
}

// Pure predicate: did the human grant the release/deploy confirmation? The gate
// asks through userQuestions.ask() (NOT approval.request()) so a definite human
// answer is required even under approval=never / full-access sandbox
// (FB-20260815-001). Only the explicit "同意" option grants; a missing item, an
// empty selection, custom free-text, or the "拒绝" option all deny. Pure so the
// answer table is unit-tested without a runtime.
export function releaseConsentGranted(answer) {
  if (answer === undefined || answer === null || !Array.isArray(answer.answers)) return false;
  const item = answer.answers.find((a) => a !== undefined && a !== null && a.id === "release-confirm");
  return item !== undefined && Array.isArray(item.selected) && item.selected.includes("同意");
}

// ORM auto-sync markers that can silently alter a production schema. A release
// must fail loud on these (a security check where "couldn't see" is never
// "clean"). Bounded candidate set, checked in index.js.
export const PROD_SCHEMA_PATTERNS = [
  /synchronize\s*:\s*true/i, // TypeORM
  /AUTO_MIGRATE\s*=\s*(?:1|true|on)/i, // Django / env
  /\bprisma\s+db\s+push\b/i, // Prisma migrate-in-place
];

export const PROD_SCHEMA_CANDIDATES = [
  "package.json",
  ".env",
  ".env.production",
  ".env.local",
  "prisma/schema.prisma",
  "ormconfig.json",
  "ormconfig.ts",
  "typeorm.config.ts",
  "src/data-source.ts",
  "src/database/data-source.ts",
  "server/src/data-source.ts",
  "config/database.ts",
];
