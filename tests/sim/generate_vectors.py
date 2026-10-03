"""
Writes tests/vectors/quest_vectors.json using the REAL contract's own helper functions, so the
TypeScript tests can prove the frontend validates and derives exactly what the contract does
(verification codes, proof ids, URL / domain / deadline / keyword rules, deposit maths).

    python3 tests/sim/generate_vectors.py
"""
import importlib.util
import inspect
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

import genlayer_sim as sim  # noqa: E402

sim.install()
sim.reset_vm()
spec = importlib.util.spec_from_file_location("qv_contract", ROOT / "contracts" / "QuestVerifier.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

cls = next(v for v in vars(mod).values() if inspect.isclass(v) and issubclass(v, sim.Contract) and v is not sim.Contract)
contract = cls.__new__(cls)


def attempt(fn, *args):
    try:
        return {"ok": fn(*args)}
    except sim.UserError:
        return {"error": True}


ISO = [
    "2099-12-31T23:59:59Z", "2026-01-01T00:00:00Z", "2000-01-01T00:00:00Z", "1999-12-31T23:59:59Z",
    "zzzz-zz-zzTzz:zz:zzZ", "2099-13-01T00:00:00Z", "2099-00-10T00:00:00Z", "2099-01-00T00:00:00Z",
    "2099-01-32T00:00:00Z", "2099-01-01T24:00:00Z", "2099-01-01T00:60:00Z", "2099-01-01T00:00:60Z",
    "2099-01-01 00:00:00Z", "2099-01-01T00:00:00+0", "2099-01-01T00:00:00", "", "not-a-date",
    "2099-01-01T00:00:00.5Z", "20990101T000000Z!!!!!",
]
DOMAINS = [
    "example.com", "docs.example.co.uk", "my-site.dev", "a1.b2.example.io", "EXAMPLE.com",
    "127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.169.254", "localhost", "printer.local",
    "api.internal", "box.localhost", "nas.lan", "example.c0m", "example.x", "-bad.example.com",
    "bad-.example.com", "exa mple.com", "example..com", "example.com.", "ex@mple.com", "a.b", "ab",
    ".example.com", "example.com-", "x" * 64 + ".com", "example." + "a" * 25,
]
KEYWORDS = [
    "", "#genlayer", "#genlayer, #web3", "a,b,c,d,e", "a,b,c,d,e,f", " A , a , B ", ",,,", "x" * 40, "x" * 41,
    "," * 400, "word1,Word1,WORD1", "#a, #b ,#c", "x" * 250, "y" * 251,
]
TX = "1000000000000000001"
PROOFS = [
    ("tweet", f"https://x.com/alice/status/{TX}"),
    ("tweet", f"https://twitter.com/Alice/status/{TX}?s=20"),
    ("tweet", f"https://x.com/alice/status/{TX}/"),
    ("tweet", f"https://x.com/alice/status/{TX}#frag"),
    ("tweet", f"https://x.com/alice/status/{TX}abc"),
    ("tweet", "https://x.com/alice/status/"),
    ("tweet", "https://x.com/alice"),
    ("github_pr", "https://github.com/octocat/hello-world/pull/42"),
    ("github_pr", "https://github.com/OctoCat/Hello-World/pull/42/files"),
    ("github_pr", "https://github.com/octocat/hello-world/issues/1"),
    ("github_pr", "https://github.com/octocat/hello-world/pull/x"),
    ("github_pr", "https://github.com/octocat/pull/42"),
    ("generic", "https://example.com/proof/1"),
    ("generic", "https://Example.com/Proof/1/?q=1"),
]
URL_CASES = [
    # (kind, domain, url)
    ("tweet", "", f"https://x.com/alice/status/{TX}"),
    ("tweet", "", f"https://twitter.com/alice/status/{TX}"),
    ("tweet", "", f"https://X.com/alice/status/{TX}"),
    ("tweet", "", f"http://x.com/alice/status/{TX}"),
    ("tweet", "", f"https://x.com/alice/status/{TX}#top"),
    ("tweet", "", "https://github.com/octocat/hello-world/pull/42"),
    ("tweet", "", f"https://x.com/alice/status/{TX} extra"),
    ("tweet", "", "https://x.com/alice/status/1\"2"),
    ("tweet", "", ""),
    ("tweet", "", "https://x.com/" + "a" * 300),
    ("github_pr", "", "https://github.com/octocat/hello-world/pull/42"),
    ("github_pr", "", "https://github.com/octocat/hello-world/issues/1"),
    ("github_pr", "", f"https://x.com/alice/status/{TX}"),
    ("generic", "example.com", "https://example.com/proof/1"),
    ("generic", "example.com", "https://blog.example.com/p"),
    ("generic", "example.com", "https://not-example.com/p"),
    ("generic", "example.com", "https://example.com.evil.org/p"),
    ("generic", "example.com", "http://example.com/p"),
    ("generic", "example.com", "https://user@example.com/p"),
    ("generic", "example.com", "https://example.com:8443/p"),
]
ADDRESSES = ["0x" + "a1" * 20, "0x" + "AB" * 20, "0x0123456789abcdef0123456789abcdef01234567"]
CODES = [(q, a) for q in (0, 7, 123456) for a in ADDRESSES]
DEPOSITS = [(100, 3, 0), (100, 3, 500), (1, 1, 1000), (1234567890123456789, 7, 250), (10**18, 1000, 1000), (3, 3, 333)]

out = {
    "iso": [{"input": s, "valid": mod._valid_iso(s)} for s in ISO],
    "domain": [{"input": d, "valid": mod._valid_domain(d)} for d in DOMAINS],
    "keywords": [{"input": k, **attempt(mod._parse_keywords, k)} for k in KEYWORDS],
    "proofId": [{"kind": k, "url": u, **attempt(mod._proof_id, k, u)} for k, u in PROOFS],
    "code": [
        {"questId": q, "address": a, "code": contract._code(q, sim.Address(a))} for q, a in CODES
    ],
}

validate = []
for kind, domain, url in URL_CASES:
    quest = mod.Quest(
        creator=sim.Address("0x" + "b2" * 20), title="t", kind=kind, criteria="c", must_include="",
        domain=domain, reward=sim.u256(1), max_winners=sim.u256(1), winners=sim.u256(0), escrow=sim.u256(1),
        deadline="", closed=False, paused=False, appeal_until="",
    )
    validate.append({"kind": kind, "domain": domain, "url": url, **attempt(contract._validate_url, quest, url)})
out["validateUrl"] = validate

deposits = []
for reward, winners, bps in DEPOSITS:
    contract.fee_bps = sim.u256(bps)
    total = reward * winners
    fee = contract._fee_for(total)
    deposits.append({"reward": str(reward), "winners": winners, "feeBps": bps, "total": str(total), "fee": str(fee), "deposit": str(total + fee)})
out["deposit"] = deposits

path = ROOT / "tests" / "vectors" / "quest_vectors.json"
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("wrote", {k: len(v) for k, v in out.items()}, "to", path)
