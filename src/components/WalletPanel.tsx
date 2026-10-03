import { useState } from "react";
import { Wallet, KeyRound, ShieldAlert, LogOut, Eye, EyeOff, Sparkles, Plug } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { useToast } from "../context/ToastContext";
import { Button, Card, CopyButton, Input, Label, Modal, HelperText } from "./ui";
import { fromWei, shortAddress, NATIVE_SYMBOL } from "../lib/format";
import { activeNetworkLabel } from "../lib/networks";
import { mobileWalletLinks } from "../lib/injectedWallets";

type PanelView = "closed" | "choose" | "create" | "import" | "unlock" | "menu" | "export";

export function WalletPanel() {
  const wallet = useWallet();
  const toast = useToast();
  const [view, setView] = useState<PanelView>("closed");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [importKey, setImportKey] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  const close = () => {
    setView("closed");
    setPassword("");
    setPassword2("");
    setImportKey("");
    setRevealed(null);
    wallet.clearError();
  };

  // --- Entry button, adapts to wallet state -------------------------------
  if (wallet.mode === "none") {
    return (
      <>
        <Button variant="primary" icon={<Wallet className="h-4 w-4" />} onClick={() => setView("choose")}>
          Connect wallet
        </Button>
        {view === "choose" && (
          <Modal title="Connect a wallet" onClose={close}>
            <div className="space-y-3">
              <button
                onClick={() => setView("create")}
                className="flex w-full items-center gap-3 rounded-md border border-deep-600 p-3 text-left hover:border-beacon-400"
              >
                <Sparkles className="h-5 w-5 shrink-0 text-beacon-400" />
                <span>
                  <span className="block text-[14px] font-medium text-mist-100">
                    Create a new wallet
                  </span>
                  <span className="block text-[12px] text-mist-500">
                    One click generates a fresh {activeNetworkLabel} address, right in this
                    browser.
                  </span>
                </span>
              </button>
              <button
                onClick={() => setView("import")}
                className="flex w-full items-center gap-3 rounded-md border border-deep-600 p-3 text-left hover:border-beacon-400"
              >
                <KeyRound className="h-5 w-5 shrink-0 text-beacon-400" />
                <span>
                  <span className="block text-[14px] font-medium text-mist-100">
                    Import an existing key
                  </span>
                  <span className="block text-[12px] text-mist-500">
                    Paste a private key you already have.
                  </span>
                </span>
              </button>
              <div className="rounded-md border border-deep-600 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Plug className="h-5 w-5 shrink-0 text-beacon-400" />
                  <span className="text-[14px] font-medium text-mist-100">
                    Connect a browser wallet
                  </span>
                </div>
                <p className="mb-2 text-[12px] text-mist-500">
                  Works with any EVM wallet: MetaMask, Rabby, Coinbase, Trust, OKX, Phantom, Brave and more. We'll switch it to the right network for you.
                </p>
                {wallet.injectedWallets.length === 0 ? (
                  <button
                    onClick={async () => {
                      try {
                        await wallet.connectInjected();
                        toast.push("success", "Browser wallet connected");
                        close();
                      } catch {
                        /* surfaced via wallet.error below */
                      }
                    }}
                    className="w-full rounded-md border border-deep-600 px-3 py-2 text-left text-[13px] text-mist-200 hover:border-beacon-400"
                  >
                    Detect wallets
                  </button>
                ) : (
                  <div className="space-y-2">
                    {wallet.injectedWallets.map((w) => (
                      <button
                        key={w.id}
                        onClick={async () => {
                          try {
                            await wallet.connectInjected(w.id);
                            toast.push("success", `${w.name} connected`);
                            close();
                          } catch {
                            /* surfaced via wallet.error below */
                          }
                        }}
                        className="flex w-full items-center gap-3 rounded-md border border-deep-600 px-3 py-2 text-left text-[13px] text-mist-100 hover:border-beacon-400"
                      >
                        {w.icon ? (
                          <img src={w.icon} alt="" className="h-5 w-5 rounded" />
                        ) : (
                          <Plug className="h-5 w-5 text-beacon-400" />
                        )}
                        {w.name}
                      </button>
                    ))}
                  </div>
                )}
                {wallet.injectedWallets.length === 0 && (
                  <div className="mt-3 border-t border-deep-700 pt-3">
                    <p className="text-[12px] text-mist-500">On a phone? Open this page inside your wallet app:</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {mobileWalletLinks().map((l) => (
                        <a
                          key={l.name}
                          href={l.href}
                          className="rounded-full border border-deep-600 px-3 py-1 text-[12px] text-mist-200 hover:border-beacon-400"
                        >
                          {l.name}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {wallet.error && <HelperText tone="error">{wallet.error}</HelperText>}
            </div>
          </Modal>
        )}
        {view === "create" && (
          <Modal title="Create a new wallet" onClose={close}>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (password !== password2) {
                  wallet.clearError();
                  return;
                }
                try {
                  await wallet.createBurnerWallet(password);
                  toast.push("success", "Wallet created", "Back it up with the export option in the wallet menu.");
                  close();
                } catch {
                  /* error shown below */
                }
              }}
              className="space-y-4"
            >
              <p className="text-[13px] leading-relaxed text-mist-400">
                This generates a brand-new key pair in your browser and encrypts it with a
                password you choose. Nothing leaves this device.
              </p>
              <div>
                <Label>Password</Label>
                <Input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />
              </div>
              <div>
                <Label>Confirm password</Label>
                <Input
                  type="password"
                  required
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                />
                {password2 && password !== password2 && (
                  <HelperText tone="error">Passwords don't match.</HelperText>
                )}
              </div>
              {wallet.error && <HelperText tone="error">{wallet.error}</HelperText>}
              <Button type="submit" loading={wallet.isBusy} className="w-full">
                Create wallet
              </Button>
            </form>
          </Modal>
        )}
        {view === "import" && (
          <Modal title="Import an existing key" onClose={close}>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (password !== password2) return;
                try {
                  await wallet.importBurnerWallet(importKey, password);
                  toast.push("success", "Wallet imported");
                  close();
                } catch {
                  /* error shown below */
                }
              }}
              className="space-y-4"
            >
              <div>
                <Label>Private key</Label>
                <Input
                  required
                  value={importKey}
                  onChange={(e) => setImportKey(e.target.value)}
                  placeholder="0x…"
                  className="font-mono"
                />
              </div>
              <div>
                <Label>Password to encrypt it with</Label>
                <Input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div>
                <Label>Confirm password</Label>
                <Input
                  type="password"
                  required
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                />
              </div>
              {wallet.error && <HelperText tone="error">{wallet.error}</HelperText>}
              <Button type="submit" loading={wallet.isBusy} className="w-full">
                Import wallet
              </Button>
            </form>
          </Modal>
        )}
      </>
    );
  }

  if (wallet.mode === "burner-locked") {
    return (
      <>
        <Button variant="secondary" icon={<KeyRound className="h-4 w-4" />} onClick={() => setView("unlock")}>
          Unlock {shortAddress(wallet.lockedAddress)}
        </Button>
        {view === "unlock" && (
          <Modal title="Unlock your wallet" onClose={close}>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await wallet.unlock(password);
                  close();
                } catch {
                  /* error shown below */
                }
              }}
              className="space-y-4"
            >
              <div>
                <Label>Password</Label>
                <Input
                  type="password"
                  autoFocus
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {wallet.error && <HelperText tone="error">{wallet.error}</HelperText>}
              <Button type="submit" loading={wallet.isBusy} className="w-full">
                Unlock
              </Button>
              <button
                type="button"
                onClick={() => {
                  wallet.forgetBurnerWallet();
                  close();
                }}
                className="w-full text-center text-[12px] text-mist-500 hover:text-ember-400"
              >
                Forget this wallet on this device instead
              </button>
            </form>
          </Modal>
        )}
      </>
    );
  }

  // burner-unlocked or injected
  return (
    <>
      <button
        onClick={() => setView("menu")}
        className="flex items-center gap-2 rounded-md border border-deep-600 bg-deep-900/60 px-3 py-2 text-[13px] text-mist-100 hover:border-beacon-400"
      >
        <span className={`h-2 w-2 rounded-full ${wallet.wrongNetwork ? "bg-amber-500" : "bg-jade-400"}`} />
        <span className="font-mono">{shortAddress(wallet.address)}</span>
      </button>
      {view === "menu" && (
        <Modal title="Wallet" onClose={close}>
          <div className="space-y-4">
            <Card className="p-4">
              <p className="text-[12px] text-mist-500">Address</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="break-all font-mono text-[13px] text-mist-100">
                  {wallet.address}
                </span>
                <CopyButton value={wallet.address ?? ""} />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-[12px] text-mist-500">Balance</p>
                <p className="font-mono text-[13px] text-mist-100">
                  {wallet.balanceWei !== null ? `${fromWei(wallet.balanceWei)} ${NATIVE_SYMBOL}` : "—"}
                </p>
              </div>
              <p className="mt-2 text-[11px] text-mist-500">Network: {activeNetworkLabel}</p>
              {wallet.mode === "injected" && wallet.wrongNetwork && (
                <div className="mt-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5">
                  <p className="text-[12px] text-amber-300">Your wallet is on a different network.</p>
                  <button
                    onClick={async () => {
                      const ok = await wallet.switchWalletNetwork();
                      if (ok) toast.push("success", "Network switched");
                    }}
                    className="mt-1 text-[12px] font-medium text-beacon-300 hover:text-beacon-200"
                  >
                    Switch network
                  </button>
                </div>
              )}
              {wallet.mode === "injected" && wallet.injectedWalletName && (
                <p className="mt-1 text-[11px] text-mist-500">Wallet: {wallet.injectedWalletName}</p>
              )}
            </Card>

            {wallet.mode === "burner-unlocked" && (
              <div className="space-y-2">
                <Button
                  variant="secondary"
                  className="w-full"
                  icon={<Eye className="h-4 w-4" />}
                  onClick={() => setView("export")}
                >
                  Export private key
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    wallet.lock();
                    close();
                  }}
                >
                  Lock wallet
                </Button>
              </div>
            )}

            <Button
              variant="danger"
              className="w-full"
              icon={wallet.mode === "injected" ? <LogOut className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
              onClick={() => {
                if (wallet.mode === "injected") {
                  wallet.disconnectInjected();
                } else {
                  wallet.forgetBurnerWallet();
                }
                close();
              }}
            >
              {wallet.mode === "injected" ? "Disconnect" : "Forget wallet on this device"}
            </Button>
          </div>
        </Modal>
      )}
      {view === "export" && (
        <Modal title="Export private key" onClose={close}>
          <ExportKeyBody wallet={wallet} revealed={revealed} setRevealed={setRevealed} />
        </Modal>
      )}
    </>
  );
}

function ExportKeyBody({
  wallet,
  revealed,
  setRevealed,
}: {
  wallet: ReturnType<typeof useWallet>;
  revealed: string | null;
  setRevealed: (v: string | null) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-ember-500/40 bg-ember-500/10 p-3">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-ember-400" />
        <p className="text-[12px] leading-relaxed text-mist-200">
          Anyone with this key can move every asset in this wallet. Never share it, and never
          paste it into a site you don't fully trust.
        </p>
      </div>
      {revealed ? (
        <div className="space-y-2">
          <div className="break-all rounded-md border border-deep-600 bg-deep-950/60 p-3 font-mono text-[12px] text-mist-100">
            {revealed}
          </div>
          <div className="flex items-center justify-between">
            <CopyButton value={revealed} label="Copy private key" />
            <button
              onClick={() => setRevealed(null)}
              className="inline-flex items-center gap-1 text-[12px] text-mist-500 hover:text-mist-100"
            >
              <EyeOff className="h-3.5 w-3.5" /> Hide
            </button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          className="w-full"
          icon={<Eye className="h-4 w-4" />}
          onClick={() => setRevealed(wallet.exportPrivateKey())}
        >
          Reveal private key
        </Button>
      )}
    </div>
  );
}
