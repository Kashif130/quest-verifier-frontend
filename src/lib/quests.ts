import type { ConfigData, QuestData, QuestKind, SubmissionStatus } from "./types";
import { fromWei, isValidAmount, toWei } from "./format";

// ---------------------------------------------------------------------------
// Constants mirrored from contracts/QuestVerifier.py (v0.5). The contract stays the source of
// truth; these exist so the UI can reject bad input before it costs a transaction.
// ---------------------------------------------------------------------------

export const MAX_TITLE = 100;
export const MAX_CRITERIA = 500;
export const MAX_NOTE = 300;
export const MAX_URL = 300;
export const MAX_KEYWORDS = 5;
export const MAX_KEYWORD_LEN = 40;
export const MAX_KEYWORDS_RAW = 250;
export const MAX_WINNERS_CAP = 1000;
export const MAX_ATTEMPTS = 3;
export const CODE_HEX_LEN = 16;
export const PAGE_LIMIT = 50;

export const KINDS: QuestKind[] = ["tweet", "github_pr", "generic"];

export const KIND_META: Record<QuestKind, { label: string; blurb: string; proofHint: string; example: string }> = {
  tweet: {
    label: "Tweet",
    blurb: "A post on X that meets your criteria.",
    proofHint: "Link to your post on x.com or twitter.com.",
    example: "https://x.com/yourname/status/1234567890123456789",
  },
  github_pr: {
    label: "GitHub pull request",
    blurb: "A pull request that does what you asked for.",
    proofHint: "Link to the pull request on github.com.",
    example: "https://github.com/owner/repo/pull/42",
  },
  generic: {
    label: "A page on your domain",
    blurb: "Any page on a website you name, such as a blog post or a review.",
    proofHint: "Link to a page on the quest's domain.",
    example: "https://example.com/my-review",
  },
};

export const ALLOWED_PREFIXES: Record<"tweet" | "github_pr", string[]> = {
  tweet: ["https://x.com/", "https://twitter.com/"],
  github_pr: ["https://github.com/"],
};

const BAD_URL_CHARS = [" ", "\n", "\r", "\t", '"', "'", "<", ">", "\\", "`"];
const FORBIDDEN_DOMAINS = ["localhost"];
const FORBIDDEN_DOMAIN_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".test", ".invalid"];

// ---------------------------------------------------------------------------
// Pure helpers — each one is a direct port of the contract function of the same purpose and is
// checked against the real contract's output in src/lib/quests.test.ts.
// ---------------------------------------------------------------------------

/** Fixed-width ISO-8601 UTC with range-checked fields (`_valid_iso`). */
export function validIso(iso: string): boolean {
  if (iso.length !== 20) return false;
  if (iso[4] !== "-" || iso[7] !== "-" || iso[10] !== "T" || iso[13] !== ":" || iso[16] !== ":" || iso[19] !== "Z") {
    return false;
  }
  for (const i of [0, 1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18]) {
    if (!/[0-9]/.test(iso[i])) return false;
  }
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const hour = Number(iso.slice(11, 13));
  const minute = Number(iso.slice(14, 16));
  const second = Number(iso.slice(17, 19));
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  return true;
}

/** A public DNS name; IP literals and internal suffixes refused (`_valid_domain`). */
export function validDomain(d: string): boolean {
  if (d.length < 3 || d.length > 100 || !d.includes(".")) return false;
  if (d.startsWith(".") || d.endsWith(".") || d.includes("..") || d.startsWith("-")) return false;
  if (!/^[a-z0-9.-]+$/.test(d)) return false;
  if (FORBIDDEN_DOMAINS.includes(d)) return false;
  if (FORBIDDEN_DOMAIN_SUFFIXES.some((s) => d.endsWith(s))) return false;
  const labels = d.split(".");
  for (const label of labels) {
    if (label === "" || label.startsWith("-") || label.endsWith("-") || label.length > 63) return false;
  }
  const tld = labels[labels.length - 1];
  return tld.length >= 2 && tld.length <= 24 && /^[a-z]+$/.test(tld);
}

export class QuestInputError extends Error {}

/** Splits a comma-separated list the way the contract does (`_parse_keywords`). Throws on bad input. */
export function parseKeywords(raw: string): string[] {
  if (raw.length > MAX_KEYWORDS_RAW) throw new QuestInputError("The keyword list is too long.");
  const out: string[] = [];
  const seen: string[] = [];
  for (const part of raw.split(",")) {
    const kw = part.trim();
    if (kw === "") continue;
    if (kw.length > MAX_KEYWORD_LEN) throw new QuestInputError(`Each keyword can be at most ${MAX_KEYWORD_LEN} characters.`);
    if (!seen.includes(kw.toLowerCase())) {
      out.push(kw);
      seen.push(kw.toLowerCase());
    }
  }
  if (out.length > MAX_KEYWORDS) throw new QuestInputError(`Use at most ${MAX_KEYWORDS} keywords.`);
  return out;
}

