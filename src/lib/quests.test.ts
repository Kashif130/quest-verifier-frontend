import { describe, expect, it } from "vitest";
import vectors from "../../tests/vectors/quest_vectors.json";
import {
  QuestInputError,
  appealWindowOpen,
  depositFor,
  emptyQuestForm,
  explainReason,
  isCreator,
  localInputToIso,
  nowIsoSeconds,
  parseKeywords,
  proofId,
  protocolFee,
  questState,
  timeLeft,
  validDomain,
  validIso,
  validateProofUrl,
  validateQuestForm,
  verificationCode,
} from "./quests";
import type { QuestKind, QuestData } from "./types";

const NOW = new Date("2099-01-15T12:00:00.000Z");
const CFG = { max_winners_cap: 1000 };

function quest(over: Partial<QuestData> = {}): QuestData {
  return {
    id: 0, creator: "0x" + "b2".repeat(20), title: "t", kind: "tweet", criteria: "c", must_include: [], domain: "",
    reward: "100", max_winners: 3, winners: 1, slots_left: 2, escrow: "200", deadline: "", closed: false, paused: false,
    pending_appeals: 0, rejected_awaiting_appeal: 0, appeal_until: "", ...over,
  };
}

// Every expectation below was produced by the contract's own helper functions
// (tests/sim/generate_vectors.py), so these prove the frontend and contract agree.
describe("agreement with the contract", () => {
  for (const v of vectors.iso) {
    it(`deadline ${JSON.stringify(v.input)}`, () => {
      expect(validIso(v.input)).toBe(v.valid);
    });
  }

  for (const v of vectors.domain) {
    it(`domain ${JSON.stringify(v.input).slice(0, 40)}`, () => {
      expect(validDomain(v.input)).toBe(v.valid);
    });
  }

  for (const v of vectors.keywords) {
    it(`keywords ${JSON.stringify(v.input).slice(0, 30)}`, () => {
      if ("error" in v) {
        let threw = false;
        try {
          parseKeywords(v.input);
        } catch (e) {
          threw = e instanceof QuestInputError;
        }
        expect(threw).toBe(true);
      } else {
        expect(parseKeywords(v.input)).toEqual(v.ok);
      }
    });
  }

  for (const v of vectors.proofId) {
    it(`proof id ${v.kind} ${v.url.slice(0, 50)}`, () => {
      if ("error" in v) {
        let threw = false;
        try {
          proofId(v.kind as QuestKind, v.url);
        } catch (e) {
          threw = e instanceof QuestInputError;
        }
        expect(threw).toBe(true);
      } else {
        expect(proofId(v.kind as QuestKind, v.url)).toBe(v.ok);
      }
    });
  }

  for (const v of vectors.code) {
    it(`code for quest ${v.questId} ${v.address.slice(0, 8)}`, () => {
      expect(verificationCode(v.questId, v.address)).toBe(v.code);
    });
  }

  for (const v of vectors.validateUrl) {
    it(`url ${v.kind} ${v.url.slice(0, 50)}`, () => {
      const q = { kind: v.kind as QuestKind, domain: v.domain };
      if ("error" in v) {
        let threw = false;
        try {
          validateProofUrl(q, v.url);
        } catch (e) {
          threw = e instanceof QuestInputError;
        }
        expect(threw).toBe(true);
      } else {
        expect(validateProofUrl(q, v.url)).toBe(v.ok);
      }
    });
  }

  for (const v of vectors.deposit) {
    it(`deposit ${v.reward} x ${v.winners} @ ${v.feeBps}bps`, () => {
      const d = depositFor(BigInt(v.reward), v.winners, v.feeBps);
      expect(d.total.toString()).toBe(v.total);
      expect(d.fee.toString()).toBe(v.fee);
      expect(d.deposit.toString()).toBe(v.deposit);
    });
  }
});

describe("fees", () => {
  it("rounds the fee down like the contract's integer division", () => {
    expect(protocolFee(999n, 500).toString()).toBe("49");
    expect(protocolFee(100n, 0).toString()).toBe("0");
  });
});

describe("clock helpers", () => {
  it("writes whole-second UTC strings", () => {
    expect(nowIsoSeconds(NOW)).toBe("2099-01-15T12:00:00Z");
    expect(validIso(nowIsoSeconds(new Date("2099-01-15T12:00:00.987Z")))).toBe(true);
  });

  it("converts a local input to a valid contract deadline", () => {
    const iso = localInputToIso("2099-06-01T10:30");
    expect(iso === null ? false : validIso(iso)).toBe(true);
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("garbage")).toBeNull();
  });

  it("describes time left", () => {
    expect(timeLeft("", NOW)).toBeNull();
    expect(timeLeft("2099-01-15T11:00:00Z", NOW)).toBe("Expired");
    expect(timeLeft("2099-01-15T12:30:00Z", NOW)).toBe("30m left");
    expect(timeLeft("2099-01-15T20:00:00Z", NOW)).toBe("8h left");
    expect(timeLeft("2099-01-25T12:00:00Z", NOW)).toBe("10d left");
  });
});

