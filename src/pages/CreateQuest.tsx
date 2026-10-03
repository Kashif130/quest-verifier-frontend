import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../context/WalletContext";
import { useToast } from "../context/ToastContext";
import { useConfig } from "../hooks/data";
import { createQuest, listAllQuests } from "../lib/client";
import { isContractConfigured } from "../lib/networks";
import {
  KINDS,
  KIND_META,
  MAX_CRITERIA,
  MAX_KEYWORDS,
  MAX_TITLE,
  depositFor,
  emptyQuestForm,
  parseKeywords,
  validateQuestForm,
} from "../lib/quests";
import type { QuestForm } from "../lib/quests";
import { NATIVE_SYMBOL, fromWei, fromWeiExact, isValidAmount, sameAddress, toWei } from "../lib/format";
import type { QuestKind } from "../lib/types";
import { Button, Card, HelperText, Input, Label, Notice, PageHeader, Textarea } from "../components/ui";
import { KindTag } from "../components/quest";
import { WalletPanel } from "../components/WalletPanel";

function Counter({ value, max }: { value: number; max: number }) {
  return <span className={`font-mono text-[11px] ${value > max ? "text-ember-400" : "text-mist-600"}`}>{value} / {max}</span>;
}

export function CreateQuest() {
  const wallet = useWallet();
  const toast = useToast();
  const navigate = useNavigate();
  const cfg = useConfig();

  const [form, setForm] = useState<QuestForm>(() => emptyQuestForm());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const set = (patch: Partial<QuestForm>) => setForm((f) => ({ ...f, ...patch }));

  const config = cfg.data;
  const feeBps = config?.fee_bps ?? 0;
  const winnersN = /^\d+$/.test(form.winners.trim()) ? Number(form.winners.trim()) : 0;
  const preview =
    isValidAmount(form.reward) && winnersN > 0 ? depositFor(toWei(form.reward), winnersN, feeBps) : null;

  let keywordCount = 0;
  let keywordError: string | null = null;
  try {
    keywordCount = parseKeywords(form.keywords).length;
  } catch (e) {
    keywordError = e instanceof Error ? e.message : "Invalid keywords.";
  }

  const submit = async () => {
    setFormError(null);
    if (!config) {
      setFormError("Couldn't read the protocol settings yet. Try again in a moment.");
      return;
    }
    const { error, value } = validateQuestForm(form, config);
    if (error || !value) {
      setFormError(error);
      return;
    }
    if (!wallet.signer) {
      setFormError("Connect a wallet first.");
      return;
    }
    const d = depositFor(value.rewardWei, value.winners, config.fee_bps);
    setSubmitting(true);
    try {
      await createQuest(wallet.signer, value, d.deposit);
      // The receipt doesn't reliably carry the new id, so find the newest quest this wallet posted with this title.
      let id: number | null = null;
      try {
        const fresh = await listAllQuests();
        for (let i = fresh.length - 1; i >= 0; i--) {
          if (sameAddress(fresh[i].creator, wallet.signer.address) && fresh[i].title === value.title) {
            id = fresh[i].id;
            break;
          }
        }
      } catch {
        /* fall back to the dashboard below */
      }
      toast.push("success", "Quest posted", "Your reward pool is in escrow and the quest is open.");
      navigate(id !== null ? `/quests/${id}` : "/dashboard");
    } catch (e) {
      toast.push("error", "Could not post the quest", e instanceof Error ? e.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader title="Post a quest">
        Describe the task in plain words, fund the whole reward pool up front, and let validators decide who qualified. You never pay for a claim
        that didn't pass.
      </PageHeader>

      {!isContractConfigured && (
        <Card className="p-4">
          <HelperText tone="error">No contract is configured for this network. Set VITE_CONTRACT_ADDRESS or paste an address in the network menu.</HelperText>
        </Card>
      )}
      {config?.global_paused && (
        <Notice tone="warn" title="New quests are paused">
          The contract owner has paused it, so a new quest can't be posted right now.
        </Notice>
      )}

      <Card className="space-y-4 p-6">
        <Label>What kind of proof?</Label>
        <div className="grid gap-3 sm:grid-cols-3">
          {KINDS.map((k: QuestKind) => {
            const active = form.kind === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={active}
                onClick={() => set({ kind: k })}
                className={`rounded-lg border p-4 text-left transition-colors ${active ? "border-beacon-400 bg-beacon-400/10" : "border-deep-700 bg-deep-900/60 hover:border-deep-600"}`}
              >
                <KindTag kind={k} />
                <p className="mt-3 text-[12px] leading-relaxed text-mist-400">{KIND_META[k].blurb}</p>
              </button>
            );
          })}
        </div>
        {form.kind === "generic" && (
          <div>
            <Label hint="public site only">Domain</Label>
            <Input className="font-mono" placeholder="example.com" value={form.domain} onChange={(e) => set({ domain: e.target.value })} spellCheck={false} autoCapitalize="off" />
            <HelperText>
              Proofs must be https pages on this domain or its subdomains. Use a site where the claimant can publish their own text. IP addresses and internal names aren't allowed.
            </HelperText>
          </div>
        )}
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <div className="flex items-baseline justify-between">
            <Label>Title</Label>
            <Counter value={form.title.trim().length} max={MAX_TITLE} />
          </div>
          <Input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Tweet about our launch" />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <Label>Requirement</Label>
            <Counter value={form.criteria.trim().length} max={MAX_CRITERIA} />
          </div>
          <Textarea rows={4} value={form.criteria} onChange={(e) => set({ criteria: e.target.value })} placeholder="A post that explains in your own words what the product does and why you like it." />
          <HelperText>This is what validators judge against. It can't be changed after posting, so be specific. Vague criteria lead to rejections and appeals.</HelperText>
        </div>
        <div>
          <Label hint={`up to ${MAX_KEYWORDS}, comma separated`}>Required words (optional)</Label>
          <Input value={form.keywords} onChange={(e) => set({ keywords: e.target.value })} placeholder="#genlayer, @genlayer" />
          {keywordError ? (
            <HelperText tone="error">{keywordError}</HelperText>
          ) : (
            <HelperText>
              {keywordCount === 0
                ? "Checked by the contract itself, not the model. Each word must appear in the same post as the claimant's code."
                : `${keywordCount} word${keywordCount === 1 ? "" : "s"} required, checked case-insensitively next to the claimant's code.`}
            </HelperText>
          )}
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label hint={NATIVE_SYMBOL}>Reward per winner</Label>
            <Input inputMode="decimal" placeholder="e.g. 5" value={form.reward} onChange={(e) => set({ reward: e.target.value })} />
          </div>
          <div>
            <Label hint={`1-${config?.max_winners_cap ?? 1000}`}>Number of winners</Label>
            <Input inputMode="numeric" value={form.winners} onChange={(e) => set({ winners: e.target.value })} />
          </div>
        </div>
        <div>
          <Label hint="optional, your local time">Deadline</Label>
          <Input type="datetime-local" value={form.deadlineLocal} onChange={(e) => set({ deadlineLocal: e.target.value })} />
          <HelperText>
            After the deadline nobody can submit, and anyone may close the quest so the unclaimed reward returns to you. A deadline can be extended later but never shortened or added afterwards.
          </HelperText>
        </div>

        <div className="rounded-lg border border-beacon-400/30 bg-beacon-400/10 p-4">
          <p className="text-[12px] text-mist-400">You will deposit</p>
          {preview ? (
            <>
              <p className="mt-1 font-display text-[28px] leading-none text-beacon-300">
                {fromWeiExact(preview.deposit)} <span className="text-[14px] text-mist-400">{NATIVE_SYMBOL}</span>
              </p>
              <p className="mt-2 text-[12px] text-mist-400">
                {winnersN} x {form.reward.trim()} = {fromWei(preview.total, 6)} {NATIVE_SYMBOL} in escrow
                {preview.fee > 0n ? `, plus a ${feeBps / 100}% protocol fee of ${fromWei(preview.fee, 6)} ${NATIVE_SYMBOL}` : ", no protocol fee right now"}.
              </p>
            </>
          ) : (
            <p className="mt-1 text-[13px] text-mist-500">Enter a reward and a number of winners to see the exact amount.</p>
          )}
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        {formError && <HelperText tone="error">{formError}</HelperText>}
        {wallet.address ? (
          <Button className="w-full" loading={submitting} disabled={!!config?.global_paused} onClick={submit}>
            Post quest and fund escrow
          </Button>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-[14px] text-mist-200">Connect or create a wallet to post this quest.</p>
            <WalletPanel />
          </div>
        )}
        <HelperText>
          The fee is charged once on the deposit and never on a claimant's reward. You can close the quest later and recover whatever nobody claimed.
          Validators check the page, not the person, so anyone with a postable account can claim; choose requirements accordingly.
        </HelperText>
      </Card>
    </div>
  );
}