function normUrl(url: string): string {
  return url.trim().split("#")[0].split("?")[0].replace(/\/+$/, "").toLowerCase();
}

/** The identity of a proof for the "one proof, one claim" rule (`_proof_id`). Throws on the wrong shape. */
export function proofId(kind: QuestKind, url: string): string {
  const u = normUrl(url);
  if (kind === "tweet") {
    if (!u.includes("/status/")) throw new QuestInputError("That isn't a link to a post (it needs /status/<number>).");
    const tail = u.split("/status/").slice(1).join("/status/");
    let digits = "";
    for (const ch of tail) {
      if (ch >= "0" && ch <= "9") digits += ch;
      else break;
    }
    if (digits === "") throw new QuestInputError("That post link has no status number.");
    return `tweet:${digits}`;
  }
  if (kind === "github_pr") {
    const rest = u.includes("github.com/") ? u.split("github.com/").slice(1).join("github.com/") : "";
    const parts = rest.split("/");
    if (parts.length < 4 || parts[2] !== "pull" || !/^[0-9]+$/.test(parts[3])) {
      throw new QuestInputError("That isn't a pull request link (expected github.com/owner/repo/pull/<number>).");
    }
    return `pr:${parts.slice(0, 4).join("/")}`;
  }
  return `url:${u}`;
}

function hostOk(url: string, domain: string): boolean {
  if (!url.startsWith("https://")) return false;
  const host = url.slice("https://".length).split("/")[0].split("?")[0].toLowerCase();
  if (host.includes("@") || host.includes(":") || host === "") return false;
  return host === domain || host.endsWith(`.${domain}`);
}

/** Same checks as the contract's `_validate_url`. Returns the URL with any #fragment removed. */
export function validateProofUrl(quest: Pick<QuestData, "kind" | "domain">, rawUrl: string): string {
  const url = rawUrl.trim();
  if (url === "" || url.length > MAX_URL) throw new QuestInputError(`The link must be between 1 and ${MAX_URL} characters.`);
  if (BAD_URL_CHARS.some((c) => url.includes(c))) throw new QuestInputError("The link contains characters that aren't allowed (spaces, quotes or brackets).");
  const clean = url.split("#")[0];
  if (quest.kind === "generic") {
    if (!hostOk(clean, quest.domain)) throw new QuestInputError(`The link must be an https:// page on ${quest.domain}.`);
  } else if (!ALLOWED_PREFIXES[quest.kind].some((p) => clean.startsWith(p))) {
    throw new QuestInputError(
      quest.kind === "tweet"
        ? "The link must start with https://x.com/ or https://twitter.com/ (lowercase)."
        : "The link must start with https://github.com/ (lowercase).",
    );
  }
  proofId(quest.kind, clean);
  return clean;
}

/** The wallet-bound verification code (`_code`). */
export function verificationCode(questId: number, address: string): string {
  const a = address.toLowerCase();
  const tail = a.startsWith("0x") ? a.slice(2, 2 + CODE_HEX_LEN) : a.slice(0, CODE_HEX_LEN);
  return `GLQ-${questId}-${tail}`;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export function protocolFee(totalWei: bigint, feeBps: number): bigint {
  return (totalWei * BigInt(feeBps)) / 10000n;
}

export interface Deposit {
  reward: bigint;
  total: bigint;
  fee: bigint;
  deposit: bigint;
}

export function depositFor(rewardWei: bigint, winners: number, feeBps: number): Deposit {
  const total = rewardWei * BigInt(winners);
  const fee = protocolFee(total, feeBps);
  return { reward: rewardWei, total, fee, deposit: total + fee };
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** The browser's clock as the contract writes it: a whole-second UTC string. */
export function nowIsoSeconds(date: Date = new Date()): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

/** `datetime-local` input value (local time) to the contract's UTC string, or null if blank/invalid. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return nowIsoSeconds(d);
}

export function isoToLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDeadline(iso: string): string {
  if (!iso) return "No deadline";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Time left until `iso` as a short label, or null if no deadline. */
export function timeLeft(iso: string, now: Date = new Date()): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now.getTime();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return "Expired";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m left`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
}

// ---------------------------------------------------------------------------
// Quest state
// ---------------------------------------------------------------------------

export type QuestState = "open" | "paused" | "closed" | "expired" | "full";

/** What a visitor can do with a quest right now. Expiry is judged by the browser's clock, so it is a hint. */
export function questState(q: QuestData, now: Date = new Date()): QuestState {
  if (q.closed) return "closed";
  if (q.deadline !== "" && nowIsoSeconds(now) > q.deadline) return "expired";
  if (q.paused) return "paused";
  if (q.slots_left <= 0) return "full";
  return "open";
}

/** A rejected claimant can retry (attempts permitting) and appeal while the quest is open, or after a close until `appeal_until` lapses. */
export function appealWindowOpen(q: QuestData, now: Date = new Date()): boolean {
  if (!q.closed) return true;
  return q.appeal_until === "" || nowIsoSeconds(now) <= q.appeal_until;
}

export const STATE_LABEL: Record<QuestState, string> = {
  open: "Open",
  paused: "Paused",
  closed: "Closed",
  expired: "Expired",
  full: "All rewards claimed",
};

export function rewardLabel(q: Pick<QuestData, "reward">, symbol: string): string {
  return `${fromWei(q.reward, 5)} ${symbol}`;
}

// ---------------------------------------------------------------------------
// Submission wording
// ---------------------------------------------------------------------------

export const SUBMISSION_LABEL: Record<SubmissionStatus, string> = {
  none: "Not submitted",
  rejected: "Rejected",
  approved: "Approved",
  appeal_pending: "Appeal pending",
  appeal_rejected: "Appeal rejected",
};

/** Plain-language explanation of a stored failure reason. */
export function explainReason(reason: string): string {
  if (!reason) return "";
  if (reason === "code_not_found") {
    return "Your verification code wasn't found on the page. Put the exact code in the text of your post, pull request or page, then submit again.";
  }
  if (reason.startsWith("keyword_missing:")) {
    const kw = reason.slice("keyword_missing:".length);
    return `The required keyword "${kw}" wasn't found near your code. It has to appear in the same post as the code, not elsewhere on the page.`;
  }
  if (reason === "criteria_not_met") {
    return "The page had your code, but the validators judged that it doesn't clearly meet the quest's requirement. Compare it with the criteria, or appeal to a moderator.";
  }
  return reason;
}

