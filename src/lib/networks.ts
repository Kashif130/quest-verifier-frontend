import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import type { GenLayerChain } from "genlayer-js/types";

export type NetworkKey = "studionet" | "localnet" | "testnetAsimov" | "testnetBradbury";

export const NETWORK_KEYS: NetworkKey[] = ["studionet", "testnetAsimov", "testnetBradbury", "localnet"];

export const NETWORK_LABELS: Record<NetworkKey, string> = {
  studionet: "GenLayer Studio",
  localnet: "GenLayer Localnet",
  testnetAsimov: "GenLayer Testnet Asimov",
  testnetBradbury: "GenLayer Testnet Bradbury",
};

const CHAINS: Record<NetworkKey, GenLayerChain> = {
  studionet,
  localnet,
  testnetAsimov,
  testnetBradbury,
};

const NETWORK_STORAGE = "qv.network";
const CONTRACT_STORAGE_PREFIX = "qv.contract.";

function isNetworkKey(v: string | null | undefined): v is NetworkKey {
  return !!v && (NETWORK_KEYS as string[]).includes(v);
}

const ENV_NETWORK: NetworkKey = isNetworkKey(import.meta.env.VITE_GENLAYER_NETWORK)
  ? (import.meta.env.VITE_GENLAYER_NETWORK as NetworkKey)
  : "studionet";

function readStoredNetwork(): NetworkKey | null {
  try {
    const v = localStorage.getItem(NETWORK_STORAGE);
    return isNetworkKey(v) ? v : null;
  } catch {
    return null;
  }
}

/** The network the user last picked, else the deployment default from the env. */
export const activeNetworkKey: NetworkKey = readStoredNetwork() ?? ENV_NETWORK;
export const activeChain: GenLayerChain = CHAINS[activeNetworkKey];
export const activeNetworkLabel = NETWORK_LABELS[activeNetworkKey];

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const ZERO = "0x0000000000000000000000000000000000000000";

function envAddressFor(key: NetworkKey): string {
  const specific: Record<NetworkKey, string | undefined> = {
    studionet: import.meta.env.VITE_CONTRACT_ADDRESS_STUDIONET,
    localnet: import.meta.env.VITE_CONTRACT_ADDRESS_LOCALNET,
    testnetAsimov: import.meta.env.VITE_CONTRACT_ADDRESS_TESTNETASIMOV,
    testnetBradbury: import.meta.env.VITE_CONTRACT_ADDRESS_TESTNETBRADBURY,
  };
  if (specific[key]) return specific[key]!;
  // The single generic address belongs to the deployment's default network only.
  return key === ENV_NETWORK ? (import.meta.env.VITE_CONTRACT_ADDRESS ?? "") : "";
}

export function storedContractFor(key: NetworkKey): string {
  try {
    return localStorage.getItem(CONTRACT_STORAGE_PREFIX + key) ?? "";
  } catch {
    return "";
  }
}

/** A user-pasted address (saved in this browser) beats the env address for that network. */
export function contractAddressFor(key: NetworkKey): string {
  const stored = storedContractFor(key);
  if (ADDRESS_RE.test(stored)) return stored;
  return envAddressFor(key);
}

export function saveContractFor(key: NetworkKey, address: string): void {
  try {
    if (address) localStorage.setItem(CONTRACT_STORAGE_PREFIX + key, address);
    else localStorage.removeItem(CONTRACT_STORAGE_PREFIX + key);
  } catch {
    /* storage unavailable: the change simply won't persist */
  }
}

/** Switching network reloads the page so every client and hook is rebuilt for the new chain. */
export function switchNetwork(key: NetworkKey): void {
  try {
    localStorage.setItem(NETWORK_STORAGE, key);
  } catch {
    /* ignore */
  }
  window.location.reload();
}

export const CONTRACT_ADDRESS = contractAddressFor(activeNetworkKey) as `0x${string}`;

export const isContractConfigured = ADDRESS_RE.test(CONTRACT_ADDRESS) && CONTRACT_ADDRESS.toLowerCase() !== ZERO;

// ---------------------------------------------------------------------------
// Chain description used for wallet_addEthereumChain
// ---------------------------------------------------------------------------

interface LooseChain {
  id: number;
  name?: string;
  nativeCurrency?: { name: string; symbol: string; decimals: number };
  rpcUrls?: { default?: { http?: readonly string[] }; public?: { http?: readonly string[] } };
  blockExplorers?: { default?: { url?: string } };
}

export interface AddChainParams {
  chainId: `0x${string}`;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls?: string[];
}

export function chainIdOf(key: NetworkKey = activeNetworkKey): number {
  return (CHAINS[key] as unknown as LooseChain).id;
}

export function addChainParams(key: NetworkKey = activeNetworkKey): AddChainParams {
  const c = CHAINS[key] as unknown as LooseChain;
  const rpc = [...(c.rpcUrls?.default?.http ?? []), ...(c.rpcUrls?.public?.http ?? [])];
  const explorer = c.blockExplorers?.default?.url;
  return {
    chainId: `0x${c.id.toString(16)}`,
    chainName: NETWORK_LABELS[key] ?? c.name ?? `Chain ${c.id}`,
    nativeCurrency: c.nativeCurrency ?? { name: "GEN Token", symbol: "GEN", decimals: 18 },
    rpcUrls: [...new Set(rpc)],
    ...(explorer ? { blockExplorerUrls: [explorer] } : {}),
  };
}
