# QuestVerifier

*Version 0.4 -- a hardening pass on top of v0.3 (see "v0.4: a hardening pass" in DECISION.md). Version 0.3 was a schema-compatibility pass. v0.2 parsed and ran fine under plain Python but
failed GenLayer's contract-schema introspection ("Could not load contract schema") because it
used plain Python `int` and `str`-for-address types on public methods, called a non-existent
`gl.get_contract_at(...)` for native transfers, and used the `datetime` stdlib module (unavailable
in this runtime) for deadline math. All four are fixed -- see "v0.3: a schema-compatibility pass"
in DECISION.md for the full list and why each one broke schema loading specifically.*

An on-chain bounty board for tasks a plain smart contract cannot check for itself: "post a tweet
about us," "get this GitHub PR merged," "write a review on our blog." A creator posts a quest and
pre-funds the full reward pool. A claimant proves ownership of their post with a wallet-bound
verification code, and a consensus round renders the page and asks an LLM whether it actually
satisfies the quest's plain-language criteria. Only a tiny `pass` / `fail` / `unreachable` verdict
goes through consensus -- never free text -- so every validator can agree on exactly the same
outcome.

## Reviewer summary

- **Live app**: a React frontend is included in this repository (see the top-level README).
- **Source**: part of this repository, under `quest-verifier/`.
- **Contract**: add StudioNet contract address here when deployed.
- **Main workflow**: a creator calls `create_quest` and deposits `reward * max_winners` (+ a
  small protocol fee), a claimant fetches their wallet-bound code with
  `get_verification_code`, posts it inside their tweet/PR/page, then calls `submit_proof` ->
  a consensus round renders the page, checks the code and any required keywords in plain code,
  and asks an LLM to judge the quest's actual criteria -> on a pass the reward is credited to a
  pull-payment balance the claimant withdraws with `withdraw`. A rejected claimant gets up to
  three attempts, then can `appeal` to a human moderator instead of being permanently locked out.

## Why this needs GenLayer's consensus, not just an oracle

Whether a tweet "praises the project" or a PR "fixes the reported bug" is a judgment call, not a
fact any single deterministic oracle can certify -- and a bounty board that let one server decide
payouts unilaterally would just move the trust problem, not solve it. `submit_proof` wraps the
entire read-page-then-judge step in `gl.eq_principle.strict_eq`, so every validator independently
renders the same page and runs the same prompt, and only a verdict every validator reaches
identically is accepted. Two deterministic checks -- the wallet-bound code and any required
keywords -- run first in plain Python, so the LLM is only ever asked to judge things a keyword
match genuinely can't: tone, relevance, and whether a PR actually does what the quest asked for.

## The design principle this contract is built around

A false "pass" pays out a bounty that shouldn't have been paid; a false "fail" costs a genuine
claimant one of their three attempts. Both are real costs, so this contract doesn't lean as hard
in one direction as, say, an inheritance vault -- instead it bounds each mistake's damage
directly:

1. **The wallet-bound code is enforced in code, not by the LLM.** A page that never contains the
   claimant's exact code is rejected before the model is ever asked anything, so no amount of
   persuasive page content can win a reward for someone who doesn't control the post.
2. **A rejection is never final on its own.** Three attempts, then a human-reviewed `appeal` --
   so a single bad render or an overly literal LLM judgment doesn't permanently lock a legitimate
   claimant out of a bounty they actually earned.
3. **An infrastructure failure is not a verdict.** If the proof page can't be rendered at all,
   `submit_proof` reverts instead of consuming an attempt or quietly recording a "fail" -- a
   transient fetch problem should never cost a claimant one of their three tries.

## Architecture

- `contracts/QuestVerifier.py` -- a single Intelligent Contract: quest creation and funding
  (creator-only), a bounded consensus round (`_run_check`) that renders the proof page, enforces
  the wallet-bound code and any required keywords in plain code, and only then asks an LLM to
  judge the quest's actual criteria, a bounded-attempts + human-appeal path for rejected
  claimants, pull-payment payouts, and owner/moderator governance (pause, fee, roles).
- `tests/direct/` -- direct-VM `gltest` tests covering quest creation and validation, the full
  tweet / GitHub PR / generic-domain submission paths, keyword enforcement, duplicate-proof and
  exhausted-slot rejection, the attempts-then-appeal path, escrow refund on close, deadlines,
  pausing, and owner/moderator/fee governance.

### Contract methods

