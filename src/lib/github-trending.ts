export type TrendingRepository = {
  name: string;
  description: string;
  language: string;
  starsToday: number;
};

const TRENDING_URL = "https://github.com/trending?since=daily";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cachedTrending: { repositories: TrendingRepository[]; expiresAt: number } | undefined;

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

export function parseTrendingRepositories(html: string): TrendingRepository[] {
  const articles =
    html.match(/<article\b[^>]*class="[^"]*Box-row[^"]*"[^>]*>[\s\S]*?<\/article>/gi) ?? [];

  return articles.flatMap((article) => {
    const repositoryMatch = article.match(/<h2\b[\s\S]*?<a\b[^>]*href="\/([^"?#]+)"/i);
    if (!repositoryMatch) return [];

    const name = decodeHtml(repositoryMatch[1]).replace(/^\/+|\/+$/g, "");
    if (name.split("/").length !== 2) return [];

    const descriptionMatch = article.match(
      /<p\b[^>]*class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
    );
    const languageMatch = article.match(/itemprop="programmingLanguage"[^>]*>([\s\S]*?)<\//i);
    const starsMatch = article.match(/([\d,]+)\s+stars?\s+today/i);

    return [
      {
        name,
        description: descriptionMatch ? textContent(descriptionMatch[1]) : "",
        language: languageMatch ? textContent(languageMatch[1]) : "",
        starsToday: starsMatch ? Number(starsMatch[1].replace(/,/g, "")) : 0,
      },
    ];
  });
}

export async function loadTrendingRepositories(signal?: AbortSignal) {
  const now = Date.now();
  if (cachedTrending && cachedTrending.expiresAt > now) return cachedTrending.repositories;

  const response = await fetch(TRENDING_URL, {
    headers: {
      accept: "text/html",
      "user-agent": "FindDevs/1.0 (+https://github.com/forzayt/Find_Devs)",
    },
    signal,
  });
  if (!response.ok) throw new Error(`GitHub Trending returned ${response.status}.`);

  const repositories = parseTrendingRepositories(await response.text()).slice(0, 10);
  if (!repositories.length) throw new Error("GitHub Trending returned no repositories.");

  cachedTrending = { repositories, expiresAt: now + CACHE_TTL_MS };
  return repositories;
}
