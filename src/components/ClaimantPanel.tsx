import { useState } from "react";
import { useWallet } from "../context/WalletContext";
import { useRunner } from "../hooks/useRunner";
import { useSubmission } from "../hooks/data";
import { usePolled } from "../hooks/usePolled";
import { appeal, escalateAppeal, getAppeal, submitProof } from "../lib/client";
import type { QuestData } from "../lib/types";
import {
  KIND_META,
  MAX_ATTEMPTS,
  MAX_NOTE,
  QuestInputError,
  appealWindowOpen,
  nowIsoSeconds,
  explainReason,
  isCreator,
  questState,
  validateProofUrl,
  verificationCode,
} from "../lib/quests";
import { Button, Card, CopyButton, HelperText, Input, Label, Notice, Spinner, Textarea } from "./ui";
import { SubmissionBadge } from "./quest";
import { WalletPanel } from "./WalletPanel";

function ConsensusNotice() {
  return (
    <div className="flex items-start gap-3 rounded-md border border-beacon-400/30 bg-beacon-400/10 p-3.5">
      <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-beacon-400 opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-beacon-400" />
      </span>
      <div className="text-[13px] leading-relaxed">
        <p className="font-medium text-mist-100">Validators are reading your page…</p>
        <p className="mt-1 text-mist-400">
          Each validator opens your link, looks for your code, then judges the page against the requirement. This usually takes a few
          minutes. Keep this tab open.
        </p>
      </div>
    </div>
  );
}

