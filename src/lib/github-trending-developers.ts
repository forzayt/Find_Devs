export type TrendingDeveloper = {
  login: string;
  name: string;
  avatarUrl: string;
  popularRepository: string;
};

const TRENDING_DEVELOPERS_URL = "https://github.com/trending/developers?since=daily";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cachedDevelopers: { developers: TrendingDeveloper[]; expiresAt: number } | undefined;

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function textContent(value: string) {
  return decodeHtml(value.replace(/<[^>]*>/g, " "));
}

export function parseTrendingDevelopers(html: string): TrendingDeveloper[] {
  const rows = html.split(/<article\b[^>]*class="[^"]*Box-row[^"]*"[^>]*>/gi).slice(1);

  return rows.flatMap((row) => {
    const userMatch = row.match(
      /<h1\b[^>]*class="[^"]*h3[^"]*"[^>]*>[\s\S]*?<a\b[^>]*href="\/([^"/?#]+)"[^>]*>([\s\S]*?)<\/a>/i,
    );
    if (!userMatch) return [];

    const login = decodeHtml(userMatch[1]);
    const avatarTag = row.match(/<img\b[^>]*>/i)?.[0] ?? "";
    const avatarMatch = avatarTag.match(/src="([^"]+)"/i);
    const repositoryMatches = [...row.matchAll(/href="\/([^"/?#]+\/[^"/?#]+)"/gi)];
    const popularRepository = repositoryMatches
      .map((match) => decodeHtml(match[1]))
      .find((repository) => repository.split("/")[0].toLowerCase() === login.toLowerCase());

    return [
      {
        login,
        name: textContent(userMatch[2]) || login,
        avatarUrl: avatarMatch ? decodeHtml(avatarMatch[1]) : `https://github.com/${login}.png`,
        popularRepository: popularRepository ?? "",
      },
    ];
  });
}

export async function loadTrendingDevelopers(signal?: AbortSignal) {
  const now = Date.now();
  if (cachedDevelopers && cachedDevelopers.expiresAt > now) return cachedDevelopers.developers;

  const response = await fetch(TRENDING_DEVELOPERS_URL, {
    headers: {
      accept: "text/html",
      "user-agent": "FindDevs/1.0 (+https://github.com/forzayt/Find_Devs)",
    },
    signal,
  });
  if (!response.ok) throw new Error(`GitHub Trending Developers returned ${response.status}.`);

  const developers = parseTrendingDevelopers(await response.text()).slice(0, 10);
  if (!developers.length) throw new Error("GitHub Trending returned no developers.");

  cachedDevelopers = { developers, expiresAt: now + CACHE_TTL_MS };
  return developers;
}
