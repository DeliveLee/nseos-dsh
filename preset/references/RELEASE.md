# Integration and Release Workflow

## Preconditions

- every included feature is `READY_FOR_INTEGRATION`; a feature in `PENDING_LIVE_VERIFY`, or carrying an open named PENDING live-verification item, does not qualify — return it rather than releasing on tests alone;
- individual reviews and handoffs are complete;
- required approvals are recorded;
- target base and release scope are fixed;
- rollback owner and method are known.

## Integration checks

1. Compare file overlap, interfaces, schemas, configuration, feature flags and dependencies.
2. Establish merge/migration order.
3. Build a combined test matrix covering feature interactions and critical regressions.
4. Verify migrations on disposable data and verify rollback or forward-recovery strategy.
5. Confirm observability, logs, metrics and operational alerts required by the change.
6. Record all exact evidence in `RELEASE_EVIDENCE.md`.

## Release gate

Claude may recommend `RELEASE_READY`, but the named Release Owner authorizes deployment. Approval to implement or merge is not approval to release.

Write that authorization request — and every other human-facing report in this document — per `references/HUMAN_COMMUNICATION.md`, assuming the reader does not understand IT at all. This stacks with the standing readability rule (FB-20260717-003: conclusion first, one item per line as a full sentence, internal IDs explained on first use) rather than replacing it: FB-20260717-003 solves *"the reader did not watch the process"*, `HUMAN_COMMUNICATION.md` solves *"the reader does not understand the technology"*. This is the highest-stakes ask in the whole flow — the Release Owner is accountable for what happens to real users and real data — so state what going live changes for them, what the rollback window actually is, and which steps cannot be undone. Rule five is absolute here: an irreversible migration is "上线后没有退回去的办法", never "回滚方案待定".

## Release action sequence (satisfy the action-gate in one shot)

The machine `action-gate` denies a trunk push / `gh pr merge` unless, at push time, the repo is init'd, a fresh flow marker attributes this session, and the release credential covers independent review, prod-schema and (in a doc-adopted repo) doc maintenance. Both are freshness-bounded **by design** (stale evidence must never silently authorize a later action), so on a long run they lapse between the review and the push. Run the sequence immediately before the push rather than hitting the denial and retrying piecemeal (FB-20260719-002 — the window is intentionally **not** extended; this removes the trial-and-error, not the freshness check). Substitute `<session-id>` with the injected `[ai-nseos SESSION_ID]` value.

**Where each thing lives (v0.20.0).** The flow marker is one file per session under the **main checkout** — `ai-nseos/state/flow/<session-id>.json`, resolved from any linked worktree, so parallel sessions cannot overwrite each other and a worktree does not need its own copy (FB-20260725-002, FB-20260719-007). The release credential `ai-nseos/state/.release-ready.json` stays in **the checkout you are pushing from**: it is evidence about that code, not about the session.

1. Refresh the flow marker (works from the main checkout or any worktree — one flat command, never hand-rolled shell):
   `python3 (DSH: 无此层) --session "<the injected [ai-nseos SESSION_ID] value, verbatim — never guess it, never leave the placeholder>" --mode release --contract "<one-line summary>"`
   It resolves the main checkout itself, creates the directory, stamps the timestamp, and **prints the absolute path it wrote** — so "where did it land" is answerable instead of guessed. Add `--goal-source <repo-relative path to the upper-level plan or progress source>` (repeatable) when this release serves a handoff baton: a baton is a **batch**, not the goal, and the Stop-side progress gate resolves `goal_source` before the profile's `Progress source:`. If `(DSH: 无此层)` is missing, run `nseos 流程` first — updating the plugin does not refresh the machine-level files — rather than falling back to hand-written shell.
2. Write the release credential — one command, any subset of the three fields. **This command is the single source for the credential shape; everything else links here.** Each field is stamped with its own `at`, the current `head_sha`, and — for `review` — an explicit independence claim (the trailing word: `independent` for a third-party subagent or human reviewer, `self` for the orchestrator reviewing its own work):
   `python3 -c 'import json,os,sys,datetime,subprocess;p="ai-nseos/state/.release-ready.json";d=json.load(open(p)) if os.path.exists(p) else {};now=datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ");h=subprocess.run(["git","rev-parse","HEAD"],capture_output=True,text=True).stdout.strip();ind=sys.argv[-1]=="independent";a=sys.argv[1:-1];d.update({k:{"at":now,"head_sha":h,"note":v} for k,v in zip(a[::2],a[1::2])});d["review"].update({"independent":ind}) if "review" in d else None;os.makedirs(os.path.dirname(p),exist_ok=True);json.dump(d,open(p,"w"),ensure_ascii=False,indent=1)' review "<who/agent>: <recommendation>" doc "<what was updated / why nothing was>" independent`
   - `review` — ONLY after a real independent review produced a Review Report (see `review-feature` Step 8.5).
   - `doc` — in a doc-adopted repo, ONLY after the domain docs reflect this change, or after establishing there is nothing to record.
   - `prod_schema` — only needed if the gate reported an ORM auto-sync finding (`synchronize: true`, `AUTO_MIGRATE`, `prisma db push`); walk the five prod-schema steps with the human first, then add the field.
