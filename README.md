# Find Devs

A live window into what developers are building across GitHub. Find Devs is a browser-only activity feed that reads GitHub's public REST API and presents real pushes, new repositories, pull requests, releases, and issues as they happen — no account, API key, or database required.

## How it works

Find Devs is a single-page TanStack Start application. The server renders the shell and route metadata (via `src/routes/__root.tsx` and `src/server.ts`), while all feed data is fetched directly from the browser to `https://api.github.com/events`.

### Data flow

1. On mount, the `/` route (`src/routes/index.tsx`) requests the latest public events:
   ```
   GET https://api.github.com/events?per_page=100
   ```
2. The response is filtered to the event types the UI understands:
   - `PushEvent`
   - `CreateEvent`
   - `PullRequestEvent`
   - `ReleaseEvent`
   - `IssuesEvent`
3. Events are rendered as activity cards and can be narrowed with the feed filters.
4. After each successful load, the app refreshes small sidebar summaries from the same payload:
   - **Trending repositories** — repositories with the most events in the current feed.
   - **Around the community** — unique developers who appear in the feed.
   - **Languages in the mix** — derived from optional repository metadata.
5. Optional enrichment requests (repository language/stars and commit messages) are made at most **three times each per browser session**, so the events endpoint remains the only repeatedly-polled request.

### Polling and rate limits

The feed is designed to stay within GitHub's public API guidance:

- **Server-provided interval** — reads `X-Poll-Interval` and waits at least that long between requests.
- **Fallback interval** — `60s` when GitHub does not provide a poll interval (GitHub's recommended minimum).
- **Conditional requests** — sends the last `ETag` as `If-None-Match`; a `304 Not Modified` updates the "last checked" time without replacing the feed.
- **Rate limiting** — on `403` with an exhausted `X-RateLimit-Remaining`, the UI shows a message and waits until `X-RateLimit-Reset`. On `429`, it honors `Retry-After`.
- **Background tabs** — polling skips network requests while the page is hidden and resumes on the next scheduled check after the tab becomes visible.
- **Manual refresh** — the header button restarts the polling cycle immediately.

Because the public feed is unauthenticated, limits are shared per IP address. If GitHub is unavailable or rate-limited, the app keeps any already-loaded activity visible and offers a retry action.

### UI states

- Loading skeletons while the first request is in flight.
- Inline error banner with a "Try again" action.
- Empty states for filtered feeds, unavailable feeds, and empty sidebar sections.
- Responsive layout: three columns on large screens, stacked navigation and feed on mobile.
- Relative timestamps ("now", "5m ago", "2h ago") with full dates on hover.

## Features

- Real public GitHub activity, streamed into a three-column feed.
- Filters for **All**, **Pushes**, **Repositories**, **Pull Requests**, and **Releases**.
- Rich activity cards with actor avatars, repository links, branch names, commit IDs, commit messages, PR/issue/release context, and direct links to GitHub.
- Sidebar insights for trending repositories, active developers, and languages.
- Accessible tabs, alerts, and navigation labels.
- Dark/light design tokens defined in Tailwind v4 (`src/styles.css`).

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | React 19 + TypeScript |
| Meta-framework | TanStack Start |
| Routing | TanStack Router |
| Data fetching | Browser `fetch` (TanStack Query provider available) |
| Styling | Tailwind CSS v4 |
| UI primitives | shadcn/ui + Radix UI |
| Icons | lucide-react |
| Testing | Vitest + Testing Library |
| Build tool | Vite |

## Getting started

### Prerequisites

- Node.js 20.19+ or 22.12+ (or Bun)
- Network access to `api.github.com`

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
│   └── index.tsx         # The feed: fetching, filters, cards, sidebars
├── components/ui/        # shadcn/ui primitives
├── hooks/                # Shared React hooks
├── lib/                  # Utilities and error reporting
├── router.tsx            # Router + QueryClient factory
├── routeTree.gen.ts      # Generated route tree (do not edit)
├── server.ts             # SSR entry with catastrophic-error handling
├── start.ts              # Request middleware (error handling, CSRF)
├── styles.css            # Tailwind v4 theme and design tokens
└── test/                 # Routing tests
```

## Notes

- No API keys or secrets are used; all requests target GitHub's public, unauthenticated API.
- Repository and commit enrichment is best-effort. Cards render fully without it.
- `src/routeTree.gen.ts` is generated by TanStack Router and should not be edited by hand.
- Schema, database, and deployment configuration are managed through Lovable; see `AGENTS.md` before changing generated files or migrations.

## Roadmap

See [roadmap.md](roadmap.md) for the current Phase 1 status.
