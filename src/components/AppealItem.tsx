import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import type { PendingAppeal, QuestData } from "../lib/types";
import { shortAddress } from "../lib/format";
import { Button } from "./ui";

/** One pending appeal with the actions the viewer is allowed to take. */
export function AppealItem({
  appeal: a,
  quest,
  canApprove,
  canReject,
  busy,
  onResolve,
}: {
  appeal: PendingAppeal;
  quest?: QuestData;
  canApprove: boolean;
  canReject: boolean;
  busy: string | null;
  onResolve: (approve: boolean) => void;
}) {
  const key = `${a.quest_id}:${a.user}`;
  const anyBusy = busy !== null;
  return (
    <div className="rounded-lg border border-deep-700 bg-deep-850 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/quests/${a.quest_id}`} className="font-display text-[16px] text-mist-100 hover:text-beacon-300">
            {quest ? quest.title : `Quest #${a.quest_id}`}
          </Link>
          <p className="mt-0.5 font-mono text-[12px] text-mist-500">Claimant {shortAddress(a.user, 6)}</p>
        </div>
      </div>
      {a.url && (
        <a
          href={a.url}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 inline-flex max-w-full items-center gap-1.5 break-all font-mono text-[12px] text-beacon-300 hover:text-beacon-200"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          {a.url}
        </a>
      )}
      {a.note && <p className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-mist-200">{a.note}</p>}
      {quest && (
        <p className="mt-3 text-[12px] leading-relaxed text-mist-500">
          Requirement: <span className="text-mist-400">{quest.criteria}</span>
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {canApprove && (
          <Button loading={busy === `approve:${key}`} disabled={anyBusy} onClick={() => onResolve(true)}>
            Approve and pay
          </Button>
        )}
        {canReject && (
          <Button variant="danger" loading={busy === `reject:${key}`} disabled={anyBusy} onClick={() => onResolve(false)}>
            Reject
          </Button>
        )}
        {!canApprove && !canReject && <p className="text-[12px] text-mist-500">Only the quest creator or a moderator can act on this.</p>}
      </div>
    </div>
  );
}
