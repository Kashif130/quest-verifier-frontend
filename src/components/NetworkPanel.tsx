import { useState } from "react";
import { ChevronDown, Globe, Plug } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { useToast } from "../context/ToastContext";
import {
  ADDRESS_RE,
  NETWORK_KEYS,
  NETWORK_LABELS,
  activeNetworkKey,
  activeNetworkLabel,
  chainIdOf,
  contractAddressFor,
  isContractConfigured,
  saveContractFor,
  storedContractFor,
  switchNetwork,
} from "../lib/networks";
import type { NetworkKey } from "../lib/networks";
import { Button, HelperText, Input, Label, Modal } from "./ui";

/** Header chip that shows the GenLayer network in use and opens the network + contract settings. */
export function NetworkPanel() {
  const wallet = useWallet();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => storedContractFor(activeNetworkKey));
  const [draftError, setDraftError] = useState<string | null>(null);

  const saveAddress = () => {
    const v = draft.trim();
    if (v && !ADDRESS_RE.test(v)) {
      setDraftError("That isn't a valid contract address (0x followed by 40 hex characters).");
      return;
    }
    saveContractFor(activeNetworkKey, v);
    window.location.reload();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-[13px] transition-colors hover:border-beacon-400 ${
          wallet.wrongNetwork ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-deep-600 bg-deep-900/60 text-mist-200"
        }`}
        aria-label="Network settings"
      >
        <Globe className="h-4 w-4" />
        <span className="max-w-[9rem] truncate">{activeNetworkLabel}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <Modal title="Network" onClose={() => setOpen(false)} width="max-w-lg">
          <div className="space-y-6">
            <div>
              <Label>GenLayer network</Label>
              <div className="space-y-2">
                {NETWORK_KEYS.map((key: NetworkKey) => {
                  const active = key === activeNetworkKey;
                  const hasContract = !!contractAddressFor(key);
                  return (
                    <button
                      key={key}
                      disabled={active}
                      onClick={() => switchNetwork(key)}
                      className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
                        active ? "border-beacon-400 bg-beacon-400/10" : "border-deep-600 hover:border-beacon-400"
                      }`}
                    >
                      <span>
                        <span className="block text-[14px] font-medium text-mist-100">{NETWORK_LABELS[key]}</span>
                        <span className="block font-mono text-[11px] text-mist-500">chain id {chainIdOf(key)}</span>
                      </span>
                      <span className="text-[11px] text-mist-500">
                        {active ? "In use" : hasContract ? "Contract set" : "No contract yet"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <HelperText>Switching reloads the app on the other network. Your wallet is moved with it.</HelperText>
            </div>

            <div>
              <Label hint={NETWORK_LABELS[activeNetworkKey]}>Contract address</Label>
              <Input
                className="font-mono"
                placeholder={contractAddressFor(activeNetworkKey) || "0x…"}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setDraftError(null);
                }}
              />
              {draftError ? (
                <HelperText tone="error">{draftError}</HelperText>
              ) : (
                <HelperText>
                  {isContractConfigured
                    ? "A deployed QuestVerifier is configured. Paste another address to use it in this browser instead, or clear the box to go back to the default."
                    : "No contract is configured for this network yet. Paste the deployed address to use it in this browser."}
                </HelperText>
              )}
              <div className="mt-3 flex gap-2">
                <Button onClick={saveAddress}>Save address</Button>
              </div>
            </div>

            {wallet.mode === "injected" && (
              <div className="border-t border-deep-700 pt-5">
                <Label>Your wallet</Label>
                <p className="text-[13px] leading-relaxed text-mist-400">
                  {wallet.wrongNetwork
                    ? `${wallet.injectedWalletName ?? "Your wallet"} is on a different network.`
                    : `${wallet.injectedWalletName ?? "Your wallet"} is on ${NETWORK_LABELS[activeNetworkKey]}.`}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {wallet.wrongNetwork && (
                    <Button
                      onClick={async () => {
                        const ok = await wallet.switchWalletNetwork();
                        if (ok) toast.push("success", "Network switched");
                      }}
                    >
                      Switch wallet network
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    icon={<Plug className="h-4 w-4" />}
                    onClick={async () => {
                      const ok = await wallet.addNetworkToWallet();
                      if (ok) toast.push("success", `${NETWORK_LABELS[activeNetworkKey]} added to your wallet`);
                    }}
                  >
                    Add network to wallet
                  </Button>
                </div>
                {wallet.networkError && <HelperText tone="error">{wallet.networkError}</HelperText>}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
