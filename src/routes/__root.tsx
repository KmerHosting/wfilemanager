import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import { Button, InlineNotification } from "@carbon/react";
import { useEffect, type ReactNode } from "react";

import carbonCss from "../carbon.scss?url";
import appCss from "../styles.scss?url";
import { AuthProvider } from "../lib/auth";
import { NotificationProvider } from "../lib/notifications";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ThemeProvider } from "../lib/theme";

function NotFoundComponent() {
  return (
    <div className="wfm-state-page">
      <section className="wfm-state-page__content" aria-labelledby="not-found-heading">
        <h1 id="not-found-heading">That path does not exist</h1>
        <p>The page you were looking for has been moved, renamed, or never existed.</p>
        <Button href="/" kind="primary">
          Go to overview
        </Button>
      </section>
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
      <section className="wfm-state-page__content" aria-labelledby="error-heading">
        <h1 id="error-heading">This page did not load</h1>
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="wFileManager could not render this page"
          subtitle="Try again. If the problem continues, check the service logs on the server."
        />
        <div className="wfm-button-row wfm-space-top">
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
      </section>
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
          "wFileManager is a self-hosted web file manager for browsing, editing, transferring and archiving files on Linux servers.",
      },
      { name: "author", content: "KmerHosting LLC" },
      { name: "theme-color", content: "#161616" },
      { property: "og:title", content: "wFileManager — Linux file manager for servers" },
      {
        property: "og:description",
        content: "Browse, edit, upload, archive and recover files directly on a Linux server.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: carbonCss },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
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
        <NotificationProvider>
          <AuthProvider>
            <Outlet />
          </AuthProvider>
        </NotificationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
