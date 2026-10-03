# Quest Verifier — contract v0.4 and frontend

A bounty board for tasks a plain smart contract can't check: a tweet, a merged pull request, a page on a
named domain. The creator escrows the whole reward pool, claimants prove ownership with a wallet-bound code,
and GenLayer validators read the page and judge it. This repository holds the upgraded contract, its tests,
and a React frontend.

```
contracts/QuestVerifier.py      the Intelligent Contract (v0.4)
CONTRACT.md                     the contract's own README (methods, design, limitations)
DECISION.md                     design record, including "v0.4: a hardening pass"
tests/direct/                   gltest direct-mode tests (87) + conftest
tests/sim/                      dependency-free runner, runtime model, schema-rule checks, vector generator
tests/vectors/quest_vectors.json  values produced by the real contract, used by the frontend tests
src/                            the frontend
```

## What changed in the contract (v0.3 to v0.4)

v0.3 fixed deployability. v0.4 is a review of what the contract does once it is used. Full reasoning is in
`DECISION.md`; in short:

- **Money and locks:** a pending appeal no longer freezes `close_quest` (the escrow it could still win stays
  reserved, the rest is refunded, and the reserve is released as appeals resolve); anyone can close an expired
  quest (the refund still goes only to the creator); creators can't claim their own quest.
- **Appeal protection (v0.5):** closing a quest can no longer strip a rejected claimant of the retry/appeal right.
  The reward they could still win stays reserved, and their remaining retries and `appeal()` stay open for 7 days
  after the close (nobody new can enter a closed quest). After that anyone can release the reserve to the creator
  with `settle_closed_quest`; filed appeals stay funded until resolved.
- **Appeal fallback (v0.6):** a filed appeal that no moderator decides within 14 days can be escalated by
  anyone to validator consensus (`escalate_appeal`), so human review is no longer a single point of failure.
  The UI reports a transaction as accepted first and as final only once it reaches FINALIZED.
- **CI:** `.github/workflows/ci.yml` runs the contract and schema tests, checks the test vectors are current,
  prints the contract's SHA-256, then typechecks, tests and builds the frontend. See `CHANGELOG.md`.
- **Proof quality:** required keywords must sit next to the wallet code, not anywhere on the page; page text
  can't close the `<page>` block in the LLM prompt; the prompt requires the code to be in the main post.
- **Validation:** deadlines are strictly validated (v0.3 accepted `zzzz-zz-zzTzz:zz:zzZ`, which silently never
  expired); the clock is normalised to whole seconds; generic-quest domains can't be IPs or internal names;
  keyword input has an overall cap.
- **Usability:** a rejection records why (`code_not_found`, `keyword_missing:<kw>`, `criteria_not_met`); new views
  `get_submission`, `get_user_submissions`, `get_pending_appeals`; `cancel_ownership_transfer`; richer
  `get_config` and `get_quest`.

Fees, the three-attempt limit, the appeal model, pull payments and the consensus rule are unchanged.

## The frontend

Vite + React + TypeScript + Tailwind, talking to the chain through `genlayer-js`. No backend.

- **Quests**: browse and filter, sort by reward, open one to see the requirement, the reward, free slots and deadline.
- **Claim**: your personal code with a copy button, link validation identical to the contract's, the consensus wait
  notice, the reason a check failed in plain language, attempts left, and an appeal form.
- **Post a quest**: kind, requirement, optional required words, reward, winners, deadline; shows the exact deposit
  including the protocol fee before you send it.
- **Manage a quest** (creator): pause, add rewards, extend the deadline, close and refund, approve appeals.
- **My activity**: withdrawable balance, quests you tried, quests you posted.
- **Moderation**: the appeal queue; owner tools (fee, moderators, pause, two-step ownership with cancel).
- **Wallet**: the same as the other apps in this series. Built-in encrypted wallet, any EVM browser wallet (EIP-6963,
  legacy, vendor globals), silent reconnect, automatic switch to the GenLayer network, the wallet's own add-network
  popup, a wrong-network dialog, a network menu, and deep links for phones.

## Setup

1. Deploy `contracts/QuestVerifier.py` (constructor argument `fee_bps`, 0 to 1000; 0 means no fee).
2. `cp .env.example .env`; set `VITE_CONTRACT_ADDRESS` (and `VITE_GENLAYER_NETWORK` if not Studio).
3. `npm install && npm run dev`.
4. Vercel: add the same env vars, then redeploy (Vite bakes them in at build).

Contract address can also be pasted in the app's network menu without a rebuild.

## Tests

| Command | What it runs | Needs |
| --- | --- | --- |
| `npm run test:contract` | all 87 direct tests against the contract, using an in-process model of the runtime | Python 3 only |
| `npm run test:schema` | 12 static checks for the schema-introspection mistakes behind v0.2's "Could not load contract schema" | Python 3 only |
| `npm test` | 125 frontend tests, including every rule checked against values the real contract produced | `npm install` |
| `gltest` | the same 87 direct tests on the real GenLayer test tooling | gltest installed |
| `npm run test:vectors` | regenerates `tests/vectors/quest_vectors.json` from the contract | Python 3 only |

Honest limits of the tests:

- `tests/sim` is a model of the runtime, not the runtime. It runs the same test file and the same contract source,
  but it can't exercise consensus, validators disagreeing, real page rendering, or GenLayer's own schema loader.
  Run the suite under `gltest` and deploy to Studio before relying on the contract.
- A few v0.4 tests read `direct_vm.llm_prompts` / `direct_vm.balance` guarded by `hasattr`. Under the model they
  assert; under gltest they assert only if the test VM exposes those attributes, and are otherwise skipped silently.
- The fixes were mutation-checked: each was deliberately broken in a copy of the contract and the suite was
  confirmed to fail. Two weak tests found that way were strengthened.
- The frontend was written and logic-tested without installing its dependencies or running a build. Run
  `npm install && npm run typecheck && npm run dev` first.
