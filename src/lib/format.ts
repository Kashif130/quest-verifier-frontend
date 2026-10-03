export const NATIVE_SYMBOL = "GEN";
const WEI_PER_NATIVE = 1_000_000_000_000_000_000n;

export function toWei(nativeAmount: string): bigint {
  const trimmed = nativeAmount.trim();
  if (trimmed === "") return 0n;
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = (frac + "000000000000000000").slice(0, 18);
  const wholeBig = BigInt(whole === "" ? "0" : whole);
  return wholeBig * WEI_PER_NATIVE + BigInt(fracPadded || "0");
}

/** True for plain positive decimals with at most 18 fractional digits ("1", "0.25", "12.000001"). */
export function isValidAmount(value: string): boolean {
  const v = value.trim();
  if (!/^\d*\.?\d*$/.test(v) || v === "" || v === ".") return false;
  const frac = v.split(".")[1] ?? "";
  if (frac.length > 18) return false;
  try {
    return toWei(v) > 0n;
  } catch {
    return false;
  }
}

export function fromWei(weiString: string | number | bigint, decimals = 4): string {
  let wei: bigint;
  try {
    wei = BigInt(weiString);
  } catch {
    return "0";
  }
  const whole = wei / WEI_PER_NATIVE;
  const remainder = wei % WEI_PER_NATIVE;
  if (decimals === 0) return whole.toString();
  const fracStr = remainder.toString().padStart(18, "0").slice(0, decimals);
  const trimmedFrac = fracStr.replace(/0+$/, "");
  return trimmedFrac ? `${whole}.${trimmedFrac}` : whole.toString();
}

/** Full-precision amount (no truncation), e.g. for "you will pay exactly …". */
export function fromWeiExact(weiString: string | number | bigint): string {
  return fromWei(weiString, 18);
}

export function shortAddress(address?: string | null, chars = 4): string {
  if (!address) return "—";
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

export function sameAddress(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function bpsToPercent(bps: number): string {
  const pct = bps / 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(2)}%`;
}

export function daysToLabel(days: number): string {
  if (days >= 365 && days % 365 === 0) {
    const y = days / 365;
    return `${days} days (${y} year${y === 1 ? "" : "s"})`;
  }
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Contract timestamps are ISO strings from the chain clock (UTC). */
export function formatIsoTimestamp(iso: string): string {
  if (!iso) return "—";
  const hasZone = /(Z|[+-]\d\d:?\d\d)$/.test(iso);
  const normalized = iso.length > 10 && !hasZone ? `${iso}Z` : iso;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return iso;
  if (iso.length <= 10) {
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Date-only display for the agreement's own dates (YYYY-MM-DD…), always shown in UTC. */
export function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** The chain's clock is UTC; the contract compares ISO strings, so we do the same. */
export function nowIso(): string {
  return new Date().toISOString();
}

export function utcDayOfMonth(): number {
  return new Date().getUTCDate();
}

export function truncate(text: string, max = 140): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export function splitUrls(joined: string): string[] {
  return joined
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isoToUnixSeconds(iso: string): number {
  if (!iso) return 0;
  const hasZone = /(Z|[+-]\d\d:?\d\d)$/.test(iso);
  const t = new Date(iso.length > 10 && !hasZone ? `${iso}Z` : iso).getTime();
  return Number.isNaN(t) ? 0 : Math.floor(t / 1000);
}

export function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0s";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, "0")}s` : `${seconds}s`;
}

export function shortHash(hash?: string | null, head = 10, tail = 8): string {
  if (!hash) return "—";
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}