| Method | Kind | Consensus round? | What it does |
| --- | --- | --- | --- |
| `create_quest(...)` | payable write, permissionless | No | Creates and fully funds a new quest (tweet / github_pr / generic-domain). |
| `add_winners(id, extra)` | payable write, creator-only | No | Tops up an existing quest with more funded reward slots. |
| `extend_deadline(id, ts)` | write, creator-only | No | Pushes a quest's deadline later (or removes it); never shortens it. |
| `set_quest_paused` | write, creator or moderator | No | Pause or resume a quest. |
| `close_quest(id)` | write, creator or moderator (anyone once expired) | No | Closes a quest and refunds unclaimed escrow to the creator, keeping aside only what pending appeals and not-yet-appealed rejected claimants could still claim. |
| `escalate_appeal(id, user)` | write, permissionless | Yes (validator consensus) | Only after a filed appeal has waited 14 days with no human decision. Validators re-run the check on the appealed link; a pass pays the claimant from the reserved escrow, a fail rejects the appeal. |
| `settle_closed_quest(id)` | write, permissionless | No | After a close and once the 7-day appeal window lapses, releases the leftover reserve to the creator. Filed appeals stay funded. |
| `submit_proof(id, url)` | write, permissionless (on a closed quest: only a rejected claimant with attempts left, within the 7-day window) | **Yes -- once per attempt** | Renders the proof page, checks the wallet-bound code and keywords, then has an LLM judge the criteria. |
| `appeal(id, url, note)` | write, claimant-only | No | After a rejection (or exhausted attempts), asks a human moderator to review instead. Still allowed after the quest is closed, for 7 days from the close. |
| `resolve_appeal(id, user, approve)` | write, moderator (or creator, approve-only) | No | Human override: pays out or confirms the rejection. |
| `withdraw()` | write, permissionless | No | Pulls the caller's accumulated reward balance. |
| `set_moderator` / `set_fee_bps` / `set_global_pause` / `propose_owner` / `cancel_ownership_transfer` / `accept_ownership` | write, owner-only (two-step for ownership) | No | Protocol governance. |
| `get_quest` / `get_quests` / `get_open_quests` / `get_verification_code` / `get_claimable` / `get_submission_status` / `get_attempts_left` / `get_appeal` / `get_user_stats` / `get_config` / `get_required_deposit` / `is_moderator` | view | No | Reads. |
| `get_submission(id, user)` | view | No | Status, attempts used/left, failure reason and the user's verification code in one call. |
| `get_user_submissions(user, offset, limit)` | view | No | Quests this user has a submission on (scans `limit` quest ids per call). |
| `get_pending_appeals(offset, limit)` | view | No | Appeals awaiting a human, oldest first. |

## Scope of this submission

Contract, tests and a frontend: browse open quests, copy your verification code, submit a proof, see
why a check failed, appeal, withdraw, create and manage quests, and a moderation queue.

## Honest limitations

- **Rendering some sources is unreliable.** X/Twitter pages rendered without authentication
  frequently give a renderer little to work with; a claimant whose proof genuinely can't be
  rendered will see `submit_proof` revert rather than an unfair rejection, but repeated
  unreachability still means the bounty can't be automatically resolved without a moderator.
- **Moderators are a real trust assumption.** The appeal path exists precisely because the
  automated check can be wrong in either direction, but that means moderators (and, for approvals
  only, the quest creator) hold real power over disputed payouts -- this contract does not attempt
  to make appeal resolution itself trustless.
- **The code proves intent, not authorship.** Verification codes are derived from the wallet address and
  `get_verification_code` is public, so anyone can compute anyone's code. A claimant could paste their own
  code into a reply or comment beneath a post they did not write. Keywords must sit near the code and the
  prompt requires the code to be in the main post, but that is a model judgement and can be wrong in both
  directions; the appeal path exists for exactly that. Quests that must never pay a third party should use
  a `generic` kind on a domain whose pages only the claimant can edit.
- **Moderator queue depth is on-chain.** `get_pending_appeals` pages through an append-only log, so a
  very large number of appeals makes the log long. Fine at this scale; an indexer is the real answer beyond it.
- **No sybil resistance on claimants.** Anyone with a wallet and a postable account can attempt a
  quest; nothing here verifies that a claimant's social account is not itself disposable or
  purchased, beyond the codes and keywords being genuinely present on the page.
- **Generic-domain quests trust the creator's domain choice.** Unlike the wallet-bound code check,
  there is no live DNS or private-IP hardening on `domain` for generic quests -- a creator who
  names a domain they don't intend to police is a misconfiguration risk for their own quest, not
  a protocol-wide one, since escrow only ever pays out from that one quest's own funds.
