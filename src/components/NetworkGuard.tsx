import { useToast } from "../context/ToastContext";
import { useWallet } from "../context/WalletContext";
import { NETWORK_LABELS, activeNetworkKey, chainIdOf } from "../lib/networks";
import { Button, HelperText, Modal } from "./ui";

/**
 * The "wrong network" popup. Shown when a browser wallet is connected but isn't on the GenLayer
 * network the app uses. One tap switches it, and the wallet's own popup adds the network first if
 * it doesn't know it yet. It closes by itself once the wallet reports the right chain.
 */
export function NetworkGuard() {
  const wallet = useWallet();
  const toast = useToast();

  if (wallet.mode !== "injected" || !wallet.wrongNetwork || !wallet.networkPromptOpen) return null;

  const target = NETWORK_LABELS[activeNetworkKey];

  return (
    <Modal title="Switch network" onClose={wallet.dismissNetworkPrompt}>
      <div className="space-y-4">
        <p className="text-[14px] leading-relaxed text-mist-200">
          {wallet.injectedWalletName ?? "Your wallet"} is on{" "}
          {wallet.walletChainId !== null ? `chain ${wallet.walletChainId}` : "another network"}. This app runs on{" "}
          <span className="font-medium text-mist-100">{target}</span> (chain {chainIdOf()}), so transactions can't be
          signed until your wallet is on it.
        </p>
        <p className="text-[13px] leading-relaxed text-mist-400">
          If your wallet doesn't have this network yet, it will ask you to add it first.
        </p>
        {wallet.networkError && <HelperText tone="error">{wallet.networkError}</HelperText>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="flex-1"
            onClick={async () => {
              const ok = await wallet.switchWalletNetwork();
              if (ok) toast.push("success", `Switched to ${target}`);
            }}
          >
            Switch to {target}
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={async () => {
              const ok = await wallet.addNetworkToWallet();
              if (ok) toast.push("success", `${target} added to your wallet`);
            }}
          >
            Add network
          </Button>
        </div>
        <button onClick={wallet.dismissNetworkPrompt} className="w-full text-center text-[12px] text-mist-500 hover:text-mist-100">
          Not now
        </button>
      </div>
    </Modal>
  );
}
