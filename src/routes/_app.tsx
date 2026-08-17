import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppSidebar } from "@/components/app-shell/sidebar";
import { ConnectionBanner, Topbar } from "@/components/app-shell/topbar";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.loading && !auth.user) {
      navigate({ to: auth.configured === false ? "/setup" : "/login" });
    }
  }, [auth.loading, auth.user, auth.configured, navigate]);

  if (auth.loading || !auth.user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Loading wFileManager…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <div className="hidden lg:flex">
        <AppSidebar />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <div className="flex min-w-0 flex-1 flex-col" style={{ paddingTop: "3rem" }}>
          <ConnectionBanner />
          <main className="flex min-w-0 flex-1 flex-col" style={{ paddingTop: "1rem" }}>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
