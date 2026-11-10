import { describe, expect, it } from "vitest";

import { parseTrendingRepositories } from "@/lib/github-trending";

describe("parseTrendingRepositories", () => {
  it("reads daily and total stars from a GitHub Trending repository card", () => {
    const html = `
      <article class="Box-row">
        <h2><a href="/openai/codex">openai / codex</a></h2>
        <p class="col-9">A coding agent</p>
        <span itemprop="programmingLanguage">Rust</span>
        <a href="/openai/codex/stargazers"><svg></svg> 52,340</a>
        <span>1,204 stars today</span>
      </article>
    `;

    expect(parseTrendingRepositories(html)).toEqual([
      {
        name: "openai/codex",
        description: "A coding agent",
        language: "Rust",
        starsToday: 1204,
        totalStars: 52340,
      },
    ]);
  });
});
