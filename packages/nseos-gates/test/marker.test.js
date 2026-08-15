// Negative-control tests for the flow-marker predicate + gate helpers.
// Each assertion proves the predicate DOES reject the bad shapes (a green test
// only counts after a relevant fault can make it red).
import assert from "node:assert";
import { test } from "node:test";
import { DONE_CLAIM_PATTERNS, DEPLOY_PATTERNS, PROD_SCHEMA_PATTERNS, classifyReleaseBash, enteredFlow, evaluateMarker, isBookkeepingPath, isDoneClaim, isNseosSkill, isProductCodePath, releaseApprovalDenyReason, releaseConsentGranted, releaseCredentialCheck, releaseGaps, slug, targetAmbiguity } from "../lib/core.js";

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

test("classifyReleaseBash: trunk push / multi-ref / version-tag are release, feature-branch is not", () => {
  // trunk pushes (release-class) — explicit trunk refspec needs no head
  assert.ok(classifyReleaseBash("git push origin main"), "trunk main");
  assert.ok(classifyReleaseBash("git push origin master"), "trunk master");
  assert.ok(classifyReleaseBash("git push origin production"), "trunk production");
  // multi-ref pushes publish objects the credential never covered
  assert.ok(classifyReleaseBash("git push --mirror"), "mirror");
  assert.ok(classifyReleaseBash("git push --all"), "all");
  assert.ok(classifyReleaseBash("git push --tags"), "tags");
  assert.ok(classifyReleaseBash("git push --follow-tags"), "follow-tags");
  // version-tag pushes
  assert.ok(classifyReleaseBash("git push origin v1.2.3"), "version tag");
  assert.ok(classifyReleaseBash("git push origin refs/tags/v1"), "tag refspec");
  // feature-branch push is NOT release-class (this is the over-blocking bug)
  assert.strictEqual(classifyReleaseBash("git push origin feature/foo"), undefined);
  assert.strictEqual(classifyReleaseBash("git push origin fix/bar"), undefined);
  // non-release git subcommands
  assert.strictEqual(classifyReleaseBash("git commit -m x"), undefined);
  assert.strictEqual(classifyReleaseBash("git status"), undefined);
  assert.strictEqual(classifyReleaseBash("git checkout -b feature/x"), undefined);
  // local `git tag` alone is NOT a release — only the tag PUSH is (Claude parity)
  assert.strictEqual(classifyReleaseBash("git tag v1.0.0"), undefined, "local git tag is not a release");
  // value-flags: `git -C /tmp/x push` reads subcommand "push", not "/tmp/x"
  assert.ok(classifyReleaseBash("git -C /tmp/x push origin main"), "git -C push to trunk");
  assert.ok(classifyReleaseBash("git --git-dir=/x push origin main"), "git --git-dir= push to trunk");
  // non-git programs
  assert.strictEqual(classifyReleaseBash("npm test"), undefined);
  assert.strictEqual(classifyReleaseBash("node --version"), undefined);
});

test("classifyReleaseBash is branch-aware: merge/bare-push/HEAD only release on trunk (head param)", () => {
  const main = "main";
  const feat = "feature/foo";
  // merge: release only when the CURRENT branch is trunk
  assert.ok(classifyReleaseBash("git merge feature/x", main), "merge INTO trunk is a release");
  assert.strictEqual(classifyReleaseBash("git merge main", feat), undefined, "merge main into feature is a sync, not a release");
  // bare push: release only on trunk
  assert.ok(classifyReleaseBash("git push", main), "bare push on trunk");
  assert.strictEqual(classifyReleaseBash("git push", feat), undefined, "bare push on feature is NOT release");
  // remote-only push (`git push origin`) is a bare push — release only on trunk
  assert.ok(classifyReleaseBash("git push origin", main), "remote-only push on trunk");
  assert.strictEqual(classifyReleaseBash("git push origin", feat), undefined, "remote-only push on feature");
  // HEAD resolution: `git push origin HEAD` on trunk
  assert.ok(classifyReleaseBash("git push origin HEAD", main), "HEAD resolves to current trunk branch");
  assert.strictEqual(classifyReleaseBash("git push origin HEAD", feat), undefined, "HEAD on feature is not trunk");
  // refs/heads/ prefix stripped: `HEAD:refs/heads/main`
  assert.ok(classifyReleaseBash("git push origin HEAD:refs/heads/main", feat), "refs/heads/main stripped to trunk");
  assert.ok(classifyReleaseBash("git push origin feature/foo:refs/heads/main", feat), "src:dst → dst trunk");
  // --delete is a flag, NOT a value-flag: `git push origin --delete main` still names main
  assert.ok(classifyReleaseBash("git push origin --delete main", feat), "--delete main deletes the trunk");
});

