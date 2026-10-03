# QuestVerifier Decision Record

## The product

A bounty board where the thing being checked -- "does this tweet praise the project," "does this
PR fix the reported bug" -- is inherently a judgment call, not a fact any deterministic oracle can
certify. A creator posts a quest and reward, a claimant proves they control a qualifying post or
PR, and a consensus round decides whether it actually meets the quest's criteria.

## Counterfactual: why not just a keyword filter, or a single off-chain judge

A pure keyword filter ("must contain #genlayer") can be gamed trivially and can't tell a genuine
endorsement from a copy-pasted hashtag with no real content around it -- most quests worth running
need an actual reading of the page, not a substring match. A single off-chain judge (one server
deciding pass/fail) just relocates the trust problem: claimants would need to trust that one
operator not to be lazy, biased, or compromised, which is exactly the kind of single point of
failure a bounty board should not depend on. `gl.eq_principle.strict_eq` gives every validator the
same page render and the same prompt, and only accepts a verdict every validator reaches
identically -- so the judgment is real, but no single party makes it alone.

## Why the wallet-bound code and keyword checks are deterministic, not LLM-judged

Ownership and simple presence are facts, not judgment calls, and facts should never be left to a
model's discretion when plain code can check them exactly and more cheaply. The code is generated
from the claimant's own address (`GLQ-{quest_id}-{first 8 hex chars of address}`), so an LLM being
persuaded that "the code is probably there somewhere" can never substitute for the code actually
being on the page. This also shrinks what the LLM is asked to decide down to the one thing that
really does need judgment: does this specific page content satisfy this specific quest's
criteria.

## Why an unreachable proof page reverts instead of failing

A `fail` verdict consumes one of a claimant's three attempts; an `unreachable` verdict is an
infrastructure problem that has nothing to do with whether their proof is genuine. Charging a
claimant an attempt for a renderer hiccup would punish them for something entirely outside their
control, so `_run_check` returns a distinct `unreachable` status and `submit_proof` reverts on it
-- no submission record is written, no attempt is spent, and the claimant can simply retry.

## Why rejections are bounded, then routed to a human appeal

Both of this contract's possible mistakes are real: a false pass pays a bounty that shouldn't have
been paid, and a false fail costs a genuine claimant an attempt on a task they may have already
completed correctly. Because the automated check can be wrong in either direction, a claimant
gets three tries against transient misreadings, and after that (or after any single rejection,
if they'd rather not spend more attempts) can `appeal` to a human moderator instead of being
permanently locked out by a model's literal reading of an ambiguous page. The creator may approve
an appeal (they only ever gain by being generous to a real claimant) but may not reject one --
rejecting is the one lever a financially interested party should not hold alone.

## Why proofs are keyed by content id, not by URL string

An early draft treated a normalized URL as the proof's identity, which meant the same tweet could
be resubmitted under a harmless query-string variation, or a claimant could point a "generic"
quest's checker at a URL whose path segments still matched a used pattern. Tweets are now keyed by
their numeric status id and PRs by `owner/repo/pull/number`, extracted directly from the URL's
required shape -- the one fact that actually identifies "this specific post" or "this specific
PR," independent of how the URL happened to be typed.

## Why there is a fee, unlike ProofOfLifeVault in this series

A digital-inheritance vault has no shared infrastructure cost beyond the owner's own vault; a
bounty board's consensus rounds are a real, ongoing cost the protocol operator incurs on every
submission, regardless of outcome. `fee_bps` is capped at 10% and is charged once, at funding
time, on the deposit the creator was going to make anyway -- never on a claimant's payout -- so
the cost of running verification is borne by the party who benefits from having their quest
checked, not by the person trying to earn a bounty.

## Self-review pass: gaps found and fixed before any external review

1. `submit_proof`'s original draft treated any non-pass verdict, including a page that failed to
   render at all, as a plain rejection that spent one of the claimant's three attempts -- fixed by
   giving unreachability its own status that reverts instead.
2. The original proof-uniqueness key was the normalized URL, which a query-string variation could
   bypass -- fixed by extracting each kind's actual content id (tweet status id, PR
   owner/repo/pull/number) and keying on that instead.
3. `close_quest` did not check for in-flight appeals before zeroing a quest's escrow, which could
   have left a later-approved appeal with no funds to pay out of -- fixed by blocking `close_quest`
   while any appeal on that quest is still pending.
4. The initial LLM prompt did not explicitly warn that the wallet-bound code's mere presence is
   not itself evidence the quest's criteria were met -- fixed by stating that distinction directly
   in the prompt, since a model could otherwise treat "the code is there" as "so the rest must be
   genuine too."