export function ClaimantPanel({ quest: q, refresh }: { quest: QuestData; refresh: () => Promise<void> }) {
  const wallet = useWallet();
  const me = wallet.address;
  const sub = useSubmission(q.id, me);
  const refreshAll = async () => {
    await Promise.all([refresh(), sub.refresh()]);
  };
  const { busy, run } = useRunner(refreshAll);

  const [url, setUrl] = useState("");
  const [appealUrl, setAppealUrl] = useState("");
  const [note, setNote] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [appealError, setAppealError] = useState<string | null>(null);

  const state = questState(q);
  const s = sub.data;
  const status = s?.status ?? "none";

  const appealRecord = usePolled(() => getAppeal(q.id, me as string), [q.id, me, status], 20_000, !!me && status === "appeal_pending");

  const header = <h3 className="font-display text-[18px] text-mist-100">Claim this reward</h3>;

  if (!me) {
    return (
      <Card className="space-y-4 p-5">
        {header}
        <p className="text-[13px] leading-relaxed text-mist-400">
          Connect a wallet to get your personal verification code. Reading quests never needs one.
        </p>
        <WalletPanel />
      </Card>
    );
  }

  if (isCreator(q, me)) {
    return (
      <Card className="p-5">
        {header}
        <div className="mt-3">
          <Notice tone="info">You created this quest, so you can't claim its reward. Use the creator controls instead.</Notice>
        </div>
      </Card>
    );
  }

  const code = s?.code ?? verificationCode(q.id, me);
  const attemptsLeft = s?.attempts_left ?? MAX_ATTEMPTS;
  const retryAfterClose = state === "closed" && status === "rejected" && appealWindowOpen(q);
  const canSubmit = (state === "open" && (status === "none" || status === "rejected") && attemptsLeft > 0) || (retryAfterClose && attemptsLeft > 0);
  const canAppeal = status === "rejected" && appealWindowOpen(q);
  const anyBusy = busy !== null;

  const onSubmit = async () => {
    setSubmitError(null);
    let clean: string;
    try {
      clean = validateProofUrl(q, url);
    } catch (e) {
      setSubmitError(e instanceof QuestInputError ? e.message : "That link isn't valid.");
      return;
    }
    await run("submit", (signer) => submitProof(signer, q.id, clean), "Check finished", "See the result below.");
  };

  const onAppeal = async () => {
    setAppealError(null);
    let clean: string;
    try {
      clean = validateProofUrl(q, appealUrl);
    } catch (e) {
      setAppealError(e instanceof QuestInputError ? e.message : "That link isn't valid.");
      return;
    }
    if (note.length > MAX_NOTE) {
      setAppealError(`Keep the note under ${MAX_NOTE} characters.`);
      return;
    }
    const ok = await run("appeal", (signer) => appeal(signer, q.id, clean, note.trim()), "Appeal filed", "A moderator will review it.");
    if (ok) setNote("");
  };

  return (
    <Card className="space-y-5 p-5">
      <div className="flex items-start justify-between gap-3">
        {header}
        {sub.loading && !s ? <Spinner /> : <SubmissionBadge status={status} />}
      </div>

      {status === "approved" && (
        <Notice tone="success" title="Approved">
          Your reward is credited to your balance. Open My activity to withdraw it.
        </Notice>
      )}

      {status === "appeal_pending" && (
        <div className="space-y-3">
          <Notice tone="info" title="Waiting for a moderator">
            Your appeal is in the queue. If it is approved the reward is credited to your balance.
          </Notice>
          {appealRecord.data?.escalate_after && (
            <p className="text-[13px] text-mist-500">
              If no moderator decides by {appealRecord.data.escalate_after.replace("T", " ").replace("Z", " UTC")}, anyone can send this appeal to the validators.
            </p>
          )}
          {appealRecord.data?.escalate_after && nowIsoSeconds() > appealRecord.data.escalate_after && (
            <Button
              variant="secondary"
              className="w-full"
              loading={busy === "escalate"}
              disabled={!!busy}
              onClick={() => run("escalate", (s) => escalateAppeal(s, q.id, me as string), "Appeal escalated", "Validators re-checked your proof.")}
            >
              Escalate to validators
            </Button>
          )}
          {appealRecord.data?.url && (
            <p className="break-all font-mono text-[12px] text-mist-500">Appealed link: {appealRecord.data.url}</p>
          )}
        </div>
      )}

      {status === "appeal_rejected" && (
        <Notice tone="error" title="Appeal rejected">
          A moderator reviewed your proof and confirmed the rejection. Nothing more can be done on this quest.
        </Notice>
      )}

      {state !== "open" && status !== "approved" && status !== "appeal_pending" && status !== "appeal_rejected" && (
        <Notice tone="warn">
          {state === "closed" && (status === "rejected" && canAppeal ? "This quest is closed, but your rejection is protected: you can still retry (if attempts remain) or appeal." : "This quest is closed.")}
          {state === "expired" && "This quest has passed its deadline."}
          {state === "paused" && "This quest is paused. Check back soon."}
          {state === "full" && "All of this quest's rewards have been claimed."}
        </Notice>
      )}

      {status === "rejected" && s?.reason && (
        <Notice tone="error" title="Your last attempt was rejected">
          {explainReason(s.reason)}
        </Notice>
      )}

      {(canSubmit || canAppeal) && (
        <div className="space-y-2">
          <Label hint="unique to you and this quest">Your verification code</Label>
          <div className="flex items-center justify-between gap-3 rounded-md border border-beacon-400/40 bg-beacon-400/10 px-3.5 py-3">
            <code className="break-all font-mono text-[15px] text-beacon-200">{code}</code>
            <CopyButton value={code} label="Copy" />
          </div>
          <HelperText>
            Put this exact code in the text of your {q.kind === "tweet" ? "post" : q.kind === "github_pr" ? "pull request description" : "page"}.
            It must be part of what you wrote, not a reply or a comment on someone else's content.
            {q.must_include.length > 0 && (
              <>
                {" "}
                The same post must also contain: <span className="font-mono text-mist-200">{q.must_include.join(", ")}</span>.
              </>
            )}
          </HelperText>
        </div>
      )}

      {canSubmit && (
        <div className="space-y-3 border-t border-deep-700 pt-4">
          <div>
            <Label hint={`${attemptsLeft} of ${MAX_ATTEMPTS} attempts left`}>Link to your proof</Label>
            <Input className="font-mono" placeholder={KIND_META[q.kind].example} value={url} onChange={(e) => { setUrl(e.target.value); setSubmitError(null); }} spellCheck={false} autoCapitalize="off" />
            <HelperText>{KIND_META[q.kind].proofHint} Links are matched case-sensitively at the start, so keep https:// lowercase.</HelperText>
          </div>
          {busy === "submit" && <ConsensusNotice />}
          {submitError && <HelperText tone="error">{submitError}</HelperText>}
          <Button className="w-full" loading={busy === "submit"} disabled={anyBusy} onClick={onSubmit}>
            Submit proof
          </Button>
          <HelperText>
            If the page can't be loaded at all, the transaction is cancelled and no attempt is used. A page that loads but doesn't qualify
            costs one attempt.
          </HelperText>
        </div>
      )}

      {status === "rejected" && attemptsLeft === 0 && (
        <Notice tone="warn" title="No attempts left">
          You can still appeal to a human moderator below.
        </Notice>
      )}

      {canAppeal && (
        <div className="space-y-3 border-t border-deep-700 pt-4">
          <div>
            <Label>Appeal to a moderator</Label>
            <p className="text-[13px] leading-relaxed text-mist-400">
              If the automatic check got it wrong, a person will look at your proof. A moderator can approve or reject. The quest creator can
              only approve.
            </p>
          </div>
          <Input className="font-mono" placeholder="Link to the proof you want reviewed" value={appealUrl} onChange={(e) => { setAppealUrl(e.target.value); setAppealError(null); }} spellCheck={false} autoCapitalize="off" />
          <div>
            <Textarea rows={3} placeholder="Why should this be approved? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <p className={`mt-1 text-right font-mono text-[11px] ${note.length > MAX_NOTE ? "text-ember-400" : "text-mist-600"}`}>
              {note.length} / {MAX_NOTE}
            </p>
          </div>
          {appealError && <HelperText tone="error">{appealError}</HelperText>}
          <Button variant="secondary" className="w-full" loading={busy === "appeal"} disabled={anyBusy} onClick={onAppeal}>
            File appeal
          </Button>
        </div>
      )}
    </Card>
  );
}
