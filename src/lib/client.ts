import { createClient, createAccount } from "genlayer-js";
import { TransactionStatus, ExecutionResult } from "genlayer-js/types";
import { activeChain, CONTRACT_ADDRESS } from "./networks";
import type {
  AppealRecord,
  ConfigData,
  Page,
  PendingAppeal,
  QuestData,
  Signer,
  SubmissionData,
  UserStats,
  UserSubmissionRow,
} from "./types";
import { withActiveProvider } from "./injectedWallets";
import { ensureWalletOnActiveNetwork } from "./evm";

// A read-only client needs no signer at all: every view method is a free call with no wallet
// interaction, so the app can show quests before any wallet exists.
const readClient = createClient({ chain: activeChain });

/**
 * Builds a write-capable client bound to a specific signer for exactly one transaction.
 * `signer` is either a raw private key (burner wallet) or an already-connected injected
 * address string (MetaMask etc, per genlayer-js's own account-as-address pattern).
 */
function writeClientFor(signer: `0x${string}`, isPrivateKey: boolean) {
  const account: unknown = isPrivateKey ? createAccount(signer) : signer;
  return createClient({ chain: activeChain, account } as Parameters<typeof createClient>[0]);
}

export type { Signer };

/** Native-token balance for a wallet address (for a "have I got gas" hint in the UI). */
export async function readClientBalance(address: `0x${string}`): Promise<bigint> {
  const client = readClient as unknown as {
    getBalance: (args: { address: `0x${string}` }) => Promise<bigint>;
  };
  return client.getBalance({ address });
}

/**
 * genlayer-js can hand back decoded contract dicts as `Map`s and integers as `bigint`s. The UI
 * wants plain objects and numbers, so normalise once here: Map -> object, bigint -> number when
 * it is safe (otherwise a decimal string, which is what wei fields already are).
 */
function normalize(value: unknown): unknown {
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    value.forEach((v, k) => {
      obj[String(k)] = normalize(v);
    });
    return obj;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "bigint") {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= -BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  if (value && typeof value === "object") {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) obj[k] = normalize(v);
    return obj;
  }
  return value;
}

async function read<T>(functionName: string, args: unknown[] = []): Promise<T> {
  const raw = await readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    stateStatus: "accepted",
  });
  return normalize(raw) as T;
}

/** Shape of the fields we care about on a transaction receipt -- kept loose/`unknown`-cast at
 * the call site since we don't depend on genlayer-js's exact receipt type surface. */
interface ReceiptExecutionInfo {
  txExecutionResultName?: string;
  stderr?: string;
  result?: { stderr?: string };
  data?: { stderr?: string };
}

/** `submit_proof` runs a consensus round (validators render the proof page and run the
 * model), which takes far longer than a plain state change. */
const RETRIES_PLAIN = 60;
const RETRIES_CONSENSUS = 160;
const POLL_INTERVAL_MS = 3000;
/** Finality can lag acceptance by minutes, so it is tracked in the background, never blocking the UI. */
const RETRIES_FINALITY = 400;
const POLL_INTERVAL_FINALITY_MS = 6000;

async function write(
  signer: Signer,
  functionName: string,
  args: unknown[],
  opts: { valueWei?: bigint; consensus?: boolean } = {},
): Promise<string> {
  const isPrivateKey = !!signer.privateKey;

  // Auto network switch: a browser wallet must be on the GenLayer network to sign for it. If it
  // isn't, this triggers the wallet's own "switch network" / "add network" popup first.
  if (!isPrivateKey && signer.provider) {
    await ensureWalletOnActiveNetwork(signer.provider);
  }

  const client = writeClientFor(signer.privateKey ?? signer.address, isPrivateKey);
  // For an injected wallet, make sure the wallet the user actually picked is the one that signs
  // (matters when several extensions are installed). No-op for the burner wallet.
  const hash = await withActiveProvider(isPrivateKey ? null : (signer.provider ?? null), () =>
    client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName,
      args,
      value: opts.valueWei ?? 0n,
    }),
  );
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    retries: opts.consensus ? RETRIES_CONSENSUS : RETRIES_PLAIN,
    interval: POLL_INTERVAL_MS,
    fullTransaction: true,
  });

  // Consensus reaching ACCEPTED only means validators agreed on an outcome -- that outcome can
  // itself be a failed execution (a contract-side validation error, for instance). Treating
  // ACCEPTED alone as success would show a false "success" toast while nothing was written.
  const r = receipt as unknown as ReceiptExecutionInfo;
  if (r.txExecutionResultName === ExecutionResult.FINISHED_WITH_ERROR) {
    const detail = r.stderr || r.result?.stderr || r.data?.stderr;
    throw new Error(
      detail
        ? `The contract rejected this transaction: ${cleanContractError(detail)}`
        : "The contract rejected this transaction (execution failed). Double-check your inputs.",
    );
  }
  if (r.txExecutionResultName === ExecutionResult.NOT_VOTED) {
    throw new Error(
      "The network hasn't finished voting on this transaction yet. Wait a moment and check whether it went through before retrying.",
    );
  }
  return hash;
}

/**
 * ACCEPTED means validators agreed on an outcome, not that it is final: it can still be challenged.
 * Call this after a write to learn when the transaction reaches FINALIZED.
 * Resolves "finalized", or "pending" if it has not finalized within the polling budget (it may
 * still finalize later; the caller should say so rather than claim success or failure).
 */
