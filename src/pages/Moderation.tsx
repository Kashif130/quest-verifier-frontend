import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { useRunner } from "../hooks/useRunner";
import { useAllQuests, useConfig, useIsModerator, usePendingAppeals } from "../hooks/data";
import {
  acceptOwnership,
  cancelOwnershipTransfer,
  proposeOwner,
  resolveAppeal,
  setFeeBps,
  setGlobalPause,
  setModerator,
} from "../lib/client";
import { ADDRESS_RE, isContractConfigured } from "../lib/networks";
import { sameAddress } from "../lib/format";
import { Button, Card, EmptyState, HelperText, Input, Label, Notice, PageHeader, SectionTitle } from "../components/ui";
import { AppealItem } from "../components/AppealItem";
import { WalletPanel } from "../components/WalletPanel";

function OwnerTools({ run, busy, refresh }: { run: ReturnType<typeof useRunner>["run"]; busy: string | null; refresh: () => Promise<void> }) {
  const cfg = useConfig();
  const wallet = useWallet();
  const [fee, setFee] = useState("");
  const [modAddr, setModAddr] = useState("");
  const [ownerAddr, setOwnerAddr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const c = cfg.data;
  if (!c) return null;
  const me = wallet.address;
  const isOwner = sameAddress(c.owner, me);
  const isPendingOwner = !!c.pending_owner && sameAddress(c.pending_owner, me);
  const anyBusy = busy !== null;
  if (!isOwner && !isPendingOwner) return null;

  const withRefresh = async (label: string, fn: Parameters<typeof run>[1], title: string, detail?: string) => {
    const ok = await run(label, fn, title, detail);
    if (ok) await Promise.all([cfg.refresh(), refresh()]);
    return ok;
  };

  return (
    <Card className="space-y-6 p-6">
      <SectionTitle>Protocol settings</SectionTitle>
      {isPendingOwner && (
        <Notice tone="info" title="You've been offered ownership">
          <div className="mt-2">
            <Button loading={busy === "accept-owner"} disabled={anyBusy} onClick={() => withRefresh("accept-owner", (s) => acceptOwnership(s), "You are now the owner")}>
              Accept ownership
            </Button>
          </div>
        </Notice>
      )}

      {isOwner && (
        <>
          <div className="space-y-2">
            <Label hint={`now ${c.fee_bps / 100}%, max ${c.max_fee_bps / 100}%`}>Protocol fee (basis points)</Label>
            <div className="flex gap-2">
              <Input inputMode="numeric" className="max-w-[9rem]" placeholder={String(c.fee_bps)} value={fee} onChange={(e) => { setFee(e.target.value); setError(null); }} />
              <Button
                variant="secondary"
                loading={busy === "fee"}
                disabled={anyBusy || fee.trim() === ""}
                onClick={() => {
                  const n = /^\d+$/.test(fee.trim()) ? Number(fee.trim()) : -1;
                  if (n < 0 || n > c.max_fee_bps) {
                    setError(`Enter a whole number from 0 to ${c.max_fee_bps}.`);
                    return;
                  }
                  void withRefresh("fee", (s) => setFeeBps(s, n), "Fee updated", "It applies to future deposits only.");
                }}
              >
                Set fee
              </Button>
            </div>
            <HelperText>100 basis points is 1%. The fee is charged once on a deposit and never on a reward.</HelperText>
          </div>

          <div className="space-y-2 border-t border-deep-700 pt-5">
            <Label>Moderators</Label>
            <Input className="font-mono" placeholder="0x…" value={modAddr} onChange={(e) => { setModAddr(e.target.value); setError(null); }} spellCheck={false} />
            <div className="flex gap-2">
              {[true, false].map((enable) => (
                <Button
                  key={String(enable)}
                  variant="secondary"
                  loading={busy === `mod-${enable}`}
                  disabled={anyBusy || modAddr.trim() === ""}
                  onClick={() => {
                    if (!ADDRESS_RE.test(modAddr.trim())) {
                      setError("That isn't a valid address.");
                      return;
                    }
                    void withRefresh(`mod-${enable}`, (s) => setModerator(s, modAddr.trim(), enable), enable ? "Moderator added" : "Moderator removed");
                  }}
                >
                  {enable ? "Make moderator" : "Remove moderator"}
                </Button>
              ))}
            </div>
            <HelperText>The owner is always a moderator. Moderators can reject appeals and close any quest.</HelperText>
          </div>

          <div className="space-y-2 border-t border-deep-700 pt-5">
            <Label>Pause everything</Label>
            <Button
              variant={c.global_paused ? "primary" : "danger"}
              loading={busy === "pause-all"}
              disabled={anyBusy}
              onClick={() => withRefresh("pause-all", (s) => setGlobalPause(s, !c.global_paused), c.global_paused ? "Contract resumed" : "Contract paused")}
            >
              {c.global_paused ? "Resume the contract" : "Pause the contract"}
            </Button>
            <HelperText>While paused, no new quests, submissions or appeals are accepted. Withdrawals always work.</HelperText>
          </div>

          <div className="space-y-2 border-t border-deep-700 pt-5">
            <Label>Transfer ownership</Label>
            {c.pending_owner ? (
              <div className="space-y-2">
                <p className="break-all font-mono text-[12px] text-mist-400">Offered to {c.pending_owner}</p>
                <Button variant="secondary" loading={busy === "cancel-owner"} disabled={anyBusy} onClick={() => withRefresh("cancel-owner", (s) => cancelOwnershipTransfer(s), "Transfer cancelled")}>
                  Cancel the offer
                </Button>
              </div>
            ) : (
              <>
                <Input className="font-mono" placeholder="New owner 0x…" value={ownerAddr} onChange={(e) => { setOwnerAddr(e.target.value); setError(null); }} spellCheck={false} />
                <Button
                  variant="secondary"
                  loading={busy === "propose-owner"}
                  disabled={anyBusy || ownerAddr.trim() === ""}
                  onClick={() => {
                    if (!ADDRESS_RE.test(ownerAddr.trim())) {
                      setError("That isn't a valid address.");
                      return;
                    }
                    void withRefresh("propose-owner", (s) => proposeOwner(s, ownerAddr.trim()), "Ownership offered", "They must accept it from their own wallet.");
                  }}
                >
                  Offer ownership
                </Button>
              </>
            )}
            <HelperText>The new owner has to accept. Until then you stay the owner, and you can cancel.</HelperText>
          </div>
          {error && <HelperText tone="error">{error}</HelperText>}
        </>
      )}
    </Card>
  );
}

export function Moderation() {
  const wallet = useWallet();
  const me = wallet.address;
  const appeals = usePendingAppeals();
  const quests = useAllQuests();
  const mod = useIsModerator(me);
  const refreshAll = async () => {
    await Promise.all([appeals.refresh(), quests.refresh(), mod.refresh()]);
  };
  const { busy, run } = useRunner(refreshAll);

  const questById = new Map(quests.quests.map((q) => [q.id, q]));
  const isMod = !!mod.data;
  const list = appeals.data ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Moderation"
        actions={
          <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={appeals.loading} onClick={() => void refreshAll()}>
            Refresh
          </Button>
        }
      >
        When the automatic check rejects someone, they can ask a person to look. This is that queue. Anyone can read it; only a moderator can act on it.
      </PageHeader>

      {!isContractConfigured && <HelperText tone="error">No contract is configured for this network, so there is nothing to load yet.</HelperText>}
      {appeals.error && <HelperText tone="error">{appeals.error}</HelperText>}

      {!me ? (
        <Card className="flex flex-col items-start gap-3 p-5">
          <p className="text-[14px] text-mist-200">Connect a wallet to see whether you can act on these.</p>
          <WalletPanel />
        </Card>
      ) : (
        <Notice tone={isMod ? "success" : "info"}>
          {isMod
            ? "You're a moderator: you can approve or reject any appeal."
            : "You're not a moderator. A quest's creator can approve appeals on their own quest from its page."}
        </Notice>
      )}

      <section className="space-y-4">
        <SectionTitle aside={<span className="text-[12px] text-mist-500">{list.length} waiting, oldest first</span>}>Appeal queue</SectionTitle>
        {list.length === 0 ? (
          !appeals.loading && <EmptyState title="The queue is empty">No appeals are waiting for a decision.</EmptyState>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {list.map((a) => (
              <AppealItem
                key={`${a.quest_id}:${a.user}`}
                appeal={a}
                quest={questById.get(a.quest_id)}
                canApprove={isMod}
                canReject={isMod}
                busy={busy}
                onResolve={(approve) =>
                  run(
                    `${approve ? "approve" : "reject"}:${a.quest_id}:${a.user}`,
                    (s) => resolveAppeal(s, a.quest_id, a.user, approve),
                    approve ? "Appeal approved" : "Appeal rejected",
                    approve ? "The reward was credited to the claimant." : "The rejection stands.",
                  )
                }
              />
            ))}
          </div>
        )}
      </section>

      <OwnerTools run={run} busy={busy} refresh={refreshAll} />
    </div>
  );
}
