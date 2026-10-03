import { useEffect, useState } from "react";

/** Ticks down from `targetUnixSeconds` in real time, independent of any polling interval. */
export function useCountdown(targetUnixSeconds: number | null): number {
  const [remaining, setRemaining] = useState<number>(() =>
    targetUnixSeconds ? Math.max(0, targetUnixSeconds - Math.floor(Date.now() / 1000)) : 0,
  );

  useEffect(() => {
    if (!targetUnixSeconds) {
      setRemaining(0);
      return;
    }
    const tick = () => setRemaining(Math.max(0, targetUnixSeconds - Math.floor(Date.now() / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetUnixSeconds]);

  return remaining;
}
