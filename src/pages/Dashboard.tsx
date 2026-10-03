import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { useRunner } from "../hooks/useRunner";
import { useAllQuests, useUserStats, useUserSubmissions } from "../hooks/data";
import { withdraw } from "../lib/client";
import { isContractConfigured } from "../lib/networks";
import { isCreator, explainReason } from "../lib/quests";
import { NATIVE_SYMBOL, fromWei, fromWeiExact } from "../lib/format";
import { Button, buttonClass, Card, EmptyState, HelperText, PageHeader, SectionTitle } from "../components/ui";
import { QuestCard, SubmissionBadge } from "../components/quest";
import { WalletPanel } from "../components/WalletPanel";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-deep-700 bg-deep-900/80 px-4 py-3 shadow-sheet">
      <p className="font-display text-[26px] leading-none text-mist-100">{value}</p>
      <p className="mt-1.5 text-[12px] text-mist-500">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-mist-600">{sub}</p>}
    </div>
  );
}

export function Dashboard() {
  const wallet = useWallet();
  const me = wallet.address;
  const stats = useUserStats(me);
  const subs = useUserSubmissions(me);
  const all = useAllQuests();
  const refreshAll = async () => {
    await Promise.all([stats.refresh(), subs.refresh(), all.refresh()]);
  };
  const { busy, run } = useRunner(refreshAll);

  if (!me) {
    return (
      <div className="mx-auto max-w-2xl space-y-8">
        <PageHeader title="My activity">Your balance, the quests you've tried, and the quests you posted.</PageHeader>
        <Card className="flex flex-col items-start gap-4 p-6">
          <p className="text-[14px] text-mist-200">Connect or create a wallet to see your activity.</p>
          <WalletPanel />
        </Card>
      </div>
    );
  }

  const claimable = BigInt(stats.data?.claimable ?? "0");
  const questById = new Map(all.quests.map((q) => [q.id, q]));
  const rows = [...(subs.data ?? [])].reverse();
  const created = all.quests.filter((q) => isCreator(q, me));
  const waiting = rows.filter((r) => r.status === "appeal_pending").length;
  const loading = stats.loading || subs.loading || all.loading;
  const error = stats.error || subs.error || all.error;

  return (
    <div className="space-y-10">
      <PageHeader
        title="My activity"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={loading} onClick={() => void refreshAll()}>
              Refresh
            </Button>
            <Link to="/create" className={buttonClass("primary")}>
              Post a quest
            </Link>
          </div>
        }
      >
        Your balance, the quests you've tried, and the quests you posted.
      </PageHeader>

      {!isContractConfigured && <HelperText tone="error">No contract is configured for this network, so there is nothing to load yet.</HelperText>}
      {error && <HelperText tone="error">{error}</HelperText>}

      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="space-y-4 p-6">
          <div>
            <p className="text-[12px] text-mist-500">Ready to withdraw</p>
            <p className="mt-1 font-display text-[40px] leading-none text-beacon-300">
              {fromWeiExact(claimable)} <span className="text-[16px] text-mist-400">{NATIVE_SYMBOL}</span>
            </p>
          </div>
          <Button
            className="w-full sm:w-auto"
            loading={busy === "withdraw"}
            disabled={busy !== null || claimable === 0n}
            onClick={() => run("withdraw", (s) => withdraw(s), "Withdrawal sent", "The balance was sent to your wallet.")}
          >
            {claimable === 0n ? "Nothing to withdraw" : "Withdraw to my wallet"}
          </Button>
          <HelperText>
            Rewards, refunds from closed quests and (for the contract owner) protocol fees all collect here. Withdrawing works even while the contract is paused.
          </HelperText>
        </Card>
        <div className="grid grid-cols-2 gap-3 content-start">
          <Stat label="Rewards earned" value={`${fromWei(stats.data?.total_earned ?? "0", 4)}`} sub={NATIVE_SYMBOL} />
          <Stat label="Quests completed" value={String(stats.data?.completed ?? 0)} />
          <Stat label="Appeals waiting" value={String(waiting)} />
          <Stat label="Quests posted" value={String(created.length)} />
        </div>
      </section>

      <section>
        <SectionTitle>Quests you've tried</SectionTitle>
        {rows.length === 0 ? (
          !loading && (
            <EmptyState title="Nothing yet">
              Pick an open quest, put your code in your post, and submit the link. <Link to="/quests" className="text-beacon-300">Browse quests</Link>.
            </EmptyState>
          )
        ) : (
          <ul className="divide-y divide-deep-700 rounded-lg border border-deep-700 bg-deep-900/70">
            {rows.map((r) => {
              const q = questById.get(r.quest_id);
              return (
                <li key={r.quest_id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <Link to={`/quests/${r.quest_id}`} className="font-display text-[16px] text-mist-100 hover:text-beacon-300">
                      {q ? q.title : `Quest #${r.quest_id}`}
                    </Link>
                    {r.status === "rejected" && r.reason && (
                      <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-mist-500">{explainReason(r.reason)}</p>
                    )}
                    {r.status === "rejected" && <p className="mt-1 text-[12px] text-mist-500">{r.attempts_left} attempt{r.attempts_left === 1 ? "" : "s"} left, or appeal</p>}
                  </div>
                  <SubmissionBadge status={r.status} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {created.length > 0 && (
        <section>
          <SectionTitle>Quests you posted</SectionTitle>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[...created].map((q) => (
              <QuestCard key={q.id} quest={q} me={me} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
