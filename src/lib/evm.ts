import { activeNetworkKey, addChainParams, chainIdOf, NETWORK_LABELS } from "./networks";
import type { Eip1193Provider } from "./injectedWallets";

/** EIP-1193 / EIP-3326 / EIP-3085 error codes we care about. */
const USER_REJECTED = 4001;
const UNRECOGNIZED_CHAIN = 4902;

interface ProviderError {
  code?: number;
  message?: string;
  data?: { originalError?: { code?: number } };
}

function errCode(e: unknown): number | undefined {
  const err = e as ProviderError;
  return err?.code ?? err?.data?.originalError?.code;
}

function errMessage(e: unknown): string {
  return (e as ProviderError)?.message ?? "";
}

export function isUserRejection(e: unknown): boolean {
  const code = errCode(e);
  return code === USER_REJECTED || code === -32000 && /reject|denied|cancel/i.test(errMessage(e)) || /user (rejected|denied|cancel)/i.test(errMessage(e));
}

/** The wallet's current chain id as a number, or null if it can't be read. */
export async function readWalletChainId(provider: Eip1193Provider): Promise<number | null> {
  try {
    const raw = (await provider.request({ method: "eth_chainId" })) as string | number;
    const n = typeof raw === "number" ? raw : parseInt(String(raw), raw.toString().startsWith("0x") ? 16 : 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Ask the wallet to add the GenLayer network (shows the wallet's own "Add network" popup). */
export async function addActiveNetworkToWallet(provider: Eip1193Provider): Promise<void> {
  const params = addChainParams();
  if (params.rpcUrls.length === 0) {
    throw new Error(
      `No public RPC URL is known for ${NETWORK_LABELS[activeNetworkKey]}, so it can't be added to a wallet automatically. Add it manually in your wallet's network settings.`,
    );
  }
  await provider.request({ method: "wallet_addEthereumChain", params: [params] });
}

/**
 * Makes the wallet use the GenLayer network the app is on.
 *  1. Already on it: nothing to do.
 *  2. Otherwise ask the wallet to switch (wallet popup).
 *  3. If the wallet doesn't know the network (or the switch fails for any reason other than the
 *     user saying no), ask it to add the network (wallet popup), which normally switches too.
 * Throws a plain-language error if the user declines or the wallet can't do it.
 */
export async function ensureWalletOnActiveNetwork(provider: Eip1193Provider): Promise<void> {
  const target = chainIdOf();
  const current = await readWalletChainId(provider);
  if (current === target) return;

  const hexId = `0x${target.toString(16)}`;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch (e) {
    if (isUserRejection(e)) {
      throw new Error(`Switch your wallet to ${NETWORK_LABELS[activeNetworkKey]} to continue.`);
    }
    // Unknown chain (4902), or a wallet that reports it some other way: offer to add it.
    try {
      await addActiveNetworkToWallet(provider);
    } catch (e2) {
      if (isUserRejection(e2)) {
        throw new Error(`Add and switch to ${NETWORK_LABELS[activeNetworkKey]} in your wallet to continue.`);
      }
      throw e2 instanceof Error ? e2 : new Error("Your wallet couldn't add the network.");
    }
  }

  // Some wallets add the network without switching to it; confirm and switch if needed.
  const after = await readWalletChainId(provider);
  if (after !== target) {
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
    } catch (e) {
      if (isUserRejection(e)) {
        throw new Error(`Switch your wallet to ${NETWORK_LABELS[activeNetworkKey]} to continue.`);
      }
      throw new Error(`Your wallet is still on a different network. Switch it to ${NETWORK_LABELS[activeNetworkKey]}.`);
    }
  }
}

export { UNRECOGNIZED_CHAIN };
