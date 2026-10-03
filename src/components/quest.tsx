import { Link } from "react-router-dom";
import { Github, Globe, Twitter } from "lucide-react";
import type { ReactNode } from "react";
import type { QuestData, QuestKind, SubmissionStatus } from "../lib/types";
import { KIND_META, STATE_LABEL, isCreator, questState, timeLeft } from "../lib/quests";
import type { QuestState } from "../lib/quests";
import { NATIVE_SYMBOL, fromWei, shortAddress } from "../lib/format";

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

const STATE_STYLE: Record<QuestState, { dot: string; text: string; ring: string }> = {
  open: { dot: "bg-jade-500", text: "text-jade-400", ring: "border-jade-500/40 bg-jade-500/10" },
  paused: { dot: "bg-amber-500", text: "text-amber-300", ring: "border-amber-500/40 bg-amber-500/10" },
  closed: { dot: "bg-mist-600", text: "text-mist-400", ring: "border-deep-600 bg-deep-800" },
  expired: { dot: "bg-mist-600", text: "text-mist-400", ring: "border-deep-600 bg-deep-800" },
  full: { dot: "bg-beacon-400", text: "text-beacon-300", ring: "border-beacon-400/40 bg-beacon-400/10" },
};

export function StateBadge({ state }: { state: QuestState }) {
  const s = STATE_STYLE[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${s.ring} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {STATE_LABEL[state]}
    </span>
  );
}

const SUB_STYLE: Record<SubmissionStatus, string> = {
  none: "border-deep-600 bg-deep-800 text-mist-400",
  rejected: "border-ember-500/40 bg-ember-500/10 text-ember-400",
  approved: "border-jade-500/40 bg-jade-500/10 text-jade-400",
  appeal_pending: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  appeal_rejected: "border-ember-500/40 bg-ember-500/10 text-ember-400",
};

const SUB_LABEL: Record<SubmissionStatus, string> = {
  none: "Not submitted",
  rejected: "Rejected",
  approved: "Approved",
  appeal_pending: "Appeal pending",
  appeal_rejected: "Appeal rejected",
};

export function SubmissionBadge({ status }: { status: SubmissionStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${SUB_STYLE[status]}`}>
      {SUB_LABEL[status]}
    </span>
  );
}

const KIND_ICON: Record<QuestKind, typeof Twitter> = { tweet: Twitter, github_pr: Github, generic: Globe };

export function KindTag({ kind }: { kind: QuestKind }) {
  const Icon = KIND_ICON[kind];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-deep-600 bg-deep-900/70 px-2.5 py-0.5 text-[12px] text-mist-200">
      <Icon className="h-3.5 w-3.5 text-beacon-300" strokeWidth={1.8} />
      {KIND_META[kind].label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The ticket: a bounty stub with a perforated divider. The two half-circles are real elements
// clipped by the card's overflow, so they read as notches cut into the edge.
// ---------------------------------------------------------------------------

export function Ticket({ top, bottom, className = "" }: { top: ReactNode; bottom: ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-deep-700 bg-deep-900/90 shadow-tag ${className}`}>
      <div className="p-5 pb-4">{top}</div>
      <div className="relative border-t border-dashed border-deep-600">
        <span className="absolute -left-[11px] -top-[11px] h-[22px] w-[22px] rounded-full border border-deep-700 bg-deep-950" />
        <span className="absolute -right-[11px] -top-[11px] h-[22px] w-[22px] rounded-full border border-deep-700 bg-deep-950" />
      </div>
      <div className="p-5 pt-4">{bottom}</div>
    </div>
  );
}

export function RewardFigure({ reward, size = "md" }: { reward: string; size?: "md" | "lg" }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`font-display text-beacon-400 ${size === "lg" ? "text-[40px] leading-none" : "text-[26px] leading-none"}`}>
        {fromWei(reward, 5)}
      </span>
      <span className="text-[13px] text-mist-400">{NATIVE_SYMBOL} each</span>
    </div>
  );
}

export function SlotsMeter({ quest }: { quest: Pick<QuestData, "winners" | "max_winners" | "slots_left"> }) {
  const pct = quest.max_winners > 0 ? Math.min(100, (quest.winners / quest.max_winners) * 100) : 0;
  return (
    <div>
      <div className="h-1.5 overflow-hidden rounded-full bg-deep-800" aria-hidden>
        <div className="h-full rounded-full bg-beacon-400 transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-[12px] text-mist-500">
        {quest.slots_left} of {quest.max_winners} reward{quest.max_winners === 1 ? "" : "s"} left
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card for lists
// ---------------------------------------------------------------------------

export function QuestCard({ quest: q, me }: { quest: QuestData; me?: string | null }) {
  const state = questState(q);
  const left = timeLeft(q.deadline);
  return (
    <Link to={`/quests/${q.id}`} className="group block h-full">
      <Ticket
        className="h-full transition-colors group-hover:border-beacon-400"
        top={
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <KindTag kind={q.kind} />
              <StateBadge state={state} />
            </div>
            <h3 className="font-display text-[19px] leading-snug text-mist-100">{q.title}</h3>
            <p className="line-clamp-2 text-[13px] leading-relaxed text-mist-400">{q.criteria}</p>
          </div>
        }
        bottom={
          <div className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <RewardFigure reward={q.reward} />
              {left && state === "open" && <span className="text-[12px] text-mist-500">{left}</span>}
            </div>
            <SlotsMeter quest={q} />
            <div className="flex items-center justify-between text-[12px] text-mist-500">
              <span className="font-mono">{shortAddress(q.creator)}</span>
              {isCreator(q, me) && <span className="rounded-full bg-beacon-400/15 px-2 py-0.5 text-[11px] text-beacon-300">Yours</span>}
            </div>
          </div>
        }
      />
    </Link>
  );
}
