import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  addressFromPrivateKey,
  clearStoredWallet,
  encryptAndStore,
  generateNewPrivateKey,
  getStoredWalletMeta,
  hasStoredWallet,
  unlockStoredWallet,
} from "../lib/wallet";
import type { Signer, WalletMode } from "../lib/types";
import { readClientBalance } from "../lib/client";
import { discoverInjectedWallets } from "../lib/injectedWallets";
import type { Eip1193Provider, InjectedWallet } from "../lib/injectedWallets";
import {
  addActiveNetworkToWallet,
  ensureWalletOnActiveNetwork,
  isUserRejection,
  readWalletChainId,
} from "../lib/evm";
import { chainIdOf } from "../lib/networks";

const LAST_INJECTED_KEY = "qv.lastInjected";

interface WalletContextValue {
  mode: WalletMode;
  address: `0x${string}` | null;
  lockedAddress: `0x${string}` | null;
  balanceWei: bigint | null;
  isBusy: boolean;
  error: string | null;
  hasBurnerOnDevice: boolean;
  signer: Signer | null;
  injectedWallets: InjectedWallet[];
  injectedWalletName: string | null;
  /** The chain id the connected browser wallet is currently on (null for the built-in wallet). */
  walletChainId: number | null;
  /** True when a browser wallet is connected but is not on the GenLayer network the app uses. */
  wrongNetwork: boolean;
  /** Whether the "switch network" popup should be showing. */
  networkPromptOpen: boolean;
  networkError: string | null;
  refreshInjectedWallets: () => Promise<InjectedWallet[]>;
  createBurnerWallet: (password: string) => Promise<void>;
  importBurnerWallet: (privateKey: string, password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  forgetBurnerWallet: () => void;
  connectInjected: (walletId?: string) => Promise<void>;
  disconnectInjected: () => void;
  exportPrivateKey: () => `0x${string}` | null;
  refreshBalance: () => Promise<void>;
  clearError: () => void;
  /** Ask the wallet to switch to the app's network, adding it first if the wallet doesn't know it. */
  switchWalletNetwork: () => Promise<boolean>;
  /** Ask the wallet to add the app's network (shows the wallet's own popup). */
  addNetworkToWallet: () => Promise<boolean>;
  openNetworkPrompt: () => void;
  dismissNetworkPrompt: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<WalletMode>("none");
  // `address` is only ever set once a signer is actually usable (unlocked burner key in
  // memory, or a live injected-wallet connection) — never for a merely-locked wallet, so
  // the rest of the app can gate real actions on "is address set" without a false positive.
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [lockedAddress, setLockedAddress] = useState<`0x${string}` | null>(null);
  const [privateKey, setPrivateKey] = useState<`0x${string}` | null>(null);
  const [balanceWei, setBalanceWei] = useState<bigint | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [injectedWallets, setInjectedWallets] = useState<InjectedWallet[]>([]);
  const [injectedProvider, setInjectedProvider] = useState<Eip1193Provider | null>(null);
  const [injectedWalletName, setInjectedWalletName] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [networkPromptOpen, setNetworkPromptOpen] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const restoredRef = useRef(false);

  const refreshInjectedWallets = useCallback(async () => {
    const list = await discoverInjectedWallets();
    setInjectedWallets(list);
    return list;
  }, []);

  const fallbackMode = useCallback((): WalletMode => (hasStoredWallet() ? "burner-locked" : "none"), []);

  // Discover installed wallets up front so the connect dialog can list them immediately, then
  // silently reconnect the browser wallet used last time (eth_accounts never shows a popup).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await refreshInjectedWallets();
      if (cancelled || restoredRef.current) return;
      restoredRef.current = true;
      let lastId: string | null = null;
      try {
        lastId = localStorage.getItem(LAST_INJECTED_KEY);
      } catch {
        /* storage unavailable */
      }
      const wallet = lastId ? list.find((w) => w.id === lastId) : undefined;
      if (!wallet) return;
      try {
        const accounts = (await wallet.provider.request({ method: "eth_accounts" })) as string[];
        if (cancelled || !accounts?.[0]) return;
        setAddress(accounts[0] as `0x${string}`);
        setPrivateKey(null);
        setInjectedProvider(wallet.provider);
        setInjectedWalletName(wallet.name);
        setWalletChainId(await readWalletChainId(wallet.provider));
        setMode("injected");
      } catch {
        /* the wallet is locked or unavailable: fall back to the burner state below */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshInjectedWallets]);

