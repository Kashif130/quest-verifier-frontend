import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Search } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { useAllQuests } from "../hooks/data";
import { isContractConfigured } from "../lib/networks";
import { KINDS, KIND_META, questState } from "../lib/quests";
import type { QuestKind } from "../lib/types";
import { Button, buttonClass, Card, EmptyState, HelperText, Input, PageHeader, Select } from "../components/ui";
import { QuestCard } from "../components/quest";

const PAGE_SIZE = 12;
type View = "open" | "all";

export function Quests() {
  const wallet = useWallet();
  const { quests, loading, error, refresh } = useAllQuests();
  const [view, setView] = useState<View>("open");
  const [kind, setKind] = useState<QuestKind | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "reward">("newest");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = quests.filter(
      (x) =>
        (view === "all" || questState(x) === "open") &&
        (kind === "ALL" || x.kind === kind) &&
        (q === "" || x.title.toLowerCase().includes(q) || x.criteria.toLowerCase().includes(q) || x.domain.includes(q)),
    );
    if (sort === "reward") {
      return [...list].sort((a, b) => {
        const d = BigInt(b.reward) - BigInt(a.reward);
        return d > 0n ? 1 : d < 0n ? -1 : 0;
      });
    }
    return list;
  }, [quests, view, kind, query, sort]);

  const reset = () => setVisible(PAGE_SIZE);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Quests"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={loading} onClick={() => void refresh()}>
              Refresh
            </Button>
            <Link to="/create" className={buttonClass("primary")}>
              Post a quest
            </Link>
          </div>
        }
      >
        Pick a task, prove you did it with your personal code, and the reward pays out from escrow once validators agree.
      </PageHeader>

      <Card className="p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-500" />
          <Input className="pl-9" placeholder="Search by title or requirement" value={query} onChange={(e) => { setQuery(e.target.value); reset(); }} />
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Select aria-label="Show" value={view} onChange={(e) => { setView(e.target.value as View); reset(); }}>
          <option value="open">Open quests</option>
          <option value="all">Everything, including closed</option>
        </Select>
        <Select aria-label="Filter by type" value={kind} onChange={(e) => { setKind(e.target.value as QuestKind | "ALL"); reset(); }}>
          <option value="ALL">Any type</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_META[k].label}
            </option>
          ))}
        </Select>
        <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as "newest" | "reward")}>
          <option value="newest">Newest first</option>
          <option value="reward">Biggest reward first</option>
        </Select>
      </div>

      {!isContractConfigured && <HelperText tone="error">No contract is configured for this network, so there is nothing to browse yet.</HelperText>}
      {error && <HelperText tone="error">{error}</HelperText>}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.slice(0, visible).map((q) => (
          <QuestCard key={q.id} quest={q} me={wallet.address} />
        ))}
      </div>

      {!loading && filtered.length === 0 && isContractConfigured && (
        <EmptyState title={quests.length === 0 ? "No quests yet" : "Nothing matches"}>
          {quests.length === 0 ? "Post the first one." : view === "open" ? "No open quest fits. Try 'Everything' or another type." : "Try a different search or type."}
        </EmptyState>
      )}

      {visible < filtered.length && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
            Show more
          </Button>
        </div>
      )}
    </div>
  );
}
