export type QuestKind = "tweet" | "github_pr" | "generic";

/** Mirrors the dict returned by `get_quest`. Wei values are decimal strings. */
export interface QuestData {
  id: number;
  creator: string;
  title: string;
  kind: QuestKind;
  criteria: string;
  must_include: string[];
  domain: string;
  reward: string;
  max_winners: number;
  winners: number;
  slots_left: number;
  escrow: string;
  deadline: string; // ISO-8601 UTC, "" = none
  closed: boolean;
  paused: boolean;
  pending_appeals: number;
  rejected_awaiting_appeal: number;
  appeal_until: string; // set once closed: last second a rejected claimant may appeal, "" = no limit
}

export type SubmissionStatus = "none" | "rejected" | "approved" | "appeal_pending" | "appeal_rejected";

/** `get_submission` */
export interface SubmissionData {
  quest_id: number;
  status: SubmissionStatus;
  attempts_used: number;
  attempts_left: number;
  reason: string;
  code: string;
}

/** One row of `get_user_submissions` */
export interface UserSubmissionRow {
  quest_id: number;
  status: SubmissionStatus;
  attempts_left: number;
  reason: string;
}

export interface Page<T> {
  items: T[];
  next_offset: number;
  total: number;
}

export interface PendingAppeal {
  quest_id: number;
  user: string;
  url: string;
  note: string;
}

export interface ConfigData {
  owner: string;
  fee_bps: number;
  global_paused: boolean;
  quest_count: number;
  max_attempts: number;
  max_winners_cap: number;
  max_fee_bps: number;
  pending_owner: string;
  version: string;
}

export interface UserStats {
  completed: number;
  total_earned: string;
  claimable: string;
}

export interface AppealRecord {
  status: SubmissionStatus;
  url: string;
  note: string;
  filed_at: string;
  escalate_after: string; // after this moment anyone may escalate the appeal to validators
}

export type WalletMode = "none" | "burner-locked" | "burner-unlocked" | "injected";

/** A usable signer: an address, optionally paired with the private key that controls it
 *  (present for an unlocked burner wallet, absent for an injected/extension wallet, where
 *  the extension itself holds the key and signs via the browser). */
export interface Signer {
  address: `0x${string}`;
  privateKey?: `0x${string}`;
  /** The EIP-1193 provider of the injected wallet the user picked (absent for the burner). */
  provider?: import("./injectedWallets").Eip1193Provider;
}
