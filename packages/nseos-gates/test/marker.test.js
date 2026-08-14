// Negative-control tests for the flow-marker predicate + gate helpers.
// Each assertion proves the predicate DOES reject the bad shapes (a green test
// only counts after a relevant fault can make it red).
import assert from "node:assert";
import { test } from "node:test";
import { DONE_CLAIM_PATTERNS, DEPLOY_PATTERNS, PROD_SCHEMA_PATTERNS, RELEASE_PATTERNS, enteredFlow, evaluateMarker, isBookkeepingPath, isDoneClaim, isNseosSkill, isProductCodePath, releaseCredentialCheck, releaseGaps, slug } from "../lib/core.js";

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

test("deploy patterns catch remote/production commands, not local key tools", () => {
  // The business-repo deployment used exactly these (FB-20260814-002).
  assert.strictEqual(DEPLOY_PATTERNS.some((re) => re.test("ssh mp 'sudo bash -s'")), true);
  assert.strictEqual(DEPLOY_PATTERNS.some((re) => re.test("ssh -o BatchMode=yes delivelee.xyz 'bash -s'")), true);
  assert.strictEqual(DEPLOY_PATTERNS.some((re) => re.test("scp file.txt mp:/tmp/")), true);
  assert.strictEqual(DEPLOY_PATTERNS.some((re) => re.test("rsync -avz ./dist mp:/var/www")), true);
  assert.strictEqual(DEPLOY_PATTERNS.some((re) => re.test("kubectl apply -f deploy.yaml")), true);
  // ssh key-management tools are NOT remote-shell deployment.
  assert.strictEqual(DEPLOY_PATTERNS.some((re) => re.test("ssh-keygen -t ed25519")), false);
  assert.strictEqual(DEPLOY_PATTERNS.some((re) => re.test("ssh-add ~/.ssh/id_ed25519")), false);
  assert.strictEqual(DEPLOY_PATTERNS.some((re) => re.test("ssh-copy-id mp")), false);
});

test("releaseGaps aggregates every unmet item", () => {
  assert.deepStrictEqual(releaseGaps({ initd: false, flowActive: false }).length, 2);
  assert.deepStrictEqual(releaseGaps({ initd: true, flowActive: true }), []);
  assert.deepStrictEqual(releaseGaps({ initd: true, flowActive: true, prodSchema: "ORM 风险" }), ["ORM 风险"]);
});

test("releaseCredentialCheck: complete independent review passes, self-review asks", () => {
  const head = "a".repeat(40);
  const ok = { review: { head_sha: head, independent: true, note: "quality-reviewer" } };
  assert.deepStrictEqual(releaseCredentialCheck(ok, { currentHead: head, docAdopted: false, prodSchemaFinding: false }), { gaps: [], askIndependent: false });
  // Self-review (independent:false) is clean-but-ask, never silently packaged as independent.
  const self = { review: { head_sha: head, independent: false, note: "orchestrator" } };
  assert.deepStrictEqual(releaseCredentialCheck(self, { currentHead: head, docAdopted: false, prodSchemaFinding: false }), { gaps: [], askIndependent: true });
});

test("releaseCredentialCheck: missing/mismatched evidence is a gap", () => {
  const head = "a".repeat(40);
  // missing credential entirely
  assert.ok(releaseCredentialCheck(undefined, { currentHead: head, docAdopted: false, prodSchemaFinding: false }).gaps.length > 0);
  // missing independent
  assert.ok(releaseCredentialCheck({ review: { head_sha: head } }, { currentHead: head, docAdopted: false, prodSchemaFinding: false }).gaps.some((g) => g.includes("independent")));
  // missing head_sha
  assert.ok(releaseCredentialCheck({ review: { independent: true } }, { currentHead: head, docAdopted: false, prodSchemaFinding: false }).gaps.some((g) => g.includes("head_sha")));
  // head_sha moved on → EVIDENCE_STALE
  const stale = releaseCredentialCheck({ review: { head_sha: "b".repeat(40), independent: true } }, { currentHead: head, docAdopted: false, prodSchemaFinding: false });
  assert.ok(stale.gaps.some((g) => g.includes("HEAD")));
  assert.strictEqual(stale.askIndependent, false);
});

test("releaseCredentialCheck: doc-adopted and prod-schema findings require their fields", () => {
  const head = "a".repeat(40);
  const review = { review: { head_sha: head, independent: true } };
  // doc-adopted repo without doc field
  assert.ok(releaseCredentialCheck(review, { currentHead: head, docAdopted: true, prodSchemaFinding: false }).gaps.some((g) => g.includes("doc")));
  // prod-schema finding without prod_schema field
  assert.ok(releaseCredentialCheck(review, { currentHead: head, docAdopted: false, prodSchemaFinding: true }).gaps.some((g) => g.includes("prod_schema")));
  // unknown current HEAD is a gap (cannot verify the binding)
  assert.ok(releaseCredentialCheck(review, { currentHead: undefined, docAdopted: false, prodSchemaFinding: false }).gaps.some((g) => g.includes("HEAD")));
});

