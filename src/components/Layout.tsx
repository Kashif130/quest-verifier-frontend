import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { WalletPanel } from "./WalletPanel";
import { NetworkPanel } from "./NetworkPanel";
import { NetworkGuard } from "./NetworkGuard";
import { activeNetworkLabel, isContractConfigured } from "../lib/networks";

const navItems = [
  { to: "/", label: "Overview", end: true },
  { to: "/quests", label: "Quests" },
  { to: "/create", label: "Post a quest" },
  { to: "/dashboard", label: "My activity" },
  { to: "/moderation", label: "Moderation" },
];

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#F2C14E" />
      <circle cx="16" cy="16" r="8" fill="none" stroke="#0E1120" strokeWidth="2.4" />
      <path d="M12.2 16.4l2.7 2.8 5-6" fill="none" stroke="#0E1120" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
      isActive ? "bg-deep-800 text-beacon-300" : "text-mist-400 hover:text-mist-100"
    }`;

  return (
    <div className="min-h-screen bg-deep-950 bg-grain text-mist-100 [background-size:22px_22px]">
      {!isContractConfigured && (
        <div className="border-b border-ember-500/40 bg-ember-500/10 px-4 py-2 text-center text-[12px] text-ember-400">
          No contract is configured for {activeNetworkLabel}. Set VITE_CONTRACT_ADDRESS, or paste an address in the network menu.
        </div>
      )}
      <header className="border-b border-deep-700 bg-deep-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3.5">
          <NavLink to="/" className="flex items-center gap-2.5" onClick={() => setMenuOpen(false)}>
            <Logo />
            <span className="font-display text-[20px] leading-none text-mist-100">Quest Verifier</span>
          </NavLink>

          <nav className="hidden items-center gap-1 xl:flex">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-2 xl:flex">
            <NetworkPanel />
            <WalletPanel />
          </div>

          <button
            className="rounded-md border border-deep-600 p-2 text-mist-200 xl:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-deep-700 px-5 pb-5 pt-3 xl:hidden">
            <nav className="flex flex-col gap-1" onClick={() => setMenuOpen(false)}>
              {navItems.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <NetworkPanel />
              <WalletPanel />
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10">
        <Outlet />
      </main>

      <NetworkGuard />

      <footer className="mt-16 border-t border-deep-700">
        <div className="mx-auto max-w-6xl px-5 py-8 text-[12px] text-mist-500">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>
              Your code is checked by the contract. Whether the post is any good is judged by validators. Rewards sit in escrow
              from the moment a quest is posted.
            </p>
            <p className="font-mono text-mist-600">{activeNetworkLabel}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
