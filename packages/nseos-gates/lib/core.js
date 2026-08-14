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

// Closing text that claims global completion.
export const DONE_CLAIM_PATTERNS = [
  /(?:没有|无)(?:可自主推进|剩余|要做的)(?:的)?(?:活|工作|任务)/,
  /(?:都|全部|已经)(?:做|完成)完了/,
  /no work remains/i,
  /\b(?:all done|everything is done)\b/i,
];

export function slug(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

export function isNseosSkill(name) {
  return typeof name === "string" && name.startsWith(NSEOS_PREFIX);
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
