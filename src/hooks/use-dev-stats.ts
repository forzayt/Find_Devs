import { useEffect, useState } from "react";

import type { DevStats } from "@/lib/dev-stats";
import { loadUnghUser, loadUnghUserRepos, type UnghRepo } from "@/lib/ungh";

const cache = new Map<string, DevStats>();
const inflight = new Map<string, Promise<DevStats | undefined>>();

function buildStats(login: string, user: Awaited<ReturnType<typeof loadUnghUser>>, repos: UnghRepo[]) {
  const byStars = [...repos].sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));
  const latest = [...repos]
    .filter((repo) => repo.pushedAt)
    .sort((a, b) => Date.parse(b.pushedAt) - Date.parse(a.pushedAt))[0];

  return {
    login: user?.username ?? login,
    name: user?.name ?? undefined,
    avatarUrl: user?.avatar ?? undefined,
    twitter: user?.twitter ?? undefined,
    publicRepos: repos.length,
    totalStars: repos.reduce((sum, repo) => sum + (Number(repo.stars) || 0), 0),
    topRepositories: byStars.slice(0, 3).map((repo) => ({
      name: repo.name,
      url: `https://github.com/${repo.repo}`,
      stars: Number(repo.stars) || 0,
      forks: Number(repo.forks) || 0,
      description: repo.description ?? undefined,
      pushedAt: repo.pushedAt,
    })),
    latestPush: latest ? { repository: latest.name, at: latest.pushedAt } : undefined,
  } satisfies DevStats;
}

async function loadStats(login: string): Promise<DevStats | undefined> {
  const [user, repos] = await Promise.all([loadUnghUser(login), loadUnghUserRepos(login)]);
  if (!user && !repos.length) return undefined;
  return buildStats(login, user, repos);
}

function fetchStats(login: string): Promise<DevStats | undefined> {
  const pending = inflight.get(login);
  if (pending) return pending;

  const request = loadStats(login)
    .then((stats) => {
      if (stats) cache.set(login, stats);
      return stats;
    })
    .catch(() => undefined)
    .finally(() => inflight.delete(login));

  inflight.set(login, request);
  return request;
}

/**
 * Developer stats for the hover card, fetched straight from ungh.cc (cached,
 * unlimited GitHub API). Nothing is requested until `enabled` flips to true
 * (the card opens), and results are cached per login for the tab's lifetime.
 */
export function useDevStats(login: string, enabled: boolean) {
  const key = login.toLowerCase();
  const [entry, setEntry] = useState<{ key: string; stats: DevStats } | undefined>(() => {
    const cached = cache.get(key);
    return cached ? { key, stats: cached } : undefined;
  });
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    if (!enabled) return;

    const cached = cache.get(key);
    if (cached) {
      setEntry({ key, stats: cached });
      setStatus("ready");
      return;
    }

    let active = true;
    setStatus("loading");
    void fetchStats(key).then((stats) => {
      if (!active) return;
      if (stats) {
        setEntry({ key, stats });
        setStatus("ready");
      } else {
        setStatus("error");
      }
    });

    return () => {
      active = false;
    };
  }, [enabled, key]);

  const stats = entry?.key === key ? entry.stats : cache.get(key);
  return { stats, loading: status === "idle" || status === "loading" };
}