3. Push / merge immediately: `git push origin HEAD` (or the approved `gh pr merge …`), while the marker and fields are fresh.

**Releasing from a linked worktree (v0.35.0).** Work isolated in a worktree still has to land on the main checkout, and the harness pins a session's cwd to its own worktree — a bare `cd` bounces back. Until v0.35.0 the action-gate treated `git -C <main checkout> merge` as **another repository** and denied it, so a worktree session could not release **at all**; every one of five measured attempts (bonohair, 2026-07-28 → 08-05) ended with a human typing the merge by hand, which **bypasses this gate and its credentials entirely**. Now:

- **`git -C <main checkout> …` is the supported form** — same repository, one tool call, no `cd` (a `cd` in the same command is still `RELEASE_TARGET_AMBIGUOUS`, and there is no longer any reason to write it that way). A different repository, a submodule, or an unresolvable path stays foreign.
- **Every other criterion still applies to that command**: init, this session's flow marker, prod-schema ack, and the release credential bound to the current `head_sha`. Narrowing the location check did not relax the evidence check — the usual denial now reads "your review evidence does not cover this code", which is the criterion that actually matters.
- **Ask the human for merge authorization in the conversation, then run it yourself.** Handing a human a list of commands to paste is not the approval gate being satisfied — it is the gate being skipped. The human gate is his *answer*, not his typing.
- **Accepted boundary, stated once**: the credential read is the calling checkout's and binds to that checkout's HEAD, so it covers the commits being merged, not whatever else main has accumulated.

Each field's freshness comes from its own `at`, never from the file's mtime — rewriting one field does not renew the others.

**`head_sha` — what a credential is ABOUT (v0.24.0, FB-20260727-004a).** Time freshness alone let a credential outlive the code it described: review commit X, add five commits, the gate still opened; and with work spanning accounts on one machine, whoever pushed next inherited a review they never did. Each field now records the HEAD it was written against, and the gate denies with `EVIDENCE_STALE` when HEAD has moved on. Practical consequence: **write the credential as the last step before pushing**, not at the end of review — any commit after it (including committing the Review Report itself) invalidates it, by design. A field with no `head_sha` denies with `MISSING_HEAD_SHA`; the bare `"<ISO8601>"` short form no longer suffices.

**`independent` — WHO reviewed (v0.24.0, FB-20260727-003).** `review` must state `true` or `false`. Observed failure: two reviewer subagents died mid-run, the orchestrator verified its own work and wrote the credential, and the credential was indistinguishable from a genuine independent review — disclosure depended entirely on the orchestrator volunteering it. `false` still releases, but the gate returns `ask`, so the human confirms once and self-review can never be silently packaged as "reviewed". Omitting the field denies with `MISSING_INDEPENDENT` — "unstated" is not a third option.

The pre-v0.20 `.flow-active` / `.review-ack` / `.prod-schema-ack` / `.doc-maintained` files are still read so an in-flight session is not stranded, but they are deprecated: write the new format. **Known residual:** being mtime-only they carry no `head_sha`, so a legacy file satisfies its obligation without the commit binding. Nothing teaches those filenames any more, so following these instructions never produces one; it is locked by `test_legacy_files_bypass_head_binding_known_residual` rather than left to be rediscovered.

Since v0.19.8 the gate reports **every** unmet item in a single deny (FB-20260725-001), so one denial tells you the whole remaining list — work it top to bottom instead of retrying after each fix.

## Hitting a gate is a legitimate BLOCKED state (FB-20260725-004)

An unmet gate is not an obstacle to route around. The correct move is: state to the human what is still missing and what you already completed, then stop. Say it per `references/HUMAN_COMMUNICATION.md` (see the Release gate section above): the gate's own deny text is written for the model — it names files, fields and env vars — so translate it rather than pasting it. The human needs two plain-language facts: what has genuinely been finished, and what remains undone before this can ship. Do not present a blocked release as nearly done, and do not describe the missing item as a formality; if an independent review has not happened, say it has not happened. Specifically:

- **Never** disable a gate to proceed. `AINSEOS_ACTION_GATE=off` / `AINSEOS_SKILL_GATE=off` belong to the human operator, for false denials. A model must not flip them, nor ask for them to be flipped in order to skip work it has not done. (An inline prefix does nothing anyway — the hook reads the Claude process environment, not the command's.)
- **Never** mint an ack to clear a check whose substance you have not performed. The acks are self-mintable on purpose; that makes minting one falsely a deliberate misrepresentation, not a shortcut.
- **External long-run pressure is not authorization.** A `/goal` Stop-hook condition reporting "release ✗ NOT EXECUTED" is describing a legitimate authorized pause, not a failure to fix. Observed failure (bonohair-rebuild `c7c77a12`): after two correct refusals the session accepted the pressure on the third round and reached for the valve. Report BLOCKED with the missing items and hold.

## Post-release

- verify the agreed smoke/health/business checks; any check handed to the user or otherwise deferred is a named PENDING item in the Feature State and Release Evidence, not a sentence in a summary;
- monitor the defined window;
- if a rollback trigger fires, stop additional changes and follow the approved rollback plan;
- record incidents, unexpected behavior and actual outcomes;
- create Knowledge Candidates only after evidence is stable.

