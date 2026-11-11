/** Shape of the developer summary shown in the hover card, built entirely
 * from the cached ungh.cc GitHub API. Kept dependency-free so the client can
 * import it without pulling in any data-fetching code. */

export type DevStats = {
  login: string;
  name: string | undefined;
  avatarUrl: string | undefined;
  twitter: string | undefined;
  publicRepos: number;
  totalStars: number;
  topRepositories: DevStatsRepository[];
  latestPush: { repository: string; at: string } | undefined;
};

export type DevStatsRepository = {
  name: string;
  url: string;
  stars: number;
  forks: number;
  description: string | undefined;
  pushedAt: string | undefined;
};
