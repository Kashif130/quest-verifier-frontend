import { useCallback, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { useToast } from "../context/ToastContext";
import { waitForFinality } from "../lib/client";
import type { Signer } from "../lib/types";

/**
 * One place for the "check wallet -> mark busy -> send -> toast -> refresh" dance every action
 * button needs. `busy` holds the label of the action in flight so each button can show its own
 * spinner while the others stay disabled.
 */
export function useRunner(onDone?: () => void | Promise<void>) {
  const wallet = useWallet();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(
    async (
      label: string,
      fn: (signer: Signer) => Promise<unknown>,
      successTitle: string,
      successDetail?: string,
    ): Promise<boolean> => {
      if (!wallet.signer) {
        toast.push("error", "Connect a wallet first.");
        return false;
      }
      setBusy(label);
      try {
        const result = await fn(wallet.signer);
        // Validators have agreed (ACCEPTED) but the result is not final yet. Say so, then follow
        // the transaction to FINALIZED in the background instead of calling it final now.
        const hash = typeof result === "string" && result.startsWith("0x") ? result : null;
        toast.push("success", successTitle, hash ? `${successDetail ? successDetail + " " : ""}Accepted by validators; waiting for finality.` : successDetail);
        if (hash) {
          void waitForFinality(hash).then((outcome) =>
            toast.push(
              outcome === "finalized" ? "success" : "info",
              outcome === "finalized" ? "Finalized" : "Not final yet",
              outcome === "finalized"
                ? `${successTitle} is now final.`
                : `${successTitle} was accepted but has not finalized yet. It may still finalize; check My activity before relying on it.`,
            ),
          );
        }
        if (onDone) await onDone();
        return true;
      } catch (e) {
        toast.push("error", "Transaction failed", e instanceof Error ? e.message : undefined);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [wallet.signer, toast, onDone],
  );

  return { busy, run };
}
