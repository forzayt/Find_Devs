# Find Devs

A window into what developers are building across GitHub. Find Devs is a TanStack Start activity feed that reads [GitHub Archive](https://www.gharchive.org/)'s public hourly dumps and presents real pushes, new repositories, pull requests, releases, and issues — no GitHub account, API key, or database required.

## How it works

Find Devs is a single-page TanStack Start application. The server renders the shell and route metadata (via `src/routes/__root.tsx` and `src/server.ts`), and a small server route (`src/routes/api/events.ts`) reads GitHub Archive's dumps. The browser never calls the official GitHub API, so no shared hourly quota is ever consumed.

### Data flow

1. On mount, the `/` route (`src/routes/index.tsx`) requests the latest activity from the local feed endpoint:
   ```
   GET /api/events?per_page=100
   ```
2. `src/lib/gh-archive.ts` downloads the newest complete hourly dump from `https://data.gharchive.org/<YYYY-MM-DD-H>.json.gz`, decompresses it as a stream, and keeps only the newest events the UI understands:
   - `PushEvent`
   - `CreateEvent`
   - `PullRequestEvent`
   - `ReleaseEvent`
   - `IssuesEvent`
3. Parsed events are cached in memory for five minutes, so repeated polls reuse the already decompressed hour instead of downloading it again.
4. Events are rendered as activity cards and can be narrowed with the feed filters.
5. Sidebar summaries are derived from the same payload:
   - **Trending repositories** — repositories with the most events in the current feed.
   - **Around the community** — unique developers who appear in the feed.
   - **What's happening** — event types present in the current feed.

### Freshness and polling

GitHub Archive publishes each hour's events shortly after the hour ends, so the archived data trails GitHub by roughly one to two hours. To keep the page moving in the meantime, the client queues each batch of archived events and reveals them one per second — the feed visibly streams new cards every second while the underlying hour is a replay.

- **Reveal rate** — one queued event per second, so a 500-event batch streams for over eight minutes.
- **Polling interval** — the feed endpoint advertises `X-Poll-Interval: 180`; the client waits at least three minutes between checks.
- **Conditional requests** — the endpoint returns an `ETag`; a matching `If-None-Match` yields `304 Not Modified` without re-reading the archive.
- **Server-side cache** — the parsed hour is reused for five minutes.
- **Background tabs** — polling skips network requests while the page is hidden and resumes on the next scheduled check after the tab becomes visible.
- **Manual refresh** — the header button restarts the polling cycle immediately.

If GitHub Archive is unavailable, the app keeps any already-loaded activity visible and offers a retry action.

### UI states

- Loading skeletons while the first request is in flight.
- Inline error banner with a "Try again" action.
- Empty states for filtered feeds, unavailable feeds, and empty sidebar sections.
- Responsive layout: three columns on large screens, stacked navigation and feed on mobile.
- Relative timestamps ("now", "5m ago", "2h ago") with full dates on hover.

## Features

- Real public GitHub activity from GitHub Archive's hourly dumps.
- Filters for **All**, **Pushes**, **Repositories**, **Pull Requests**, and **Releases**.
- Rich activity cards with actor avatars, repository links, branch names, commit IDs, commit messages, PR/issue/release context, and direct links to GitHub.
- Sidebar insights for trending repositories, active developers, and event types.
- Accessible tabs, alerts, and navigation labels.
- Dark/light design tokens defined in Tailwind v4 (`src/styles.css`).

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | React 19 + TypeScript |
| Meta-framework | TanStack Start |
| Routing | TanStack Router |
| Data fetching | Browser `fetch` + a server route reading GitHub Archive |
| Styling | Tailwind CSS v4 |
| UI primitives | shadcn/ui + Radix UI |
| Icons | lucide-react |
| Testing | Vitest + Testing Library |
| Build tool | Vite |

## Getting started

### Prerequisites

- Node.js 20.19+ or 22.12+ (or Bun)
- Network access to `data.gharchive.org`

### Install

```bash
npm install
```

or

```bash
bun install
```

### Run the development server

```bash
npm run dev
```

The app starts on the Vite dev server (default `http://localhost:5173`).

### Build and preview

```bash
npm run build
npm run preview
```

### Test, lint, and format

```bash
npm test
npm run lint
npm run format
```

## Project structure

```
src/
├── routes/
│   ├── __root.tsx        # App shell, metadata, 404 and error boundaries
│   ├── index.tsx         # The feed: filters, cards, sidebars
│   └── api/
│       └── events.ts     # Server route serving archived events
├── components/ui/        # shadcn/ui primitives
├── hooks/                # Shared React hooks
├── lib/                  # Utilities, error reporting, GitHub Archive reader
├── router.tsx            # Router + QueryClient factory
├── routeTree.gen.ts      # Generated route tree (do not edit)
├── server.ts             # SSR entry with catastrophic-error handling
├── start.ts              # Request middleware (error handling, CSRF)
├── styles.css            # Tailwind v4 theme and design tokens
└── test/                 # Routing tests
```

## Notes

- No API keys or secrets are used; the app does not call `api.github.com`.
- GitHub Archive dumps are public and cover every public event, but they lag by about an hour.
- `src/routeTree.gen.ts` is generated by TanStack Router and should not be edited by hand.
- Schema, database, and deployment configuration are managed through Lovable; see `AGENTS.md` before changing generated files or migrations.

## Roadmap

See [roadmap.md](roadmap.md) for the current Phase 1 status.