test("prod-schema patterns catch auto-migrate, not plain migrate scripts", () => {
  assert.strictEqual(PROD_SCHEMA_PATTERNS.some((re) => re.test('synchronize: true')), true);
  assert.strictEqual(PROD_SCHEMA_PATTERNS.some((re) => re.test("AUTO_MIGRATE=1")), true);
  assert.strictEqual(PROD_SCHEMA_PATTERNS.some((re) => re.test("prisma db push")), true);
  assert.strictEqual(PROD_SCHEMA_PATTERNS.some((re) => re.test("synchronize: false")), false);
  assert.strictEqual(PROD_SCHEMA_PATTERNS.some((re) => re.test("npm run migrate")), false);
});

test("isDoneClaim matches completion declarations, including batch/item", () => {
  for (const s of [
    "没有可自主推进的活了", "都做完了", "全部搞定", "这一棒做完了", "这批收口了",
    // The canonical batch-drift the gate exists to catch (FB-20260805-001):
    "本批次完成", "本批完成", "这批完成",
    // The project's own anti-drift wording:
    "没有可推进的活", "没活可推进", "没活了", "没有待办了", "没有 pending 了",
    "S6 全部收口", "做完了", "结束了", "收工", "没有剩余的活了",
    // Per-item completion also triggers the "report remaining N" steer:
    "S6-E2 已完成", "第 3 步做完了",
    "no work remains", "nothing left to do", "all done", "all finished",
  ]) {
    assert.strictEqual(isDoneClaim(s), true, "should be a claim: " + s);
  }
});

test("isDoneClaim rejects questions, negation, quota, and partial progress", () => {
  for (const s of [
    // questions — never a claim (the steer says "你宣称做完了")
    "结束了吗", "都完成了吗", "本轮做完了吗", "做完了吗?",
    // negation — reports of INCOMPLETE work are the opposite of a claim
    "还剩 2 步未完成", "还没做完", "未完成", "仍未完成", "尚未收口", "没做完",
    // quota/space wording — not a completion claim
    "没有剩余空间了", "没有剩余时间", "无剩余名额",
    // partial — "做了" without "完" is not a completion
    "已经做了一部分", "都做了 A 和 B",
  ]) {
    assert.strictEqual(isDoneClaim(s), false, "should NOT be a claim: " + s);
  }
});

test("enteredFlow treats active and stale as entered, absent/unattributable as not", () => {
  assert.strictEqual(enteredFlow("active"), true);
  assert.strictEqual(enteredFlow("stale"), true);
  assert.strictEqual(enteredFlow("absent"), false);
  assert.strictEqual(enteredFlow("unattributable"), false);
});

test("isProductCodePath draws the doc/config line shared by doc-gate and ledger-gate", () => {
  assert.strictEqual(isProductCodePath("src/index.ts"), true);
  assert.strictEqual(isProductCodePath("src/Component.tsx"), true);
  assert.strictEqual(isProductCodePath("README.md"), false);
  assert.strictEqual(isProductCodePath("package.json"), false);
  assert.strictEqual(isProductCodePath("config.yaml"), false);
  assert.strictEqual(isProductCodePath("ai-nseos/PROJECT_PROFILE.md"), false);
  // Extensionless config/boilerplate is NOT product code (3 of these must not
  // trip the 3-file ledger-gate).
  assert.strictEqual(isProductCodePath("Dockerfile"), false);
  assert.strictEqual(isProductCodePath("Dockerfile.dev"), false);
  assert.strictEqual(isProductCodePath("Jenkinsfile"), false);
  assert.strictEqual(isProductCodePath("Makefile"), false);
  assert.strictEqual(isProductCodePath(".env"), false);
  assert.strictEqual(isProductCodePath(".env.local"), false);
  assert.strictEqual(isProductCodePath(".gitignore"), false);
  // Any dotfile (even with a code-looking extension) is config, not product.
  assert.strictEqual(isProductCodePath(".eslintrc.js"), false);
  assert.strictEqual(isProductCodePath(".foo"), false);
  assert.strictEqual(isProductCodePath("LICENSE"), false);
  assert.strictEqual(isProductCodePath(undefined), false);
});

test("isBookkeepingPath excludes ack/marker files so clearing a gate is never deadlocked", () => {
  assert.strictEqual(isBookkeepingPath("ai-nseos/state/.impl-boundary-ack"), true);
  assert.strictEqual(isBookkeepingPath("ai-nseos/state/features/f1/.gate-armed"), true);
  assert.strictEqual(isBookkeepingPath("ai-nseos/state/features/f1/ambiguity-cleared"), true);
  assert.strictEqual(isBookkeepingPath("ai-nseos/state/flow/sess.json"), true);
  // Deadlock-prevention: an ack/marker that would otherwise count as "product
  // code" must still be writable. `.impl-boundary-ack` is excluded twice
  // (dotfile + ai-nseos/); `ambiguity-cleared` (no extension, no leading dot)
  // is excluded only by the ai-nseos/ rule — both must not trap the model.
  assert.strictEqual(isProductCodePath("ai-nseos/state/.impl-boundary-ack"), false); // dotfile
  assert.strictEqual(isBookkeepingPath("ai-nseos/state/.impl-boundary-ack"), true);
  assert.strictEqual(isProductCodePath("ai-nseos/state/features/f1/ambiguity-cleared"), true); // no ext, no dot
  assert.strictEqual(isBookkeepingPath("ai-nseos/state/features/f1/ambiguity-cleared"), true);
  assert.strictEqual(isBookkeepingPath("src/index.ts"), false);
  assert.strictEqual(isBookkeepingPath(undefined), false);
});
