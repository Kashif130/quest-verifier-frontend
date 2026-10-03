/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONTRACT_ADDRESS: string;
  readonly VITE_CONTRACT_ADDRESS_STUDIONET?: string;
  readonly VITE_CONTRACT_ADDRESS_LOCALNET?: string;
  readonly VITE_CONTRACT_ADDRESS_TESTNETASIMOV?: string;
  readonly VITE_CONTRACT_ADDRESS_TESTNETBRADBURY?: string;
  readonly VITE_GENLAYER_NETWORK: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  ethereum?: import("./lib/injectedWallets").Eip1193Provider & {
    isMetaMask?: boolean;
    providers?: import("./lib/injectedWallets").Eip1193Provider[];
  };
  phantom?: { ethereum?: import("./lib/injectedWallets").Eip1193Provider };
  okxwallet?: import("./lib/injectedWallets").Eip1193Provider;
  trustwallet?: import("./lib/injectedWallets").Eip1193Provider;
  coinbaseWalletExtension?: import("./lib/injectedWallets").Eip1193Provider;
  BinanceChain?: import("./lib/injectedWallets").Eip1193Provider;
}
