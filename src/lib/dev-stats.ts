/** Shared shape of the developer summary shown in the hover card. Kept in a
 * dependency-free module so the client can import it without pulling in the
 * server-side GitHub loader. */

export type DevStats = {
  login: string;
  name: string | undefined;
  avatarUrl: string | undefined;
  bio: string | undefined;
  followers: number | undefined;
  publicRepos: number | undefined;
  languages: string[];
  contributionsThisWeek: number | undefined;
  contributions: { commits: number; pullRequests: number; issues: number } | undefined;
  topRepositories: DevStatsRepository[];
  /** True when one of the GitHub calls failed, so the card can say so. */
  partial: boolean;
};

export type DevStatsRepository = {
  name: string;
  url: string;
  stars: number;
  language: string | undefined;
  description: string | undefined;
};

export function validLogin(login: string) {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(login);
}
