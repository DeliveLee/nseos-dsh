// Negative-control tests for the flow-marker predicate + gate helpers.
// Each assertion proves the predicate DOES reject the bad shapes (a green test
// only counts after a relevant fault can make it red).
import assert from "node:assert";
import { test } from "node:test";
import { DONE_CLAIM_PATTERNS, RELEASE_PATTERNS, evaluateMarker, isNseosSkill, releaseGaps, slug } from "../lib/core.js";

const SID = "sess-abc123";
const NOW = 1_800_000_000_000; // fixed epoch for determinism
const fresh = (startedAt, sid = SID) => JSON.stringify({ session_id: sid, started_at: startedAt, mode: "plan-feature", contract: "x" });

test("absent: no marker file", () => {
  const v = evaluateMarker(undefined, SID, NOW);
  assert.strictEqual(v.status, "absent");
});

test("unattributable: empty marker", () => {
  assert.strictEqual(evaluateMarker("", SID, NOW).status, "unattributable");
  assert.strictEqual(evaluateMarker("   \n  ", SID, NOW).status, "unattributable");
});

test("unattributable: unparseable JSON", () => {
  assert.strictEqual(evaluateMarker("not json {", SID, NOW).status, "unattributable");
});

test("unattributable: not a JSON object", () => {
  assert.strictEqual(evaluateMarker("[1,2,3]", SID, NOW).status, "unattributable");
  assert.strictEqual(evaluateMarker("42", SID, NOW).status, "unattributable");
  assert.strictEqual(evaluateMarker("null", SID, NOW).status, "unattributable");
});

test("unattributable: missing or empty session_id", () => {
  assert.strictEqual(evaluateMarker("{}", SID, NOW).status, "unattributable");
  assert.strictEqual(evaluateMarker(JSON.stringify({ session_id: "" }), SID, NOW).status, "unattributable");
});

test("unattributable: belongs to another session", () => {
  assert.strictEqual(evaluateMarker(fresh(new Date(NOW).toISOString()), "other-sess", NOW).status, "unattributable");
});

test("unattributable: unparseable started_at", () => {
  assert.strictEqual(evaluateMarker(JSON.stringify({ session_id: SID, started_at: "not-a-date" }), SID, NOW).status, "unattributable");
});

test("stale: marker older than the 4h window", () => {
  const old = new Date(NOW - 5 * 3600 * 1000).toISOString();
  const v = evaluateMarker(fresh(old), SID, NOW);
  assert.strictEqual(v.status, "stale");
});

test("active: fresh marker attributed to this session (and exactly at the window edge is active)", () => {
  const justNow = new Date(NOW).toISOString();
  assert.strictEqual(evaluateMarker(fresh(justNow), SID, NOW).status, "active");
  const edge = new Date(NOW - 4 * 3600 * 1000).toISOString();
  assert.strictEqual(evaluateMarker(fresh(edge), SID, NOW).status, "active");
});

test("slug sanitizes path-hostile ids", () => {
  assert.strictEqual(slug("a/b\\c:d"), "a_b_c_d");
  assert.strictEqual(slug("../x"), ".._x");
});

test("isNseosSkill matches only the nseos- prefix", () => {
  assert.strictEqual(isNseosSkill("nseos-route-work"), true);
  assert.strictEqual(isNseosSkill("nseos"), false);
  assert.strictEqual(isNseosSkill("requirements-discovery"), false);
  assert.strictEqual(isNseosSkill(undefined), false);
});

test("release patterns are conservative (release-class yes, feature-branch no)", () => {
  assert.strictEqual(RELEASE_PATTERNS.some((re) => re.test("git push origin main")), true);
  assert.strictEqual(RELEASE_PATTERNS.some((re) => re.test("gh pr merge 42")), true);
  assert.strictEqual(RELEASE_PATTERNS.some((re) => re.test("git commit -m x")), false);
  assert.strictEqual(RELEASE_PATTERNS.some((re) => re.test("npm test")), false);
});

test("releaseGaps aggregates every unmet item", () => {
  assert.deepStrictEqual(releaseGaps({ initd: false, flowActive: false }).length, 2);
  assert.deepStrictEqual(releaseGaps({ initd: true, flowActive: true }), []);
});

test("done-claim patterns match claims, not ordinary closes", () => {
  assert.strictEqual(DONE_CLAIM_PATTERNS.some((re) => re.test("没有可自主推进的活了")), true);
  assert.strictEqual(DONE_CLAIM_PATTERNS.some((re) => re.test("都做完了")), true);
  assert.strictEqual(DONE_CLAIM_PATTERNS.some((re) => re.test("no work remains")), true);
  assert.strictEqual(DONE_CLAIM_PATTERNS.some((re) => re.test("S6-E2 已完成")), false);
});