## v0.3: a schema-compatibility pass

v0.2 parsed and ran correctly under plain Python and passed a full local test suite, but failed to
deploy with "Could not load contract schema" -- the schema introspection step is stricter than the
Python interpreter, and four things a normal Python file allows are not introspectable:

1. **Every public write/view/constructor parameter and return type must be one of the SDK's fixed-
   width types** (`u256`, `Address`, `str`, `bool`, `dict`, `list`, `None`). v0.2 used plain
   Python `int` throughout public signatures (`max_winners: int`, `quest_id: int`, `bps: int`,
   `offset: int`...) because that is what ordinary Python code would use -- but `int` has no fixed
   width for the schema to serialize, so introspection fails at the first such parameter it finds.
   Fixed by switching every `@gl.public.write` / `@gl.public.view` / `__init__` parameter and
   return annotation to `u256`, converting to plain `int` only inside the method body where
   ordinary arithmetic is needed. Private helper methods (no `@gl.public.*` decorator) keep plain
   `int` freely, since only the public surface is introspected.
2. **Wallet addresses in public signatures must be typed `Address`, not `str`.** v0.2 typed
   several parameters (`user`, `new_owner`) as `str` and converted them to `Address(...)` inside
   the method body -- functionally equivalent at runtime, but the schema needs the `Address` type
   declared on the signature itself to know how to validate and encode an incoming address.
