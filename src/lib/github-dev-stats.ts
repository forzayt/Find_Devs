import { fetchGithubApi } from "@/lib/github-api";
import type { DevStats, DevStatsRepository } from "@/lib/dev-stats";

/**
 * A compact "who is this developer" summary shown in the hover card:
 * profile basics, the languages they actually ship in, how much they pushed
 * in the last seven days, and their most popular repositories.
 */

type GithubUserPayload = {
  login?: string;
  name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  followers?: number | null;
  public_repos?: number | null;
};

type GithubRepoPayload = {
  name?: string;
  full_name?: string;
  html_url?: string;
  description?: string | null;
  language?: string | null;
  stargazers_count?: number | null;
  fork?: boolean;
  archived?: boolean;
  pushed_at?: string | null;
};

type GithubEventPayload = {
  type?: string;
  created_at?: string;
  payload?: {
    action?: string;
    size?: number;
    distinct_size?: number;
    commits?: unknown[];
  };
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_REPOSITORIES = 3;
const MAX_LANGUAGES = 3;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type CachedStats = { stats: DevStats; expiresAt: number };

const statsCache = new Map<string, CachedStats>();
const inflight = new Map<string, Promise<DevStats | undefined>>();

function countContributions(events: GithubEventPayload[], since: number) {
  let commits = 0;
  let pullRequests = 0;
  let issues = 0;

  for (const event of events) {
    const createdAt = event.created_at ? Date.parse(event.created_at) : Number.NaN;
    if (!Number.isFinite(createdAt) || createdAt < since) continue;

    if (event.type === "PushEvent") {
      const size = Number(event.payload?.distinct_size ?? event.payload?.size);
      if (Number.isFinite(size) && size > 0) commits += size;
      else if (Array.isArray(event.payload?.commits)) commits += event.payload.commits.length;
    } else if (event.type === "PullRequestEvent" && event.payload?.action === "opened") {
      pullRequests += 1;
    } else if (event.type === "IssuesEvent" && event.payload?.action === "opened") {
      issues += 1;
    }
  }

  return { commits, pullRequests, issues };
}

function primaryLanguages(repos: GithubRepoPayload[]) {
  const counts = new Map<string, { count: number; recent: number }>();

  for (const repo of repos) {
    if (repo.fork || !repo.language) continue;
    const entry = counts.get(repo.language) ?? { count: 0, recent: 0 };
    entry.count += 1;
    entry.recent = Math.max(entry.recent, Date.parse(repo.pushed_at ?? "") || 0);
    counts.set(repo.language, entry);
  }

  return [...counts.entries()]
    .sort(([, a], [, b]) => b.count - a.count || b.recent - a.recent)
    .slice(0, MAX_LANGUAGES)
    .map(([language]) => language);
}

function topRepositories(repos: GithubRepoPayload[]): DevStatsRepository[] {
  return repos
    .filter((repo) => !repo.fork && repo.name)
    .sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))
    .slice(0, MAX_REPOSITORIES)
    .map((repo) => ({
      name: repo.name as string,
      url: repo.html_url ?? `https://github.com/${repo.full_name ?? repo.name}`,
      stars: Number(repo.stargazers_count) || 0,
      language: repo.language ?? undefined,
      description: repo.description ?? undefined,
    }));
}

async function fetchJson<T>(path: string): Promise<T> {
  // Profile data always comes straight from the official REST API
  // (api.github.com). The public proxy fallbacks used elsewhere are skipped
  // here on purpose: a hover card must not show third-party cached or mangled
  // profile data. `GITHUB_TOKEN`/`GITHUB_API_TOKEN` is picked up automatically
  // by fetchGithubApi, which is the only way to beat the hourly rate limit.
  // No AbortSignal either: the client aborts its own request when the hover
  // card closes or the page reloads, and forwarding that abort turns a
  // cancelled hover into an API error.
  const response = await fetchGithubApi(path, { directOnly: true });
  if (!response.ok) throw new Error(`GitHub responded with ${response.status} for ${path}.`);
  return (await response.json()) as T;
}

async function loadFreshStats(login: string): Promise<DevStats | undefined> {
  const [user, repos, events] = await Promise.allSettled([
    fetchJson<GithubUserPayload>(`users/${encodeURIComponent(login)}`),
    fetchJson<GithubRepoPayload[]>(
      `users/${encodeURIComponent(login)}/repos?per_page=100&sort=pushed&type=owner`,
    ),
    fetchJson<GithubEventPayload[]>(`users/${encodeURIComponent(login)}/events/public?per_page=100`),
  ]);

  const profile = user.status === "fulfilled" ? user.value : undefined;
  const repositories = repos.status === "fulfilled" && Array.isArray(repos.value) ? repos.value : [];
  const activity =
    events.status === "fulfilled" && Array.isArray(events.value) ? events.value : undefined;

  // Without even a profile or a repository list there is nothing worth showing.
  if (!profile && !repositories.length) return undefined;

  const counts = activity ? countContributions(activity, Date.now() - WEEK_MS) : undefined;

  return {
    login: profile?.login ?? login,
    name: profile?.name ?? undefined,
    avatarUrl: profile?.avatar_url ?? undefined,
    bio: profile?.bio ?? undefined,
    followers: typeof profile?.followers === "number" ? profile.followers : undefined,
    publicRepos: typeof profile?.public_repos === "number" ? profile.public_repos : undefined,
    languages: primaryLanguages(repositories),
    contributionsThisWeek: counts
      ? counts.commits + counts.pullRequests + counts.issues
      : undefined,
    contributions: counts,
    topRepositories: topRepositories(repositories),
    partial: user.status === "rejected" || repos.status === "rejected" || !activity,
  };
}

/**
 * Cached per login, with in-flight de-duplication, so hovering the same person
 * in several feed rows at once only costs one set of GitHub calls.
 */
export async function loadDevStats(login: string): Promise<DevStats | undefined> {
  const key = login.toLowerCase();
  const cached = statsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.stats;

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = loadFreshStats(login)
    .then((stats) => {
      if (stats) statsCache.set(key, { stats, expiresAt: Date.now() + CACHE_TTL_MS });
      return stats ?? cached?.stats;
    })
    .catch(() => cached?.stats)
    .finally(() => inflight.delete(key));

  inflight.set(key, request);
  return request;
}
