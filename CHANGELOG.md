# Changelog

## v0.6 (contract `VERSION = "0.6"`, frontend 1.1.0)
- **Appeal fallback:** a filed appeal that no moderator or creator decides within 14 days can be escalated by
  anyone with `escalate_appeal(id, user)`. Validators re-run the consensus check on the appealed link and the
  appeal resolves on-chain (pass pays from the reserved escrow, fail rejects it).
- **Finality:** the frontend reports a transaction as "accepted, waiting for finality" and follows it to
  FINALIZED in the background, instead of presenting ACCEPTED as final.
- **CI:** `.github/workflows/ci.yml` runs contract + schema tests, checks vectors are current, prints the
  contract hash, then typechecks, tests and builds the frontend.
- 5 new contract tests (escalation blocked early, pass pays, fail releases reserve, needs a pending appeal,
  human decision wins).

## v0.5
- Closing a quest can no longer remove a rejected claimant's retry/appeal right. One reward per rejected claimant
  is reserved (capped by free slots); retries and `appeal()` stay open for 7 days after the close;
  `settle_closed_quest` releases the leftover reserve afterwards.

## Release fingerprint
`contracts/QuestVerifier.py` v0.6 SHA-256:
`631d2bb1c5873ff359ba92097e5cca315db6b58acb33813b358361a7873f1148`
(CI prints the same value; recompute with `sha256sum contracts/QuestVerifier.py`.)

## Known gaps
- No `package-lock.json` is committed and `genlayer-js` is on `latest`; generate and commit a lockfile and pin it.
- Local contract tests run on an in-process simulator; they are not a substitute for `gltest` against a real network.
- Moderators and the owner remain trusted roles during the first 14 days of an appeal.
