import { fetchGithubApi } from "@/lib/github-api";

const CACHE_TTL_MS = 10 * 60 * 1000;

type CachedStarCount = {
  count: number;
  expiresAt: number;
};

const starCountCache = new Map<string, CachedStarCount>();

function validRepositoryName(name: string) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name);
}

async function loadRepositoryStarCount(name: string, signal?: AbortSignal) {
  const cached = starCountCache.get(name);
  if (cached && cached.expiresAt > Date.now()) return cached.count;

  const response = await fetchGithubApi(`repos/${name}`, { signal });
  if (!response.ok) throw new Error(`GitHub repository lookup returned ${response.status}.`);

  const body = (await response.json()) as { stargazers_count?: number };
  const count = Number(body.stargazers_count);
  if (!Number.isFinite(count)) throw new Error("GitHub returned an invalid star count.");

  starCountCache.set(name, { count, expiresAt: Date.now() + CACHE_TTL_MS });
  return count;
}

export async function loadRepositoryStarCounts(names: string[], signal?: AbortSignal) {
  const repositories = [...new Set(names.filter(validRepositoryName))].slice(0, 4);
  const results = await Promise.allSettled(
    repositories.map(async (name) => [name, await loadRepositoryStarCount(name, signal)] as const),
  );

  return Object.fromEntries(
    results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])),
  ) as Record<string, number>;
}