test("classifyReleaseBash: gh pr merge / release create / deploy-workflow vs lint workflow", () => {
  assert.ok(classifyReleaseBash("gh pr merge 42"), "pr merge");
  assert.ok(classifyReleaseBash("gh release create v1.0.0"), "release create");
  // only deploy-shaped workflow runs are release-class
  assert.ok(classifyReleaseBash("gh workflow run deploy.yml"), "deploy workflow");
  assert.ok(classifyReleaseBash("gh workflow run ship-it"), "ship-it workflow");
  assert.strictEqual(classifyReleaseBash("gh workflow run lint.yml"), undefined, "lint workflow is NOT release");
  assert.strictEqual(classifyReleaseBash("gh workflow run test.yml"), undefined, "test workflow is NOT release");
  // bare `gh workflow run` (no name) is conservatively release-class (Claude parity)
  assert.ok(classifyReleaseBash("gh workflow run"), "bare workflow run");
  // `gh -R owner/repo pr merge` — value-flag parse
  assert.ok(classifyReleaseBash("gh -R owner/repo pr merge 7"), "gh -R pr merge");
  // `gh workflow run --repo x deploy.yml` — value-flag AFTER subcommand
  assert.ok(classifyReleaseBash("gh workflow run --repo x deploy.yml"), "gh workflow run --repo deploy");
});

test("targetAmbiguity: cd/switch/checkout before a release-shaped segment is ambiguous (must split)", () => {
  // HEAD/cwd changes before a release make the target unknowable at pre-exec time
  assert.ok(targetAmbiguity("git checkout main && git push"), "checkout then push");
  assert.ok(targetAmbiguity("git switch main && git push origin main"), "switch then push");
  assert.ok(targetAmbiguity("cd /x && git push origin main"), "cd then push");
  // no release-shaped segment → not ambiguous
  assert.strictEqual(targetAmbiguity("git checkout main"), undefined, "checkout alone");
  assert.strictEqual(targetAmbiguity("cd /x"), undefined, "cd alone");
  // release with no prior HEAD change → not ambiguous
  assert.strictEqual(targetAmbiguity("git push origin main"), undefined, "plain push");
});

test("classifyReleaseBash: docker compose prod signal is release, plain compose is not", () => {
  assert.ok(classifyReleaseBash("docker compose -f docker-compose.prod.yml up -d"), "prod compose file");
  assert.ok(classifyReleaseBash("docker-compose -f docker-compose.production.yml up"), "production compose file");
  assert.strictEqual(classifyReleaseBash("docker compose up -d"), undefined, "plain compose up is NOT release");
  assert.strictEqual(classifyReleaseBash("docker compose -f docker-compose.dev.yml up"), undefined, "dev compose is NOT release");
  // a service NAMED "production-backend" is not a prod signal
  assert.strictEqual(classifyReleaseBash("docker compose up production-backend"), undefined, "service name is NOT a prod signal");
});

