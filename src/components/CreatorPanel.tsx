import { useState } from "react";
import { useWallet } from "../context/WalletContext";
import { useRunner } from "../hooks/useRunner";
import { useIsModerator, usePendingAppeals } from "../hooks/data";
import { addWinners, closeQuest, extendDeadline, resolveAppeal, setQuestPaused } from "../lib/client";
import type { ConfigData, QuestData } from "../lib/types";
import { MAX_WINNERS_CAP, depositFor, formatDeadline, isCreator, localInputToIso, nowIsoSeconds, questState, validIso } from "../lib/quests";
import { NATIVE_SYMBOL, fromWei, fromWeiExact } from "../lib/format";
import { Button, Card, HelperText, Input, Label, Notice } from "./ui";
import { AppealItem } from "./AppealItem";

export function CreatorPanel({
  quest: q,
  config,
  refresh,
}: {
  quest: QuestData;
  config: ConfigData | null;
  refresh: () => Promise<void>;
}) {
  const wallet = useWallet();
  const me = wallet.address;
  const appeals = usePendingAppeals();
  const mod = useIsModerator(me);
  const refreshAll = async () => {
    await Promise.all([refresh(), appeals.refresh()]);
  };
  const { busy, run } = useRunner(refreshAll);
  const [extra, setExtra] = useState("1");
  const [deadlineLocal, setDeadlineLocal] = useState("");
  const [error, setError] = useState<string | null>(null);

  const state = questState(q);
  const creator = isCreator(q, me);
  const isMod = !!mod.data;
  const anyBusy = busy !== null;
  const mine = (appeals.data ?? []).filter((a) => a.quest_id === q.id);

  const extraN = /^\d+$/.test(extra.trim()) ? Number(extra.trim()) : 0;
  const feeBps = config?.fee_bps ?? 0;
  const topUp = extraN > 0 ? depositFor(BigInt(q.reward), extraN, feeBps) : null;
  const capLeft = MAX_WINNERS_CAP - q.max_winners;

  // Anyone may close an expired quest; the refund still goes only to the creator.
  const strangerCanClose = !creator && !isMod && state === "expired" && !q.closed;

  if (!me || (!creator && !isMod && mine.length === 0 && !strangerCanClose)) return null;

  const onTopUp = async () => {
    setError(null);
    if (!topUp || extraN < 1 || extraN > capLeft) {
      setError(`Add between 1 and ${Math.max(capLeft, 0)} more rewards.`);
      return;
    }
    await run("topup", (s) => addWinners(s, q.id, extraN, topUp.deposit), "Rewards added", `${extraN} more reward${extraN === 1 ? "" : "s"} funded.`);
  };

  const onExtend = async () => {
    setError(null);
    const iso = localInputToIso(deadlineLocal);
    if (!iso || !validIso(iso)) {
      setError("Pick a valid new deadline.");
      return;
    }
    if (iso <= nowIsoSeconds()) {
      setError("The new deadline must be in the future.");
      return;
    }
    if (q.deadline && iso <= q.deadline) {
      setError("The new deadline must be later than the current one.");
      return;
    }
    const ok = await run("extend", (s) => extendDeadline(s, q.id, iso), "Deadline extended");
    if (ok) setDeadlineLocal("");
  };

  return (
    <Card className="space-y-5 p-5">
      <h3 className="font-display text-[18px] text-mist-100">{creator ? "Manage this quest" : "Moderation"}</h3>

      {strangerCanClose && (
        <div className="space-y-2">
          <Notice tone="info">
            This quest's deadline has passed. Anyone can close it; the unclaimed escrow goes back to the creator, never to you.
          </Notice>
          <Button variant="secondary" className="w-full" loading={busy === "close"} disabled={anyBusy} onClick={() => run("close", (s) => closeQuest(s, q.id), "Quest closed", "The refund was credited to the creator.")}>
            Close expired quest
          </Button>
        </div>
      )}

      {creator && !q.closed && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={busy === "pause"}
              disabled={anyBusy}
              onClick={() => run("pause", (s) => setQuestPaused(s, q.id, !q.paused), q.paused ? "Quest resumed" : "Quest paused")}
            >
              {q.paused ? "Resume quest" : "Pause quest"}
            </Button>
          </div>

          <div className="space-y-2 border-t border-deep-700 pt-4">
            <Label hint={`${capLeft} more allowed`}>Add more rewards</Label>
            <div className="flex gap-2">
              <Input inputMode="numeric" className="max-w-[7rem]" value={extra} onChange={(e) => { setExtra(e.target.value); setError(null); }} />
              <Button variant="secondary" loading={busy === "topup"} disabled={anyBusy || !topUp} onClick={onTopUp}>
                Fund {extraN > 0 ? extraN : ""} more
              </Button>
            </div>
            {topUp && (
              <HelperText>
                You will send <span className="font-mono text-mist-200">{fromWeiExact(topUp.deposit)} {NATIVE_SYMBOL}</span> ({fromWei(topUp.total, 6)}{" "}
                for rewards{topUp.fee > 0n ? ` + ${fromWei(topUp.fee, 6)} protocol fee` : ""}).
              </HelperText>
            )}
          </div>

          {q.deadline && (
            <div className="space-y-2 border-t border-deep-700 pt-4">
              <Label hint={`now ${formatDeadline(q.deadline)}`}>Extend the deadline</Label>
              <div className="flex gap-2">
                <Input type="datetime-local" value={deadlineLocal} onChange={(e) => { setDeadlineLocal(e.target.value); setError(null); }} />
                <Button variant="secondary" loading={busy === "extend"} disabled={anyBusy || !deadlineLocal} onClick={onExtend}>
                  Extend
                </Button>
              </div>
              <HelperText>A deadline can only move later, never earlier.</HelperText>
            </div>
          )}

          {error && <HelperText tone="error">{error}</HelperText>}
        </>
      )}

      {(creator || isMod) && !q.closed && (
        <div className="space-y-2 border-t border-deep-700 pt-4">
          <Button
            variant="danger"
            className="w-full"
            loading={busy === "close"}
            disabled={anyBusy}
            onClick={() => {
              const reserved = q.pending_appeals + q.rejected_awaiting_appeal > 0;
              const msg = reserved
                ? "Close this quest? Escrow that pending appeals, and rejected claimants who may still appeal, could claim stays reserved (rejected claimants have 7 days after closing); everything else is refunded to the creator."
                : "Close this quest and refund all unclaimed escrow to the creator?";
              if (!window.confirm(msg)) return;
              void run("close", (s) => closeQuest(s, q.id), "Quest closed", "Unclaimed escrow was credited to the creator.");
            }}
          >
            Close quest and refund
          </Button>
          <HelperText>
            Refunds are credited to the creator's balance to withdraw.
            {q.pending_appeals + q.rejected_awaiting_appeal > 0 && " Rewards for appeals still waiting, or open to rejected claimants, stay reserved until resolved or the 7-day appeal window lapses."}
          </HelperText>
        </div>
      )}

      {q.closed && (creator || isMod) && (
        <Notice tone="info">
          This quest is closed.
          {Number(q.escrow) > 0 && " Part of the escrow is still reserved for appeals that are waiting."}
        </Notice>
      )}

      {mine.length > 0 && (
        <div className="space-y-3 border-t border-deep-700 pt-4">
          <Label>{mine.length} appeal{mine.length === 1 ? "" : "s"} waiting</Label>
          {mine.map((a) => (
            <AppealItem
              key={`${a.quest_id}:${a.user}`}
              appeal={a}
              quest={q}
              canApprove={creator || isMod}
              canReject={isMod}
              busy={busy}
              onResolve={(approve) =>
                run(
                  `${approve ? "approve" : "reject"}:${a.quest_id}:${a.user}`,
                  (s) => resolveAppeal(s, a.quest_id, a.user, approve),
                  approve ? "Appeal approved" : "Appeal rejected",
                  approve ? "The reward was credited to the claimant." : undefined,
                )
              }
            />
          ))}
          {creator && !isMod && (
            <HelperText>As the creator you can approve an appeal but not reject it. Only a moderator can reject.</HelperText>
          )}
        </div>
      )}
    </Card>
  );
}
