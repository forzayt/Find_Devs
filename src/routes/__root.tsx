import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    // Replace these placeholders with the app's name and description when first building the app.
    // Each content route, / included, must still set its own head(). Never add og:image or
    // twitter:image here: every page without its own would inherit the root's preview image.
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "FindDevs — See what developers are building" },
      { name: "description", content: "A live window into what developers are building across GitHub." },
      { name: "author", content: "forzayt" },
      // ── Theme & Browsing ──
      { name: "theme-color", content: "#6763E8" },
      { name: "robots", content: "index, follow" },
      { name: "referrer-policy", content: "strict-origin-when-cross-origin" },
      // ── Open Graph ──
      { property: "og:title", content: "FindDevs — See what developers are building" },
      { property: "og:description", content: "A live window into what developers are building across GitHub." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://find-devs-hub.vercel.app/" },
      { property: "og:site_name", content: "FindDevs" },
      { property: "og:locale", content: "en_US" },
      { property: "og:locale:all", content: "en,es,pt,fr,de" },
      { property: "og:article:published_time", content: "2024-01-01T00:00:00Z", typeof: "datetime" },
      { property: "og:article:author", content: "forzayt" },
      { property: "og:article:author.url", content: "https://forzayt.github.io/" },
      { property: "og:app:site_name", content: "FindDevs" },
      // ── Twitter Cards ──
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@forzayt" },
      { name: "twitter:creator", content: "@forzayt" },
      { name: "twitter:description", content: "A live window into what developers are building across GitHub." },
      // ── Dublin Core ──
      { name: "DC:creator", content: "forzayt" },
      { name: "DC:keywords", content: "developers,github,open-source,projects,tech" },
      // ── Microsoft Cards ──
      { name: "msapplication:theme-color", content: "#6763E8" },
    ],
    links: [
      // ── Preconnect for perf ──
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://images.unsplash.com" },
      // ── Stylesheets ──
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" },
      { rel: "stylesheet", href: appCss },
      // ── Icons & Favicon ──
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/favicon.svg" },
      { rel: "apple-touch-icon-size", href: "180x180" },
      // ── Canonical & RSS ──
      { rel: "canonical", href: "https://find-devs-hub.vercel.app/" },
      { rel: "alternate", href: "https://find-devs-hub.vercel.app/feed.xml", type: "application/rss+xml", title: "FindDevs — RSS Feed" },
      // ── Open Graph image (fallback for the root — each page should override) ──
      { property: "og:image", content: "https://find-devs-hub.vercel.app/favicon.ico" },
      { property: "og:image:alt", content: "FindDevs logo — Developer building showcase" },
      // ── Twitter image (fallback) ──
      { name: "twitter:image", content: "https://find-devs-hub.vercel.app/favicon.ico" },
      // ── Preload ──
      { rel: "preload", href: "/fonts/IBM+Plex+Mono.woff2", as: "font", type: "font/vnd.ms-fontobject", crossorigin: "anonymous" },
      // ── Manifest (for PWA) ──
      { rel: "manifest", href: "/manifest.json" },
      // ── Web App: browser ──
      { rel: "webapp:browser", href: "/manifest.json" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
