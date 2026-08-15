import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Button } from "@carbon/react";

import carbonCss from "../carbon.scss?url";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ThemeProvider } from "../lib/theme";
import { Toaster } from "sonner";
import { AuthProvider } from "../lib/auth";

function NotFoundComponent() {
  return (
    <div className="wfm-state-page">
      <div className="wfm-state-page__content">
        <p className="wfm-eyebrow">404 · not found</p>
        <h1>That path does not exist</h1>
        <p>The page you were looking for has been moved, renamed, or never existed.</p>
        <Button href="/" kind="primary">
          Go to overview
        </Button>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="wfm-state-page">
      <div className="wfm-state-page__content">
        <h1>This page didn't load</h1>
        <p>Something went wrong. Try again or head back to the overview.</p>
        <div className="wfm-button-row">
          <Button
            kind="primary"
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Try again
          </Button>
          <Button href="/" kind="tertiary">
            Go to overview
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "wFileManager — Linux file manager for servers" },
      {
        name: "description",
        content:
          "wFileManager is a web-based file manager for Linux servers. Browse, edit, upload, share and audit files with a modern administration panel. A project from KmerHosting LLC.",
      },
      { name: "author", content: "KmerHosting LLC" },
      { name: "theme-color", content: "#f4f4f4" },
      { property: "og:title", content: "wFileManager — Linux file manager for servers" },
      {
        property: "og:description",
        content:
          "A modern, web-based Linux file manager built for Ubuntu servers. A project from KmerHosting LLC.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: carbonCss },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" style={{ colorScheme: "light" }}>
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
      <ThemeProvider>
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Toaster position="bottom-right" theme="system" richColors closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
