import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/**
 * A lightweight, self-custodial "burner" wallet that lives entirely in the browser.
 *
 * - The private key is generated client-side with viem's secp256k1 generator — the same
 *   curve every GenLayer / EVM-style account uses — so it is a fully standalone signer.
 * - It is never sent anywhere. It is encrypted with a password the user chooses (AES-GCM,
 *   key derived with PBKDF2-SHA256, 210k iterations) and the ciphertext is the only thing
 *   written to localStorage.
 * - The user can export (reveal) the raw private key at any time to back it up or import
 *   it into another wallet, and can import an existing key instead of generating one.
 *
 * This is a convenience signer for a testnet / Studio environment, not a hardened
 * production wallet — the "Honest limitations" panel in the app says as much.
 */

const STORAGE_KEY = "qv.wallet.v1";
const PBKDF2_ITERATIONS = 210_000;

interface StoredWallet {
  address: `0x${string}`;
  salt: string; // base64
  iv: string; // base64
  ciphertext: string; // base64
  createdAt: string;
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < arr.byteLength; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function addressFromPrivateKey(privateKey: `0x${string}`): `0x${string}` {
  return privateKeyToAccount(privateKey).address;
}

export function generateNewPrivateKey(): `0x${string}` {
  return generatePrivateKey();
}

export function isValidPrivateKey(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{64}$/.test(value.trim());
}

export async function encryptAndStore(
  privateKey: `0x${string}`,
  password: string,
): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const enc = new TextEncoder();
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(privateKey),
  );
  const record: StoredWallet = {
    address: addressFromPrivateKey(privateKey),
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertextBuf),
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

export function getStoredWalletMeta(): { address: `0x${string}`; createdAt: string } | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as StoredWallet;
    return { address: record.address, createdAt: record.createdAt };
  } catch {
    return null;
  }
}

export async function unlockStoredWallet(password: string): Promise<`0x${string}`> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error("No wallet found on this device.");
  const record = JSON.parse(raw) as StoredWallet;
  const salt = fromBase64(record.salt);
  const iv = fromBase64(record.iv);
  const ciphertext = fromBase64(record.ciphertext);
  const key = await deriveKey(password, salt);
  try {
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    const pk = new TextDecoder().decode(plainBuf) as `0x${string}`;
    return pk;
  } catch {
    throw new Error("Wrong password.");
  }
}

export function clearStoredWallet(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasStoredWallet(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}
