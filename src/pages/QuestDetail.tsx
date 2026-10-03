import { Link, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { useConfig, useQuest } from "../hooks/data";
import { KIND_META, formatDeadline, questState, timeLeft } from "../lib/quests";
import { NATIVE_SYMBOL, fromWei, shortAddress } from "../lib/format";
import { AddressPill, Card, CopyButton, HelperText, InfoRow, Notice, SectionTitle, Spinner } from "../components/ui";
import { KindTag, RewardFigure, SlotsMeter, StateBadge, Ticket } from "../components/quest";
import { ClaimantPanel } from "../components/ClaimantPanel";
import { CreatorPanel } from "../components/CreatorPanel";

export function QuestDetail() {
  const { id } = useParams<{ id: string }>();
  const questId = id !== undefined && /^\d+$/.test(id) ? Number(id) : null;
  const wallet = useWallet();
  const { data: q, loading, error, refresh } = useQuest(questId);
  const cfg = useConfig();

  if (questId === null) return <p className="text-[14px] text-mist-400">That isn't a quest number.</p>;
  if (loading && !q) {
    return (
      <div className="flex items-center gap-2 text-[14px] text-mist-400">
        <Spinner /> Loading quest…
      </div>
    );
  }
  if (!q) {
    const missing = !!error && /quest not found/i.test(error);
    return (
      <Card className="space-y-2 p-6">
        <p className="font-display text-[20px] text-mist-100">{missing ? `No quest #${questId}` : "Couldn't load this quest"}</p>
        <p className="text-[13px] text-mist-400">
          {missing ? "There's no quest with that number. " : (error ?? "Try again in a moment. ")}
          <Link to="/quests" className="text-beacon-300 hover:text-beacon-200">
            Browse quests
          </Link>
          .
        </p>
      </Card>
    );
  }

  const state = questState(q);
  const left = timeLeft(q.deadline);
  const config = cfg.data;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Link to="/quests" className="inline-flex items-center gap-1.5 text-[13px] text-mist-500 hover:text-mist-100">
          <ArrowLeft className="h-3.5 w-3.5" /> All quests
        </Link>
        <div className="flex items-start justify-between gap-3">
          <p className="font-mono text-[12px] text-mist-500">Quest #{q.id}</p>
          <button onClick={() => void refresh()} className="inline-flex items-center gap-1.5 rounded-md border border-deep-600 px-2.5 py-1.5 text-[12px] text-mist-400 hover:border-beacon-400">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      <Ticket
        className="coin-in"
        top={
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <KindTag kind={q.kind} />
              <StateBadge state={state} />
              {q.pending_appeals > 0 && <span className="text-[12px] text-amber-300">{q.pending_appeals} appeal{q.pending_appeals === 1 ? "" : "s"} waiting</span>}
            </div>
            <h1 className="font-display text-[30px] leading-tight text-mist-100">{q.title}</h1>
          </div>
        }
        bottom={
          <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-end">
            <RewardFigure reward={q.reward} size="lg" />
            <div className="space-y-2">
              <SlotsMeter quest={q} />
              <p className="text-[12px] text-mist-500">
                {q.deadline ? `${formatDeadline(q.deadline)}${left ? ` · ${left}` : ""}` : "No deadline"}
              </p>
            </div>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="space-y-6">
          <Card className="p-6">
            <SectionTitle>What you need to do</SectionTitle>
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-mist-100">{q.criteria}</p>
            {q.must_include.length > 0 && (
              <div className="mt-4 border-t border-deep-700 pt-4">
                <p className="text-[12px] text-mist-500">Must also contain, in the same post as your code</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {q.must_include.map((k) => (
                    <span key={k} className="rounded-md border border-deep-600 bg-deep-850 px-2 py-1 font-mono text-[12px] text-mist-200">
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4 border-t border-deep-700 pt-4 text-[13px] leading-relaxed text-mist-400">
              <p>
                <span className="text-mist-200">{KIND_META[q.kind].label}.</span> {KIND_META[q.kind].proofHint}
                {q.kind === "generic" && (
                  <>
                    {" "}
                    Domain: <span className="font-mono text-mist-200">{q.domain}</span>
                  </>
                )}
              </p>
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle>How the check works</SectionTitle>
            <ol className="space-y-3 text-[13px] leading-relaxed text-mist-400">
              <li>
                <span className="text-mist-200">1. Your code.</span> Every claimant has a personal code derived from their wallet. The contract looks for it
                on your page in plain code, so no amount of persuasive wording can stand in for it.
              </li>
              <li>
                <span className="text-mist-200">2. Required words.</span> Any required keywords must sit in the same post as your code.
              </li>
              <li>
                <span className="text-mist-200">3. The judgement.</span> Validators independently read the page and answer one question: does it clearly meet
                the requirement? They must all agree.
              </li>
              <li>
                <span className="text-mist-200">4. Not a verdict.</span> If the page can't be loaded, nothing is recorded and you keep your attempt. A rejection
                costs one of three attempts, and you can then appeal to a person.
              </li>
            </ol>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-6">
          <ClaimantPanel quest={q} refresh={refresh} />
          <CreatorPanel quest={q} config={config} refresh={refresh} />

          <Card className="p-5">
            <h3 className="font-display text-[16px] text-mist-100">Quest details</h3>
            <dl className="mt-2">
              <InfoRow label="Posted by">
                <AddressPill address={q.creator} you={!!wallet.address && q.creator.toLowerCase() === wallet.address.toLowerCase()} />
              </InfoRow>
              <InfoRow label="Reward each">
                <span className="font-mono">
                  {fromWei(q.reward, 6)} {NATIVE_SYMBOL}
                </span>
              </InfoRow>
              <InfoRow label="Still in escrow">
                <span className="font-mono">
                  {fromWei(q.escrow, 6)} {NATIVE_SYMBOL}
                </span>
              </InfoRow>
              <InfoRow label="Claimed">
                {q.winners} of {q.max_winners}
              </InfoRow>
              <InfoRow label="Creator">
                <span className="font-mono text-[12px]">{shortAddress(q.creator, 6)}</span>
              </InfoRow>
            </dl>
            <div className="mt-3 flex justify-end">
              <CopyButton value={window.location.href} label="Copy link" />
            </div>
          </Card>

          {config?.global_paused && (
            <Notice tone="warn" title="The whole contract is paused">
              New quests, submissions and appeals are on hold. Withdrawals still work.
            </Notice>
          )}
          <HelperText>Escrow is held by the contract from the moment a quest is posted, so the reward is there when you qualify.</HelperText>
        </div>
      </div>
    </div>
  );
}
