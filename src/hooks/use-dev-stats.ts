import { useEffect, useState } from "react";

import type { DevStats } from "@/lib/dev-stats";

const cache = new Map<string, DevStats>();
const inflight = new Map<string, Promise<DevStats | undefined>>();

type Status = "idle" | "loading" | "ready" | "error";

function fetchStats(login: string): Promise<DevStats | undefined> {
  const pending = inflight.get(login);
  if (pending) return pending;

  const request = fetch(`/api/dev-stats?login=${encodeURIComponent(login)}`, { cache: "no-store" })
    .then((response) => (response.ok ? (response.json() as Promise<DevStats>) : undefined))
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
 * Developer stats for the hover card. Nothing is requested until `enabled`
 * flips to true (the card opens), and results are cached per login for the
 * lifetime of the tab.
 */
export function useDevStats(login: string, enabled: boolean) {
  const key = login.toLowerCase();
  const [entry, setEntry] = useState<{ key: string; stats: DevStats } | undefined>(() => {
    const cached = cache.get(key);
    return cached ? { key, stats: cached } : undefined;
  });
  const [status, setStatus] = useState<Status>("idle");

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
    void fetchStats(key)
      .then((stats) => {
        if (!active) return;
        if (stats) {
          setEntry({ key, stats });
          setStatus("ready");
        } else {
          setStatus("error");
        }
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [enabled, key]);

  const stats = entry?.key === key ? entry.stats : cache.get(key);
  return { stats, loading: status === "idle" || status === "loading" };
}
