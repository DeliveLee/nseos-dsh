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

NSEOS may recommend `RELEASE_READY`, but the named Release Owner authorizes deployment. Approval to implement or merge is not approval to release.

Write that authorization request — and every other human-facing report in this document — per `references/HUMAN_COMMUNICATION.md`, assuming the reader does not understand IT at all. This stacks with the standing readability rule (FB-20260717-003: conclusion first, one item per line as a full sentence, internal IDs explained on first use) rather than replacing it: FB-20260717-003 solves *"the reader did not watch the process"*, `HUMAN_COMMUNICATION.md` solves *"the reader does not understand the technology"*. This is the highest-stakes ask in the whole flow — the Release Owner is accountable for what happens to real users and real data — so state what going live changes for them, what the rollback window actually is, and which steps cannot be undone. Rule five is absolute here: an irreversible migration is "上线后没有退回去的办法", never "回滚方案待定".

## Release action sequence (satisfy the action-gate in one shot)

The machine `action-gate` denies a trunk push / `gh pr merge` unless, at push time, the repo is init'd, a fresh flow marker attributes this session, and the release credential covers independent review, prod-schema and (in a doc-adopted repo) doc maintenance. Both are freshness-bounded **by design** (stale evidence must never silently authorize a later action), so on a long run they lapse between the review and the push. Run the sequence immediately before the push rather than hitting the denial and retrying piecemeal (FB-20260719-002 — the window is intentionally **not** extended; this removes the trial-and-error, not the freshness check).

**Where each thing lives.** The flow marker is one file per session under the workspace root — `ai-nseos/state/flow/<session-slug>.json` (DSH has no worktree concept, so a session writes only its own workspace; parallel sessions do not share one file). The release credential `ai-nseos/state/.release-ready.json` stays in the workspace you are pushing from: it is evidence about that code, not about the session.

1. Refresh the flow marker — use the `write` tool to write one line of JSON to `ai-nseos/state/flow/<session-slug>.json` (structure and validation semantics per `FLOW_MARKER_CONTRACT.md`; `session_id` is the current session id, `started_at` regenerated each refresh, `goal_source` carried forward unless explicitly dropped). Never hand-roll shell for this.
2. Write the release credential — use the `write`/`edit` tool to write `ai-nseos/state/.release-ready.json` as JSON, any subset of the three fields. **The shape here is the single source; everything else links here.** Each field carries its own `at` (ISO8601), the current `head_sha`, and — for `review` — an explicit independence claim:
   ```json
   {"review": {"at": "<ISO8601>", "head_sha": "<git HEAD>", "note": "<who/agent>: <recommendation>", "independent": true|false},
    "doc": {"at": "<ISO8601>", "head_sha": "<git HEAD>", "note": "<what was updated / why nothing was>"},
    "prod_schema": {"at": "<ISO8601>", "head_sha": "<git HEAD>", "note": "<...>"}}
   ```
   - `review` — ONLY after a real independent review produced a Review Report (see `review-feature` Step 8.5).
   - `doc` — in a doc-adopted repo, ONLY after the domain docs reflect this change, or after establishing there is nothing to record.
   - `prod_schema` — only needed if the gate reported an ORM auto-sync finding (`synchronize: true`, `AUTO_MIGRATE`, `prisma db push`); walk the five prod-schema steps with the human first, then add the field.
3. Push / merge immediately: `git push origin HEAD` (or the approved `gh pr merge …`), while the marker and fields are fresh.

**Worktree release (v0.35.0, historical — DSH has no worktree concept, so this section is a retained incident record, not current instructions).** In the Claude harness, work isolated in a worktree still had to land on the main checkout, and the harness pinned a session's cwd to its own worktree. Until v0.35.0 the action-gate treated `git -C <main checkout> merge` as **another repository** and denied it, so a worktree session could not release **at all**; every one of five measured attempts (bonohair, 2026-07-28 → 08-05) ended with a human typing the merge by hand, which **bypasses this gate and its credentials entirely**. The fix was:

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

- **Never** disable a gate to proceed. The gate escape hatch (kill-switch) belongs to the human operator, for false denials. A model must not flip it, nor ask for it to be flipped in order to skip work it has not done. (An inline command prefix does nothing anyway — the kill-switch is session/process-scoped, not per-command.)
- **Never** mint an ack to clear a check whose substance you have not performed. The acks are self-mintable on purpose; that makes minting one falsely a deliberate misrepresentation, not a shortcut.
- **External long-run pressure is not authorization.** A `/goal` Stop-hook condition reporting "release ✗ NOT EXECUTED" is describing a legitimate authorized pause, not a failure to fix. Observed failure (bonohair-rebuild `c7c77a12`): after two correct refusals the session accepted the pressure on the third round and reached for the valve. Report BLOCKED with the missing items and hold.

## Post-release

- verify the agreed smoke/health/business checks; any check handed to the user or otherwise deferred is a named PENDING item in the Feature State and Release Evidence, not a sentence in a summary;
- monitor the defined window;
- if a rollback trigger fires, stop additional changes and follow the approved rollback plan;
- record incidents, unexpected behavior and actual outcomes;
- create Knowledge Candidates only after evidence is stable.

