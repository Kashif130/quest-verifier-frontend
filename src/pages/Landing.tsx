import { Link } from "react-router-dom";
import { buttonClass, Card } from "../components/ui";
import { KindTag, SlotsMeter, Ticket } from "../components/quest";

const steps = [
  { title: "Post a quest", body: "Say what you want done, how many people can earn the reward, and put the whole pool in escrow. The contract holds it from that moment." },
  { title: "Claimants get a code", body: "Every wallet has its own code for each quest. They put it in their post, pull request or page, then submit the link." },
  { title: "The contract looks for the code", body: "Plain code checks that the code and any required words are in the post. Nothing the page says can talk its way past that." },
  { title: "Validators judge the rest", body: "Whether the post actually meets your requirement is a judgement call, so several validators read it independently and must agree." },
];

const mistakes = [
  {
    title: "A bad pass pays someone who shouldn't be paid",
    body: "So the code is enforced in code, the prompt tells the model to refuse unclear pages, and a code that only appears in someone else's reply doesn't count.",
  },
  {
    title: "A bad fail costs a real claimant",
    body: "So a rejection is never final: three attempts, then an appeal to a person. And a page that can't be loaded isn't a rejection at all. It cancels the transaction and keeps the attempt.",
  },
];

function Sample() {
  return (
    <div className="coin-in">
      <Ticket
        top={
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <KindTag kind="tweet" />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-jade-500/40 bg-jade-500/10 px-2.5 py-0.5 text-[12px] font-medium text-jade-400">
                <span className="h-1.5 w-1.5 rounded-full bg-jade-500" /> Open
              </span>
            </div>
            <h3 className="font-display text-[22px] leading-snug text-mist-100">Tweet about our launch</h3>
            <p className="text-[13px] leading-relaxed text-mist-400">A post explaining in your own words what the product does, with #launch.</p>
          </div>
        }
        bottom={
          <div className="space-y-4">
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-[34px] leading-none text-beacon-400">5</span>
              <span className="text-[13px] text-mist-400">GEN each</span>
            </div>
            <SlotsMeter quest={{ winners: 3, max_winners: 10, slots_left: 7 }} />
            <div className="rounded-md border border-beacon-400/40 bg-beacon-400/10 px-3 py-2.5">
              <p className="text-[11px] text-mist-500">Your code</p>
              <code className="font-mono text-[14px] text-beacon-200">GLQ-7-a1b2c3d4e5f60718</code>
            </div>
          </div>
        }
      />
      <p className="mt-3 text-center text-[12px] text-mist-600">An example quest, not a live one</p>
    </div>
  );
}

export function Landing() {
  return (
    <div className="space-y-24">
      <section className="grid gap-12 pt-4 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <h1 className="font-display text-[42px] leading-[1.06] text-mist-100 sm:text-[56px]">Pay for proof, not promises.</h1>
          <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-mist-400">
            Post a bounty for a tweet, a pull request or a page on your site. People prove they did it with a code tied to their wallet,
            GenLayer validators read the page, and the reward pays out of escrow when it passes.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/quests" className={buttonClass("primary", "px-5 py-3 text-[14px]")}>
              Browse quests
            </Link>
            <Link to="/create" className={buttonClass("secondary", "px-5 py-3 text-[14px]")}>
              Post a quest
            </Link>
          </div>
        </div>
        <Sample />
      </section>

      <section>
        <h2 className="font-display text-[30px] text-mist-100">How a quest runs</h2>
        <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="border-t-2 border-beacon-400 pt-4">
              <span className="font-mono text-[12px] text-beacon-300">Step {i + 1}</span>
              <h3 className="mt-2 font-display text-[18px] text-mist-100">{s.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-mist-400">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="font-display text-[30px] text-mist-100">Two ways to get it wrong, both handled</h2>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-mist-400">
          A bounty board can pay too freely or reject too harshly. This one bounds the damage in both directions instead of leaning hard on one.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {mistakes.map((m) => (
            <Card key={m.title} className="p-6">
              <h3 className="font-display text-[19px] text-mist-100">{m.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-mist-400">{m.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-[22px] text-mist-100">Your money stays recoverable</h2>
          <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-mist-400">
            <li>The full reward pool is in escrow before anyone can claim.</li>
            <li>Close a quest any time and what nobody claimed comes back to you.</li>
            <li>Once a deadline passes, anyone can close the quest, and the refund still goes only to you.</li>
            <li>A pending appeal never freezes your refund. Only what that appeal could still win stays set aside.</li>
            <li>The protocol fee is charged once, on your deposit, never on a claimant's reward.</li>
          </ul>
        </Card>
        <Card className="p-6">
          <h2 className="font-display text-[22px] text-mist-100">What it can't promise</h2>
          <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-mist-400">
            <li>The code proves you intended to claim, not that you wrote the post. The model is told to refuse a code that only appears in a reply, but it can be wrong.</li>
            <li>Pages that need a login, such as some X posts, may not load. A claimant then keeps their attempt and can retry or appeal.</li>
            <li>Moderators have real power over disputed payouts. That is a trust assumption, not something the contract removes.</li>
            <li>Anyone with a wallet and a postable account can try. There is no check that the account is genuine.</li>
          </ul>
        </Card>
      </section>
    </div>
  );
}