3. **`gl.get_contract_at(...)` used for `withdraw()`'s native transfer is not part of the SDK.**
   Any outbound value transfer needs a declared `@gl.evm.contract_interface` (a `_Payee` class
   with empty `View`/`Write` inner classes, following this series' other contracts), instantiated
   with the destination address and called as `_Payee(addr).emit_transfer(value=amount)`.
4. **The `datetime` stdlib module is not available in this runtime.** v0.2 converted the
   contract-clock string to unix seconds via `datetime.fromisoformat(...).timestamp()` to compare
   quest deadlines. Fixed by keeping deadlines as plain ISO-8601 UTC strings end-to-end (as every
   other contract in this series already does for its own timestamps) and comparing them
   lexicographically -- a fixed-width ISO-8601 string sorts identically to its chronological
   order, so no date-arithmetic library is needed at all for a plain "has this deadline passed"
   check.

None of these changes altered the contract's actual rules or economics -- every check, every
error condition, and every payout path is identical to v0.2. This was purely a type-system and
API-surface correction to make the same logic actually deployable.

## v0.4: a hardening pass

v0.3 fixed deployability. v0.4 is a review of what the contract actually does once it is deployed
and used, and it closes the gaps below. Every change has a test in `tests/direct/`, and each test
was checked by deliberately breaking the fix and confirming the test fails.

**Gaps that could cost money or lock funds**

1. *A pending appeal froze `close_quest`.* Anyone with a rejected submission could appeal and
   block the creator from ever recovering their escrow, until a moderator acted. Now closing always
   works. Escrow is split: everything the pending appeals could not possibly claim goes straight
   back to the creator, and the remainder (one reward per pending appeal, never more than the free
   slots) stays reserved. Each time an appeal is resolved the reserve is recomputed and any excess
   is released. Approving an appeal on a closed quest still pays out of the reserve.
1a. *(v0.5) Closing before the appeal removed the appeal.* After an automated rejection the creator or
   a moderator could call `close_quest`: no appeal was pending, so the whole escrow was refunded, and
   `appeal()` then refused the claimant because the quest was closed. A rejection is documented as never
   final on its own, so this is fixed in three parts. (a) The contract counts claimants whose latest
   status is `rejected`; `close_quest` reserves one reward for each, with the same cap of free slots.
   (b) `appeal()` works on a closed quest for 7 days from the close (`appeal_until`). (c) Once that window
   lapses anyone can call `settle_closed_quest` to release the leftover reserve, so a claimant who never
   appeals cannot lock the creator's funds forever. Filed appeals stay funded until resolved. (d) A rejected claimant
   with attempts left may also keep retrying through `submit_proof` during that window; a pass is paid
   from the reserve. Closing still stops everyone else, including anyone who never submitted.
1b. *(v0.6) Appeals depended on human moderators alone.* A silent or unavailable moderator could hold a
   claimant's appeal, and the reserved escrow, indefinitely. After 14 days without a decision anyone may
   call `escalate_appeal`: validators re-run the same consensus check on the appealed link and resolve
   it on-chain. Humans can still decide earlier, and the creator still cannot reject. Honest limits:
   the fallback re-uses the same model check that rejected the claimant, so it is a safety valve for
   inaction, not an independent court; and moderators/owner remain trusted roles for the first 14 days.
   The frontend also stops presenting ACCEPTED as final: it reports "accepted, waiting for finality" and
   follows the transaction to FINALIZED in the background.
2. *Expired quests could only be closed by their creator or a moderator.* If neither acted, the
   unclaimed escrow sat there. After the deadline anyone may close the quest. The refund still
   goes only to the creator, so permissionless closing cannot redirect funds.
3. *Creators could claim their own quest*, which pays them from their own escrow but inflates the
   winners count and the public "completed" statistics. Blocked.

**Gaps in what counts as proof**

4. *Keywords were matched anywhere on the page.* On X and GitHub, a sidebar, a trending list or
   someone else's comment can contain "#genlayer". The required keywords must now appear in the same
   region of the page as the wallet code (the 1,500 characters before to 2,500 after it), i.e. the
   post the claimant wrote.
5. *The page text could close the `<page>` block in the LLM prompt.* Untrusted text containing
   `</page>` could end the data section and append instructions. Page text now has every
   `<page>` / `</page>` removed before it is placed in the prompt.
6. *The prompt did not say where the code must be.* Because `get_verification_code` is public,
   anyone can compute anyone's code and paste it into a reply under someone else's post, and the
   rendered page would then contain the code next to content they did not write. The prompt now
   requires the code to be part of the main post / PR description / page content and to answer false
   if it appears only in a reply, comment, quote or sidebar. **This reduces the attack but is a
   model judgement, not a proof**; see "Honest limitations" in CONTRACT.md.

**Gaps in input validation**

7. *Deadlines were only shape-checked.* "zzzz-zz-zzTzz:zz:zzZ" passed, and because deadlines are
   compared as strings it sorts after every real date, so the quest silently never expired. Deadlines
   now need digits where digits belong and every field is range-checked. `extend_deadline` also has to
   move into the future, not just past the old deadline.
8. *The clock was compared raw.* If the runtime reports fractional seconds or an offset, a deadline
   in the current second compared wrongly. The clock is normalised to a whole-second UTC string first.
9. *Generic-quest domains could be IP literals or internal names* (`10.0.0.5`, `printer.local`,
   `169.254.169.254`), asking validators to render private addresses on a creator's say-so. Domains must
   now be public DNS names ending in an alphabetic TLD, and `localhost` / `.local` / `.internal` / `.lan`
   and similar are refused.
10. *The keyword list had no overall length cap* (only per keyword and per count), so a string of
    thousands of commas was accepted and parsed. Capped at 250 characters.

**Gaps in usability that forced a UI to guess**

11. *A rejection did not say why.* The claimant could not tell "your post doesn't contain the code" from
    "the model decided it doesn't meet the criteria". The verdict now carries a reason from a fixed set
    (`code_not_found`, `keyword_missing:<keyword>`, `criteria_not_met`), stored per submission and
    returned by `get_submission`. It is safe in consensus because the reasons are fixed strings and the
    keyword is the first missing one from the quest's own list.
12. *No way to find appeals.* A moderator had no way to discover pending appeals short of scanning every
    quest and every user. Appeals are now appended to a log, and `get_pending_appeals` pages through
    the unresolved ones.
13. *No per-user listing.* `get_user_submissions` returns the quests a user has touched, and
    `get_submission` returns status, attempts, reason and the user's code in one call.
14. *No way to cancel an ownership proposal* (a wrong address stayed pending). `cancel_ownership_transfer`
    added. `get_config` now reports the pending owner, the fee cap and the contract version.

**Deliberately not changed**

- Fees, the three-attempt limit, the appeal model, pull payments and the strict-equality consensus rule
  are unchanged. Nothing here alters what a legitimate claimant or creator could do under v0.3.
- Appeals can still be approved by the creator and rejected only by a moderator.
- `get_open_quests` does not filter out expired quests. Views cannot rely on the contract clock, so
  clients should hide quests whose deadline has passed (the frontend does).
- The wallet code is still public and still a 16-hex-character prefix of the address. It proves intent,
  not authorship; see the limitation above.

**How it was checked.** The suite grew from 41 to 87 direct tests. They run under `gltest` direct mode
where installed, and also with no dependencies at all through `tests/sim/run_direct_tests.py`, which runs
the same test file against an in-process model of the runtime. `tests/sim/test_schema_rules.py` statically
re-checks the v0.2/v0.3 schema pitfalls (SDK types only on the public surface, `Address` for addresses, no
`datetime`, no undeclared transfers) against the new methods. None of this replaces running the suite on
a real GenLayer node.