describe("quest state", () => {
  it("is open by default", () => {
    expect(questState(quest(), NOW)).toBe("open");
  });
  it("closed beats everything", () => {
    expect(questState(quest({ closed: true, paused: true, deadline: "2099-01-01T00:00:00Z" }), NOW)).toBe("closed");
  });
  it("expired when the deadline has passed", () => {
    expect(questState(quest({ deadline: "2099-01-15T11:59:59Z" }), NOW)).toBe("expired");
    expect(questState(quest({ deadline: "2099-01-15T12:00:01Z" }), NOW)).toBe("open");
  });
  it("paused and full", () => {
    expect(questState(quest({ paused: true }), NOW)).toBe("paused");
    expect(questState(quest({ slots_left: 0, winners: 3 }), NOW)).toBe("full");
  });
});

describe("appeal window", () => {
  it("is always open while the quest is open", () => {
    expect(appealWindowOpen(quest(), NOW)).toBe(true);
  });
  it("stays open on a closed quest until appeal_until, then lapses", () => {
    const closed = quest({ closed: true, appeal_until: "2099-01-15T12:00:00Z" });
    expect(appealWindowOpen(closed, NOW)).toBe(true);
    expect(appealWindowOpen(closed, new Date("2099-01-15T12:00:01Z"))).toBe(false);
  });
  it("has no limit when appeal_until is empty", () => {
    expect(appealWindowOpen(quest({ closed: true, appeal_until: "" }), NOW)).toBe(true);
  });
});

describe("creator check", () => {
  it("ignores address case", () => {
    const q = quest({ creator: "0x" + "AB".repeat(20) });
    expect(isCreator(q, "0x" + "ab".repeat(20))).toBe(true);
    expect(isCreator(q, "0x" + "cd".repeat(20))).toBe(false);
    expect(isCreator(q, null)).toBe(false);
  });
});

describe("failure reasons", () => {
  it("explains each reason the contract can record", () => {
    expect(explainReason("")).toBe("");
    expect(explainReason("code_not_found")).toContain("verification code");
    expect(explainReason("keyword_missing:#genlayer")).toContain("#genlayer");
    expect(explainReason("criteria_not_met")).toContain("requirement");
  });
});

describe("create-quest form", () => {
  const good = { ...emptyQuestForm(), title: "Tweet about us", criteria: "A post praising the product", winners: "3", reward: "1.5" };

  it("accepts a valid quest", () => {
    const r = validateQuestForm(good, CFG, NOW);
    expect(r.error).toBeNull();
    expect(r.value?.winners).toBe(3);
    expect(r.value?.rewardWei.toString()).toBe("1500000000000000000");
    expect(r.value?.deadline).toBe("");
  });

  it("rejects bad fields with a reason", () => {
    expect(validateQuestForm({ ...good, title: "" }, CFG, NOW).error).toContain("title");
    expect(validateQuestForm({ ...good, criteria: "x".repeat(501) }, CFG, NOW).error).toContain("requirement");
    expect(validateQuestForm({ ...good, winners: "0" }, CFG, NOW).error).toContain("Winners");
    expect(validateQuestForm({ ...good, winners: "1001" }, CFG, NOW).error).toContain("Winners");
    expect(validateQuestForm({ ...good, winners: "two" }, CFG, NOW).error).toContain("whole number");
    expect(validateQuestForm({ ...good, reward: "0" }, CFG, NOW).error).toContain("reward");
    expect(validateQuestForm({ ...good, keywords: "a,b,c,d,e,f" }, CFG, NOW).error).toContain("keywords");
  });

  it("requires a public domain for generic quests and ignores it for the others", () => {
    expect(validateQuestForm({ ...good, kind: "generic", domain: "10.0.0.5" }, CFG, NOW).error).toContain("domain");
    const ok = validateQuestForm({ ...good, kind: "generic", domain: "Docs.Example.com " }, CFG, NOW);
    expect(ok.value?.domain).toBe("docs.example.com");
    expect(validateQuestForm({ ...good, kind: "tweet", domain: "10.0.0.5" }, CFG, NOW).value?.domain).toBe("");
  });

  it("normalises keywords the way the contract will", () => {
    expect(validateQuestForm({ ...good, keywords: " #A , #a , #B " }, CFG, NOW).value?.mustInclude).toBe("#A,#B");
  });

  it("rejects a deadline that is not in the future", () => {
    expect(validateQuestForm({ ...good, deadlineLocal: "2000-01-01T00:00" }, CFG, NOW).error).toContain("future");
    expect(validateQuestForm({ ...good, deadlineLocal: "2100-01-01T00:00" }, CFG, NOW).value?.deadline.length).toBe(20);
  });
});