  // Follow account and network switches made inside the connected extension.
  useEffect(() => {
    if (mode !== "injected" || !injectedProvider?.on) return;
    const onAccountsChanged = (accounts: unknown) => {
      const next = (accounts as string[] | undefined)?.[0];
      if (next) {
        setAddress(next as `0x${string}`);
      } else {
        setAddress(null);
        setBalanceWei(null);
        setInjectedProvider(null);
        setInjectedWalletName(null);
        setWalletChainId(null);
        setMode(fallbackMode());
      }
    };
    const onChainChanged = (raw: unknown) => {
      const n = typeof raw === "number" ? raw : parseInt(String(raw), String(raw).startsWith("0x") ? 16 : 10);
      const id = Number.isFinite(n) ? n : null;
      setWalletChainId(id);
      if (id === chainIdOf()) {
        setNetworkPromptOpen(false);
        setNetworkError(null);
      } else {
        setNetworkPromptOpen(true);
      }
    };
    injectedProvider.on("accountsChanged", onAccountsChanged);
    injectedProvider.on("chainChanged", onChainChanged);
    return () => {
      injectedProvider.removeListener?.("accountsChanged", onAccountsChanged);
      injectedProvider.removeListener?.("chainChanged", onChainChanged);
    };
  }, [mode, injectedProvider, fallbackMode]);

  useEffect(() => {
    if (hasStoredWallet()) {
      setMode((m) => (m === "none" ? "burner-locked" : m));
      const meta = getStoredWalletMeta();
      if (meta) setLockedAddress(meta.address);
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!address) {
      setBalanceWei(null);
      return;
    }
    try {
      const bal = await readClientBalance(address);
      setBalanceWei(bal);
    } catch {
      // Balance is a nice-to-have; a failed RPC read shouldn't break the wallet UI.
    }
  }, [address]);

  useEffect(() => {
    void refreshBalance();
    const id = setInterval(() => void refreshBalance(), 15000);
    return () => clearInterval(id);
  }, [refreshBalance]);

  const clearError = useCallback(() => setError(null), []);

  // ---- Built-in wallet ---------------------------------------------------

  const createBurnerWallet = useCallback(async (password: string) => {
    setIsBusy(true);
    setError(null);
    try {
      if (password.length < 6) throw new Error("Choose a password with at least 6 characters.");
      const pk = generateNewPrivateKey();
      await encryptAndStore(pk, password);
      setPrivateKey(pk);
      const addr = addressFromPrivateKey(pk);
      setAddress(addr);
      setLockedAddress(addr);
      setInjectedProvider(null);
      setInjectedWalletName(null);
      setWalletChainId(null);
      setMode("burner-unlocked");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create a wallet.");
      throw e;
    } finally {
      setIsBusy(false);
    }
  }, []);

  const importBurnerWallet = useCallback(async (rawKey: string, password: string) => {
    setIsBusy(true);
    setError(null);
    try {
      if (password.length < 6) throw new Error("Choose a password with at least 6 characters.");
      const pk = rawKey.trim() as `0x${string}`;
      await encryptAndStore(pk, password);
      setPrivateKey(pk);
      const addr = addressFromPrivateKey(pk);
      setAddress(addr);
      setLockedAddress(addr);
      setInjectedProvider(null);
      setInjectedWalletName(null);
      setWalletChainId(null);
      setMode("burner-unlocked");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import that key.");
      throw e;
    } finally {
      setIsBusy(false);
    }
  }, []);

  const unlock = useCallback(async (password: string) => {
    setIsBusy(true);
    setError(null);
    try {
      const pk = await unlockStoredWallet(password);
      setPrivateKey(pk);
      setAddress(addressFromPrivateKey(pk));
      // lockedAddress is already set from the stored meta; keep it as-is.
      setMode("burner-unlocked");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unlock the wallet.");
      throw e;
    } finally {
      setIsBusy(false);
    }
  }, []);

  const lock = useCallback(() => {
    setPrivateKey(null);
    setAddress(null);
    setMode("burner-locked");
  }, []);

  const forgetBurnerWallet = useCallback(() => {
    clearStoredWallet();
    setPrivateKey(null);
    setAddress(null);
    setLockedAddress(null);
    setBalanceWei(null);
    setMode("none");
  }, []);

  // ---- Browser wallets + network handling ---------------------------------

