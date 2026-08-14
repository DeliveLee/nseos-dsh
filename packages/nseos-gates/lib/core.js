// Pure, testable core of @deliveli/nseos-gates — no fs, no ctx, no side effects.
// index.js wires these into the runtime; tests import them directly.

export const NSEOS_PREFIX = "nseos-";
export const WINDOW_HOURS = 4;

// Release-class bash: trunk push / merge / release actions. Deliberately
// conservative — never blocks feature-branch or local work.
export const RELEASE_PATTERNS = [
  /\bgit\s+push\b/,
  /\bgh\s+pr\s+merge\b/,
  /\bgh\s+workflow\s+run\b/,
  /\bgh\s+release\s+create\b/,
  /\bgit\s+tag\b/,
];

// Production-remote / deployment commands. The action-gate treats these like
// release-class: in a business repo without a fresh flow marker they are
// denied. This closes the gap where a session could deploy via ssh/scp/rsync/
// kubectl while only git push/tag were gated (business-repo session FB-20260814-002).
// `ssh`/`scp`/`rsync` require a following space, so ssh-keygen/ssh-add/
// ssh-copy-id are not caught.
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
// means self-review, which Claude surfaces as a one-time "ask" so self-review
// is never silently packaged as independent (askIndependent).
export function releaseCredentialCheck(credential, { currentHead, docAdopted, prodSchemaFinding }) {
  const gaps = [];
  if (currentHead === undefined) {
    gaps.push("无法确定当前 git HEAD,无法校验 release 凭据的 head_sha 绑定");
  }
  if (credential === undefined || credential === null || typeof credential !== "object" || Array.isArray(credential)) {
    gaps.push("缺 release 凭据(ai-nseos/state/.release-ready.json,含 review/doc/prod_schema)");
    return { gaps, askIndependent: false };
  }
  const review = credential.review;
  if (review === undefined || review === null) {
    gaps.push("缺独立评审凭据(review: 谁审/结论/head_sha/independent)");
  } else {
    if (typeof review.head_sha !== "string" || review.head_sha.trim() === "") gaps.push("review 缺 head_sha(凭据必须绑定代码)");
    else if (currentHead !== undefined && review.head_sha.trim().toLowerCase() !== currentHead) gaps.push("review 的 head_sha 与当前 HEAD 不符(证据已过期,需重评)");
    if (review.independent === undefined) gaps.push("review 缺 independent 字段(自审 false / 独立 true 必须写明)");
  }
  if (docAdopted) {
    const doc = credential.doc;
    if (doc === undefined || doc === null) gaps.push("缺文档维护凭据(doc)");
    else if (typeof doc.head_sha !== "string" || doc.head_sha.trim() === "") gaps.push("doc 缺 head_sha");
    else if (currentHead !== undefined && doc.head_sha.trim().toLowerCase() !== currentHead) gaps.push("doc 的 head_sha 与当前 HEAD 不符");
  }
  if (prodSchemaFinding) {
    const ps = credential.prod_schema;
    if (ps === undefined || ps === null) gaps.push("缺 prod_schema 凭据(扫描到 ORM 自动迁移风险,需先与人类确认)");
    else if (typeof ps.head_sha !== "string" || ps.head_sha.trim() === "") gaps.push("prod_schema 缺 head_sha");
    else if (currentHead !== undefined && ps.head_sha.trim().toLowerCase() !== currentHead) gaps.push("prod_schema 的 head_sha 与当前 HEAD 不符");
  }
  const askIndependent = gaps.length === 0 && review !== undefined && review !== null && review.independent === false;
  return { gaps, askIndependent };
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
