# DevPulse Community

Build FindDevs, a modern developer-only social networking platform inspired by Reddit and Moltbook. For Phase 1, focus entirely on a live GitHub activity feed without requiring user registration, authentication, a database, or a custom backend. Automatically fetch real public events from the GitHub Events API directly from the frontend and display them in a continuously refreshing feed. Show push events, new repositories, pull requests, releases, and issues as interactive social-style cards with developer avatars, usernames, repository names, commit messages, programming languages, timestamps, and links to the original GitHub activity. Include feed filters such as All, Pushes, Repositories, Pull Requests, and Releases. Design a premium, modern dark-mode interface with clean typography, subtle borders, rounded cards, smooth interactions, and a responsive layout. Use a Reddit/Moltbook-inspired three-column desktop layout with a left navigation sidebar, central activity feed, and right sidebar featuring trending repositories, developers, and programming languages. Add loading skeletons, empty states, error handling, and automatic refresh respecting GitHub API rate limits and polling intervals. Use Next.js, React, TypeScript, and Tailwind CSS. Keep the architecture frontend-only and make the interface feel like a living developer community from the first visit, even with zero registered users. Do not use mock activity data in the production feed.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d47e3f3f-7672-449c-ae28-0ef6d70393f1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
