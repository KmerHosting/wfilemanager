import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { Content, HeaderContainer, Loading, SkeletonText, Tile } from "@carbon/react";
import { useEffect } from "react";
import { AppSidebar } from "@/components/app-shell/sidebar";
import { ConnectionBanner, Topbar } from "@/components/app-shell/topbar";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLoadingShell() {
  return (
    <>
      <div aria-hidden="true" inert>
        <HeaderContainer
          render={({ isSideNavExpanded, onClickSideNavExpand }) => (
            <>
              <Topbar expanded={isSideNavExpanded} onToggle={onClickSideNavExpand} />
              <AppSidebar expanded={isSideNavExpanded} />
              <Content className="wfm-app-content">
                <section className="wfm-page">
                  <header className="wfm-page__header">
                    <div>
                      <SkeletonText heading width="38%" />
                      <SkeletonText width="58%" />
                    </div>
                  </header>
                  <Tile className="wfm-panel-tile">
                    <SkeletonText heading width="30%" />
                    <SkeletonText paragraph lineCount={6} width="92%" />
                  </Tile>
                </section>
              </Content>
            </>
          )}
        />
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
      navigate({ to: auth.configured === false ? "/setup" : "/login" });
    }
  }, [auth.loading, auth.user, auth.configured, navigate]);

  if (auth.loading || !auth.user) {
    return <AppLoadingShell />;
  }

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