  const switchWalletNetwork = useCallback(async (): Promise<boolean> => {
    if (!injectedProvider) return false;
    setNetworkError(null);
    try {
      await ensureWalletOnActiveNetwork(injectedProvider);
      setWalletChainId(await readWalletChainId(injectedProvider));
      setNetworkPromptOpen(false);
      return true;
    } catch (e) {
      setNetworkError(e instanceof Error ? e.message : "Could not switch the network.");
      return false;
    }
  }, [injectedProvider]);

  const addNetworkToWallet = useCallback(async (): Promise<boolean> => {
    if (!injectedProvider) return false;
    setNetworkError(null);
    try {
      await addActiveNetworkToWallet(injectedProvider);
      setWalletChainId(await readWalletChainId(injectedProvider));
      return true;
    } catch (e) {
      if (!isUserRejection(e)) {
        setNetworkError(e instanceof Error ? e.message : "Could not add the network.");
      }
      return false;
    }
  }, [injectedProvider]);

  const connectInjected = useCallback(
    async (walletId?: string) => {
      setIsBusy(true);
      setError(null);
      try {
        // Re-scan in case the wallet finished injecting after the page loaded.
        const list = injectedWallets.length ? injectedWallets : await refreshInjectedWallets();
        const chosen = walletId ? list.find((w) => w.id === walletId) : list[0];
        if (!chosen) {
          throw new Error(
            "No browser wallet was found. Install any EVM wallet (MetaMask, Rabby, Coinbase Wallet, Trust, OKX, Phantom, Brave...) or use the built-in wallet.",
          );
        }
        const accounts = (await chosen.provider.request({
          method: "eth_requestAccounts",
        })) as string[];
        if (!accounts?.[0]) throw new Error("No account was returned by the wallet.");
        setAddress(accounts[0] as `0x${string}`);
        setPrivateKey(null);
        setInjectedProvider(chosen.provider);
        setInjectedWalletName(chosen.name);
        setMode("injected");
        try {
          localStorage.setItem(LAST_INJECTED_KEY, chosen.id);
        } catch {
          /* storage unavailable */
        }

        // Auto network switch: move the wallet onto the GenLayer network right away. If the wallet
        // doesn't know it, this asks to add it. If the user declines, stay connected and show the
        // switch popup so it is one tap to fix.
        setNetworkError(null);
        try {
          await ensureWalletOnActiveNetwork(chosen.provider);
          setWalletChainId(await readWalletChainId(chosen.provider));
          setNetworkPromptOpen(false);
        } catch (e) {
          setWalletChainId(await readWalletChainId(chosen.provider));
          setNetworkError(e instanceof Error ? e.message : "Your wallet is on a different network.");
          setNetworkPromptOpen(true);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not connect a browser wallet.");
        throw e;
      } finally {
        setIsBusy(false);
      }
    },
    [injectedWallets, refreshInjectedWallets],
  );

  const disconnectInjected = useCallback(() => {
    try {
      localStorage.removeItem(LAST_INJECTED_KEY);
    } catch {
      /* ignore */
    }
    setAddress(null);
    setBalanceWei(null);
    setInjectedProvider(null);
    setInjectedWalletName(null);
    setWalletChainId(null);
    setNetworkPromptOpen(false);
    setNetworkError(null);
    setMode(hasStoredWallet() ? "burner-locked" : "none");
  }, []);

  const exportPrivateKey = useCallback((): `0x${string}` | null => privateKey, [privateKey]);

  const signer: Signer | null = useMemo(() => {
    if (!address) return null;
    if (privateKey) return { address, privateKey };
    return injectedProvider ? { address, provider: injectedProvider } : { address };
  }, [address, privateKey, injectedProvider]);

  const wrongNetwork = mode === "injected" && walletChainId !== null && walletChainId !== chainIdOf();

  const value: WalletContextValue = {
    mode,
    address,
    lockedAddress,
    balanceWei,
    isBusy,
    error,
    hasBurnerOnDevice: hasStoredWallet(),
    signer,
    injectedWallets,
    injectedWalletName,
    walletChainId,
    wrongNetwork,
    networkPromptOpen,
    networkError,
    refreshInjectedWallets,
    createBurnerWallet,
    importBurnerWallet,
    unlock,
    lock,
    forgetBurnerWallet,
    connectInjected,
    disconnectInjected,
    exportPrivateKey,
    refreshBalance,
    clearError,
    switchWalletNetwork,
    addNetworkToWallet,
    openNetworkPrompt: () => setNetworkPromptOpen(true),
    dismissNetworkPrompt: () => setNetworkPromptOpen(false),
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