test("classifyReleaseBash: version-tag requires v-prefix; shell chaining still classifies the release segment", () => {
  // unprefixed "2.0" / "2.0-hotfix" are branch names, not version tags
  assert.strictEqual(classifyReleaseBash("git push origin 2.0-hotfix"), undefined, "hotfix branch is NOT a version tag");
  assert.strictEqual(classifyReleaseBash("git push origin v1.2.3"), "git push 标签 v1.2.3", "v-prefixed tag still caught");
  // shell chaining: the release segment after && is still caught
  assert.ok(classifyReleaseBash("git status && git push origin main"), "trailing trunk push after && must be caught");
  assert.ok(classifyReleaseBash("git push origin main && echo done"), "leading trunk push");
  assert.ok(classifyReleaseBash("git commit -am x; git push origin main"), "trunk push after ;");
  assert.strictEqual(classifyReleaseBash("git status && git log"), undefined, "two benign segments stay benign");
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

test("releaseApprovalDenyReason: allowed-once is the only grant; never/reject/cancel/unavailable deny with guidance", () => {
  assert.strictEqual(releaseApprovalDenyReason("allowed-once"), undefined);
  // rejected must name the "never" root cause and the "改回 ask" remedy, so the
  // model can un-wedge itself instead of retrying blindly (FB-20260814-003).
  const rejected = releaseApprovalDenyReason("rejected");
  assert.ok(rejected.includes("never"), "拒绝理由要指出 never 策略这条根因");
  assert.ok(rejected.includes("ask"), "拒绝理由要给出改回 ask 的解法");
  // FB-20260815-001: chat-text authorization must not unlock the gate, and the
  // reason must hand the model a verbatim human-facing block (not a paraphrase
  // the model re-words and loses) — the only non-lossy recovery path.
  assert.ok(rejected.includes("不算授权"), "拒绝理由要明说对话文字授权不算数");
  assert.ok(rejected.includes("一字不改"), "拒绝理由要给出一字不改转达的指令");
  assert.ok(releaseApprovalDenyReason("cancelled").includes("取消"));
  assert.ok(releaseApprovalDenyReason("unavailable").includes("fail-closed"));
  // any unknown outcome is fail-closed, never a silent grant
  assert.ok(releaseApprovalDenyReason("bogus").includes("bogus"));
});

test("releaseConsentGranted: only the explicit 同意 option grants (FB-20260815-001)", () => {
  // The gate asks through userQuestions.ask() so a definite human answer is
  // required even under approval=never. Only the "同意" option is a grant.
  assert.strictEqual(releaseConsentGranted({ answers: [{ id: "release-confirm", selected: ["同意"] }] }), true);
  assert.strictEqual(releaseConsentGranted({ answers: [{ id: "release-confirm", selected: ["拒绝"] }] }), false);
  assert.strictEqual(releaseConsentGranted({ answers: [{ id: "release-confirm", selected: [] }] }), false);
  // custom free-text is not a definite answer — must not grant
  assert.strictEqual(releaseConsentGranted({ answers: [{ id: "release-confirm", selected: [], custom: "同意吧" }] }), false);
  // wrong id / missing item / malformed answer denies (never a silent grant)
  assert.strictEqual(releaseConsentGranted({ answers: [{ id: "other", selected: ["同意"] }] }), false);
  assert.strictEqual(releaseConsentGranted({ answers: [] }), false);
  assert.strictEqual(releaseConsentGranted(undefined), false);
  assert.strictEqual(releaseConsentGranted(null), false);
});

test("releaseGaps aggregates every unmet item", () => {
  assert.deepStrictEqual(releaseGaps({ initd: false, flowActive: false }).length, 2);
  assert.deepStrictEqual(releaseGaps({ initd: true, flowActive: true }), []);
  assert.deepStrictEqual(releaseGaps({ initd: true, flowActive: true, prodSchema: "ORM 风险" }), ["ORM 风险"]);
});

test("releaseCredentialCheck: complete independent review passes, self-review asks", () => {
  const head = "a".repeat(40);
  const ok = { review: { head_sha: head, independent: true, note: "quality-reviewer: 17/17 测试绿 + 变异负控制转红" } };
  assert.deepStrictEqual(releaseCredentialCheck(ok, { currentHead: head, docAdopted: false, prodSchemaFinding: false }), { gaps: [], selfReview: false });
  // Self-review (independent:false) is clean-but-ask, never silently packaged as independent.
  const self = { review: { head_sha: head, independent: false, note: "orchestrator: 测试绿 + 负控制" } };
  assert.deepStrictEqual(releaseCredentialCheck(self, { currentHead: head, docAdopted: false, prodSchemaFinding: false }), { gaps: [], selfReview: true });
});

test("releaseCredentialCheck: review.note must state test evidence (必答)", () => {
  const head = "a".repeat(40);
  // note 没提测试/负控制 → MISSING_TEST_EVIDENCE
  const noTest = releaseCredentialCheck({ review: { head_sha: head, independent: true, note: "quality-reviewer: 看着没问题" } }, { currentHead: head, docAdopted: false, prodSchemaFinding: false });
  assert.ok(noTest.gaps.some((g) => g.includes("测试绿")), "应缺测试证据");
  assert.strictEqual(noTest.selfReview, false);
  // 提了测试绿 + 负控制 → 通过
  const withTest = releaseCredentialCheck({ review: { head_sha: head, independent: true, note: "测试绿 73/73, 变异负控制转红" } }, { currentHead: head, docAdopted: false, prodSchemaFinding: false });
  assert.deepStrictEqual(withTest.gaps, []);
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
  assert.strictEqual(stale.selfReview, false);
});

test("releaseCredentialCheck: doc-adopted and prod-schema findings require their fields", () => {
  const head = "a".repeat(40);
  const review = { review: { head_sha: head, independent: true } };
  // doc-adopted repo without doc field
  assert.ok(releaseCredentialCheck(review, { currentHead: head, docAdopted: true, prodSchemaFinding: false }).gaps.some((g) => g.includes("doc")));
  // doc-adopted CHECK ERROR (undefined) is fail-loud, never "clean"
  assert.ok(releaseCredentialCheck(review, { currentHead: head, docAdopted: undefined, prodSchemaFinding: false }).gaps.some((g) => g.includes("doc-adopted")));
  // prod-schema finding without prod_schema field
  assert.ok(releaseCredentialCheck(review, { currentHead: head, docAdopted: false, prodSchemaFinding: true }).gaps.some((g) => g.includes("prod_schema")));
  // unknown current HEAD is a gap (cannot verify the binding)
  assert.ok(releaseCredentialCheck(review, { currentHead: undefined, docAdopted: false, prodSchemaFinding: false }).gaps.some((g) => g.includes("HEAD")));
});

test("releaseCredentialCheck: prod_schema credential resolves the finding (RELEASE.md: 走五步后写凭据)", () => {
  const head = "a".repeat(40);
  // finding detail string flows into the gap message
  const noPs = releaseCredentialCheck(
    { review: { head_sha: head, independent: true, note: "测试绿 + 负控制" } },
    { currentHead: head, docAdopted: false, prodSchemaFinding: "ORM 自动迁移风险(src/data-source.ts 命中 synchronize: true)" }
  );
  assert.ok(noPs.gaps.some((g) => g.includes("synchronize: true")), "gap 要带上具体命中的文件/pattern");
  // a valid prod_schema credential (head_sha bound) RESOLVES the finding
  const ok = releaseCredentialCheck(
    { review: { head_sha: head, independent: true, note: "测试绿 + 负控制" }, prod_schema: { head_sha: head } },
    { currentHead: head, docAdopted: false, prodSchemaFinding: "ORM 自动迁移风险(...)" }
  );
  assert.deepStrictEqual(ok, { gaps: [], selfReview: false });
  // stale prod_schema head_sha does not resolve
  const stale = releaseCredentialCheck(
    { review: { head_sha: head, independent: true, note: "测试绿 + 负控制" }, prod_schema: { head_sha: "b".repeat(40) } },
    { currentHead: head, docAdopted: false, prodSchemaFinding: "ORM 自动迁移风险(...)" }
  );
  assert.ok(stale.gaps.some((g) => g.includes("prod_schema")));
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
