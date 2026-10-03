/**
 * Discovery + activation of browser-injected EVM wallets.
 *
 * Works with any wallet that follows either standard:
 *  - EIP-6963 (multi-wallet discovery: MetaMask, Rabby, Coinbase Wallet, Trust, OKX, Phantom EVM, Brave, ...)
 *  - legacy `window.ethereum` (and the older `window.ethereum.providers` array some wallets expose
 *    when several extensions are installed at once)
 * plus the well-known vendor globals some in-app mobile browsers expose instead
 * (window.phantom.ethereum, window.okxwallet, window.trustwallet, window.coinbaseWalletExtension,
 * window.BinanceChain).
 *
 * The built-in burner wallet is unaffected; this module only concerns extension/injected wallets.
 */

export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
}

export interface InjectedWallet {
  /** Stable id: the EIP-6963 rdns when available, otherwise a synthetic legacy id. */
  id: string;
  name: string;
  icon?: string; // data URI from EIP-6963
  provider: Eip1193Provider;
}

interface Eip6963Detail {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193Provider;
}

/** Collects announced wallets for a short window, then resolves with the merged list. */
export function discoverInjectedWallets(waitMs = 300): Promise<InjectedWallet[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve([]);
    const found = new Map<string, InjectedWallet>();

    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963Detail>).detail;
      if (!detail?.info || !detail.provider) return;
      found.set(detail.info.rdns || detail.info.uuid, {
        id: detail.info.rdns || detail.info.uuid,
        name: detail.info.name,
        icon: detail.info.icon,
        provider: detail.provider,
      });
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);

      const covered = (p: Eip1193Provider) => [...found.values()].some((w) => w.provider === p);
      const addLegacy = (id: string, name: string, p: Eip1193Provider | undefined) => {
        if (!p || typeof p.request !== "function" || covered(p)) return;
        found.set(id, { id, name, provider: p });
      };

      // Legacy window.ethereum (and its multi-provider array).
      const eth = window.ethereum;
      const list: Eip1193Provider[] = eth?.providers?.length ? eth.providers : eth ? [eth] : [];
      list.forEach((p, i) => addLegacy(`legacy-${i}`, legacyName(p), p));

      // Vendor globals that some wallets/in-app browsers expose without EIP-6963.
      addLegacy("vendor-phantom", "Phantom", window.phantom?.ethereum);
      addLegacy("vendor-okx", "OKX Wallet", window.okxwallet);
      addLegacy("vendor-trust", "Trust Wallet", window.trustwallet);
      addLegacy("vendor-coinbase", "Coinbase Wallet", window.coinbaseWalletExtension);
      addLegacy("vendor-binance", "Binance Wallet", window.BinanceChain);

      resolve([...found.values()]);
    }, waitMs);
  });
}

function legacyName(p: Eip1193Provider): string {
  const flags = p as unknown as Record<string, unknown>;
  if (flags.isRabby) return "Rabby";
  if (flags.isBraveWallet) return "Brave Wallet";
  if (flags.isCoinbaseWallet) return "Coinbase Wallet";
  if (flags.isTrust || flags.isTrustWallet) return "Trust Wallet";
  if (flags.isOkxWallet || flags.isOKExWallet) return "OKX Wallet";
  if (flags.isPhantom) return "Phantom";
  if (flags.isMetaMask) return "MetaMask";
  return "Browser wallet";
}

/**
 * genlayer-js signs injected-wallet transactions through `window.ethereum`. With several
 * wallets installed, that global may point at a different wallet than the one the user picked,
 * so for the duration of one call we point it at the chosen provider, then restore it.
 * If a wallet locks `window.ethereum` as read-only we fall back to the default behaviour.
 */
export async function withActiveProvider<T>(
  provider: Eip1193Provider | null,
  fn: () => Promise<T>,
): Promise<T> {
  if (!provider || typeof window === "undefined" || window.ethereum === provider) return fn();
  const desc = Object.getOwnPropertyDescriptor(window, "ethereum");
  const canOverride = !desc || desc.configurable || desc.writable;
  if (!canOverride) return fn();
  try {
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      writable: true,
      value: provider,
    });
  } catch {
    return fn();
  }
  try {
    return await fn();
  } finally {
    try {
      if (desc) Object.defineProperty(window, "ethereum", desc);
      else delete (window as { ethereum?: unknown }).ethereum;
    } catch {
      /* best effort restore */
    }
  }
}

/** Deep links that reopen this page inside a wallet's own in-app browser (for phones with no injected wallet). */
export function mobileWalletLinks(): { name: string; href: string }[] {
  if (typeof window === "undefined") return [];
  const url = window.location.href;
  const hostAndPath = url.replace(/^https?:\/\//, "");
  const enc = encodeURIComponent(url);
  return [
    { name: "MetaMask", href: `https://metamask.app.link/dapp/${hostAndPath}` },
    { name: "Coinbase Wallet", href: `https://go.cb-w.com/dapp?cb_url=${enc}` },
    { name: "Trust Wallet", href: `https://link.trustwallet.com/open_url?coin_id=60&url=${enc}` },
  ];
}
