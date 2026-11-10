import { parseTrendingRepositories } from "@/lib/github-trending";

const TRENDING_URL = "https://github.com/trending?since=daily";
const CACHE_TTL_MS = 10 * 60 * 1000;

let cachedDailyStars: { counts: Record<string, number>; expiresAt: number } | undefined;

export async function loadTrendingDailyStars(signal?: AbortSignal) {
  if (cachedDailyStars && cachedDailyStars.expiresAt > Date.now()) {
    return cachedDailyStars.counts;
  }

  const response = await fetch(TRENDING_URL, {
    headers: {
      accept: "text/html",
      "user-agent": "FindDevs/1.0 (+https://github.com/forzayt/Find_Devs)",
    },
    signal,
  });
  if (!response.ok) throw new Error(`GitHub Trending returned ${response.status}.`);

  const counts = Object.fromEntries(
    parseTrendingRepositories(await response.text()).map((repository) => [
      repository.name,
      repository.starsToday,
    ]),
  );
  cachedDailyStars = { counts, expiresAt: Date.now() + CACHE_TTL_MS };
  return counts;
}