export const APPEAL_STATES: SubmissionStatus[] = ["rejected"];

/** True if `a` is the creator of `q` (addresses compared case-insensitively). */
export function isCreator(q: Pick<QuestData, "creator">, address?: string | null): boolean {
  return !!address && q.creator.toLowerCase() === address.toLowerCase();
}

// ---------------------------------------------------------------------------
// Create-quest form
// ---------------------------------------------------------------------------

export interface QuestForm {
  title: string;
  kind: QuestKind;
  criteria: string;
  keywords: string;
  domain: string;
  winners: string;
  reward: string; // native units per winner
  deadlineLocal: string; // datetime-local value or ""
}

export function emptyQuestForm(): QuestForm {
  return { title: "", kind: "tweet", criteria: "", keywords: "", domain: "", winners: "1", reward: "", deadlineLocal: "" };
}

export interface NormalizedQuest {
  title: string;
  kind: QuestKind;
  criteria: string;
  mustInclude: string;
  domain: string;
  winners: number;
  rewardWei: bigint;
  deadline: string;
}

export function validateQuestForm(
  f: QuestForm,
  cfg: Pick<ConfigData, "max_winners_cap">,
  now: Date = new Date(),
): { error: string | null; value: NormalizedQuest | null } {
  const fail = (error: string) => ({ error, value: null });
  const title = f.title.trim();
  if (title.length < 1 || title.length > MAX_TITLE) return fail(`The title must be 1-${MAX_TITLE} characters.`);
  const criteria = f.criteria.trim();
  if (criteria.length < 1 || criteria.length > MAX_CRITERIA) return fail(`The requirement must be 1-${MAX_CRITERIA} characters.`);

  let keywords: string[];
  try {
    keywords = parseKeywords(f.keywords);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Invalid keywords.");
  }

  let domain = "";
  if (f.kind === "generic") {
    domain = f.domain.trim().toLowerCase();
    if (!validDomain(domain)) {
      return fail("Enter a public domain such as example.com (no https://, no IP address, no internal names).");
    }
  }

  if (!/^\d+$/.test(f.winners.trim())) return fail("The number of winners must be a whole number.");
  const winners = Number(f.winners.trim());
  if (winners < 1 || winners > cfg.max_winners_cap) return fail(`Winners must be between 1 and ${cfg.max_winners_cap}.`);

  if (!isValidAmount(f.reward)) return fail("The reward per winner must be an amount greater than zero.");
  const rewardWei = toWei(f.reward);

  let deadline = "";
  if (f.deadlineLocal) {
    const iso = localInputToIso(f.deadlineLocal);
    if (!iso || !validIso(iso)) return fail("That deadline isn't a valid date and time.");
    if (iso <= nowIsoSeconds(now)) return fail("The deadline must be in the future.");
    deadline = iso;
  }

  return {
    error: null,
    value: { title, kind: f.kind, criteria, mustInclude: keywords.join(","), domain, winners, rewardWei, deadline },
  };
}
