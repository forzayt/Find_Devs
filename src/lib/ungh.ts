// ungh.cc (https://ungh.cc) is a free, cached, anonymous layer over the GitHub
// API: no token, no per-IP quota, and CORS is wide open, so it works both in
// the browser and on the server. All GitHub lookups in FindDevs go through
// here instead of api.github.com.

const UNGH_API = "https://ungh.cc";
const TIMEOUT_MS = 8_000;

export type UnghUser = {
  id: number;
  username: string;
  name: string | null;
  twitter: string | null;
  avatar: string | null;
};

export type UnghRepo = {
  id: number;
  name: string;
  /** "owner/name" */
  repo: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  stars: number;
  watchers: number;
  forks: number;
  defaultBranch?: string;
};

function withTimeout(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function fetchUngh<T>(path: string, signal?: AbortSignal): Promise<T | undefined> {
  try {
    const response = await fetch(`${UNGH_API}/${path.replace(/^\/+/, "")}`, {
      headers: { accept: "application/json" },
      signal: withTimeout(signal),
    });
    if (!response.ok) return undefined;
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

export async function loadUnghUser(login: string, signal?: AbortSignal) {
  const data = await fetchUngh<{ user?: UnghUser }>(`users/${encodeURIComponent(login)}`, signal);
  return data?.user;
}

export async function loadUnghUserRepos(login: string, signal?: AbortSignal) {
  const data = await fetchUngh<{ repos?: UnghRepo[] }>(
    `users/${encodeURIComponent(login)}/repos`,
    signal,
  );
  return Array.isArray(data?.repos) ? data.repos : [];
}

export async function loadUnghRepository(repo: string, signal?: AbortSignal) {
  const data = await fetchUngh<{ repo?: UnghRepo }>(`repos/${repo}`, signal);
  return data?.repo;
}

export async function loadUnghStars(repos: string[], signal?: AbortSignal) {
  if (!repos.length) return undefined;
  return fetchUngh<{ totalStars: number; stars: Record<string, number> }>(
    `stars/${repos.join("+")}`,
    signal,
  );
}