export async function waitForFinality(hash: string): Promise<"finalized" | "pending"> {
  try {
    await readClient.waitForTransactionReceipt({
      hash: hash as Parameters<typeof readClient.waitForTransactionReceipt>[0]["hash"],
      status: TransactionStatus.FINALIZED,
      retries: RETRIES_FINALITY,
      interval: POLL_INTERVAL_FINALITY_MS,
    });
    return "finalized";
  } catch {
    return "pending";
  }
}

/** The contract prefixes its user-facing errors with [EXPECTED] / [TRANSIENT] / [LLM_ERROR]. */
function cleanContractError(detail: string): string {
  const match = detail.match(/\[(EXPECTED|TRANSIENT|LLM_ERROR)\]\s*([^\n]*)/);
  if (!match) return detail;
  const [, kind, message] = match;
  if (kind === "TRANSIENT") return `${message} (temporary — try again in a moment)`;
  if (kind === "LLM_ERROR") return `${message} (the consensus model call failed — try again)`;
  return message;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export const getConfig = () => read<ConfigData>("get_config");
export const getQuest = (id: number) => read<QuestData>("get_quest", [id]);
export const getQuests = (offset: number, limit: number) => read<Page<QuestData>>("get_quests", [offset, limit]);
export const getVerificationCode = (id: number, user: string) => read<string>("get_verification_code", [id, user]);
export const getSubmission = (id: number, user: string) => read<SubmissionData>("get_submission", [id, user]);
export const getUserSubmissions = (user: string, offset: number, limit: number) =>
  read<Page<UserSubmissionRow>>("get_user_submissions", [user, offset, limit]);
export const getPendingAppeals = (offset: number, limit: number) =>
  read<Page<PendingAppeal>>("get_pending_appeals", [offset, limit]);
export const getAppeal = (id: number, user: string) => read<AppealRecord>("get_appeal", [id, user]);
export const getUserStats = (user: string) => read<UserStats>("get_user_stats", [user]);
export const getClaimable = (user: string) => read<string>("get_claimable", [user]);
export const getRequiredDeposit = (rewardWei: bigint, winners: number) =>
  read<string>("get_required_deposit", [rewardWei, winners]);
export const isModerator = (user: string) => read<boolean>("is_moderator", [user]);

/** Walks a paged view until it reports no more pages. Capped so a huge registry can't hang the UI. */
async function walk<T>(fetchPage: (offset: number) => Promise<Page<T>>, cap: number): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  while (offset < cap) {
    const page = await fetchPage(offset);
    out.push(...page.items);
    if (page.next_offset <= offset || page.next_offset >= page.total) break;
    offset = page.next_offset;
  }
  return out;
}

/** Every quest, oldest first as stored. */
export const listAllQuests = (cap = 600, pageSize = 50) => walk((o) => getQuests(o, pageSize), cap);

/** Every quest this user has a submission on (the view scans `pageSize` quest ids per call). */
export const listAllUserSubmissions = (user: string, cap = 1000, pageSize = 50) =>
  walk((o) => getUserSubmissions(user, o, pageSize), cap);

/** Every unresolved appeal, oldest first. */
export const listAllPendingAppeals = (cap = 1000, pageSize = 50) => walk((o) => getPendingAppeals(o, pageSize), cap);

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface CreateQuestArgs {
  title: string;
  kind: string;
  criteria: string;
  mustInclude: string;
  domain: string;
  winners: number;
  rewardWei: bigint;
  deadline: string;
}

/** Attach exactly reward x winners + the protocol fee as `valueWei`. */
export const createQuest = (signer: Signer, a: CreateQuestArgs, valueWei: bigint) =>
  write(
    signer,
    "create_quest",
    [a.title, a.kind, a.criteria, a.mustInclude, a.domain, a.winners, a.rewardWei, a.deadline],
    { valueWei },
  );

export const addWinners = (signer: Signer, id: number, extra: number, valueWei: bigint) =>
  write(signer, "add_winners", [id, extra], { valueWei });

export const extendDeadline = (signer: Signer, id: number, newDeadline: string) =>
  write(signer, "extend_deadline", [id, newDeadline]);

export const setQuestPaused = (signer: Signer, id: number, paused: boolean) =>
  write(signer, "set_quest_paused", [id, paused]);

export const closeQuest = (signer: Signer, id: number) => write(signer, "close_quest", [id]);

/** Runs the consensus round: validators render the proof page and judge it. */
export const submitProof = (signer: Signer, id: number, url: string) =>
  write(signer, "submit_proof", [id, url], { consensus: true });

export const appeal = (signer: Signer, id: number, url: string, note: string) =>
  write(signer, "appeal", [id, url, note]);

export const resolveAppeal = (signer: Signer, id: number, user: string, approve: boolean) =>
  write(signer, "resolve_appeal", [id, user, approve]);

export const escalateAppeal = (signer: Signer, id: number, user: string) =>
  write(signer, "escalate_appeal", [id, user], { consensus: true });

export const withdraw = (signer: Signer) => write(signer, "withdraw", []);

export const setModerator = (signer: Signer, user: string, enabled: boolean) =>
  write(signer, "set_moderator", [user, enabled]);
export const setFeeBps = (signer: Signer, bps: number) => write(signer, "set_fee_bps", [bps]);
export const setGlobalPause = (signer: Signer, paused: boolean) => write(signer, "set_global_pause", [paused]);
export const proposeOwner = (signer: Signer, user: string) => write(signer, "propose_owner", [user]);
export const cancelOwnershipTransfer = (signer: Signer) => write(signer, "cancel_ownership_transfer", []);
export const acceptOwnership = (signer: Signer) => write(signer, "accept_ownership", []);
