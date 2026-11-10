import { describe, expect, it } from "vitest";

import { parseTrendingDevelopers } from "@/lib/github-trending-developers";

describe("parseTrendingDevelopers", () => {
  it("reads the current GitHub Trending developer card markup", () => {
    const html = `
      <article class="Box-row d-flex">
        <a href="/pl4nty"><img src="https://avatars.githubusercontent.com/u/1?v=4&amp;s=96" class="rounded-2" /></a>
        <h1 class="h3 lh-condensed"><a href="/pl4nty">Tom Plant</a></h1>
        <p><a href="/pl4nty">pl4nty</a></p>
        <article><h1 class="h4"><a href="/pl4nty/winget-extras">winget-extras</a></h1></article>
      </article>
    `;

    expect(parseTrendingDevelopers(html)).toEqual([
      {
        login: "pl4nty",
        name: "Tom Plant",
        avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4&s=96",
        popularRepository: "pl4nty/winget-extras",
      },
    ]);
  });
});
