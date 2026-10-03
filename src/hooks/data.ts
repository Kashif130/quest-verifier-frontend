import { getConfig, getQuest, getSubmission, getUserStats, isModerator, listAllPendingAppeals, listAllQuests, listAllUserSubmissions } from "../lib/client";
import { usePolled } from "./usePolled";

/** Protocol settings (fee, pause, owner, quest count). */
export const useConfig = () => usePolled(() => getConfig(), [], 30_000);

/** Every quest, newest first. */
export function useAllQuests() {
  const p = usePolled(async () => [...(await listAllQuests())].reverse(), [], 30_000);
  return { ...p, quests: p.data ?? [] };
}

export const useQuest = (id: number | null) =>
  usePolled(() => getQuest(id as number), [id], 12_000, id !== null && Number.isFinite(id));

export const useSubmission = (id: number | null, user: string | null) =>
  usePolled(() => getSubmission(id as number, user as string), [id, user], 12_000, id !== null && !!user);

export const useUserStats = (user: string | null) =>
  usePolled(() => getUserStats(user as string), [user], 15_000, !!user);

export const useUserSubmissions = (user: string | null) =>
  usePolled(() => listAllUserSubmissions(user as string), [user], 30_000, !!user);

export const usePendingAppeals = () => usePolled(() => listAllPendingAppeals(), [], 20_000);

export const useIsModerator = (user: string | null) =>
  usePolled(() => isModerator(user as string), [user], 60_000, !!user);
