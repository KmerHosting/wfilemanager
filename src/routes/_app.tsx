import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { Content, HeaderContainer, Loading } from "@carbon/react";
import { useEffect } from "react";
import { AppSidebar } from "@/components/app-shell/sidebar";
import { ConnectionBanner, Topbar } from "@/components/app-shell/topbar";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppShell() {
  return (
    <HeaderContainer
      render={({ isSideNavExpanded, onClickSideNavExpand }) => (
        <>
          <Topbar expanded={isSideNavExpanded} onToggle={onClickSideNavExpand} />
          <AppSidebar
            expanded={isSideNavExpanded}
            onOverlayClick={isSideNavExpanded ? onClickSideNavExpand : undefined}
          />
          <Content id="main-content" className="wfm-app-content">
            <ConnectionBanner />
            <Outlet />
          </Content>
        </>
      )}
    />
  );
}

function AppLoadingShell() {
  return (
    <>
      <div aria-hidden="true" inert>
        <AppShell />
      </div>
      <Loading description="Loading wFileManager" withOverlay />
    </>
  );
}

function AppLayout() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.loading && !auth.user) {
      navigate({ to: auth.configured === false ? "/setup" : "/login", replace: true });
    }
  }, [auth.loading, auth.user, auth.configured, navigate]);

  if (auth.loading) {
    return <AppLoadingShell />;
  }

  if (!auth.user) {
    return null;
  }

  return <AppShell />;
}
