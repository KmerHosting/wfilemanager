import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Laptop, Light, Logout, Moon, UserAvatar } from "@carbon/icons-react";
import {
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderMenuButton,
  HeaderName,
  InlineLoading,
  InlineNotification,
  SkipToContent,
} from "@carbon/react";
import { useAuth } from "@/lib/auth";
import { useNotifications } from "@/lib/notifications";
import { useTheme } from "@/lib/theme";

export function Topbar({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const { theme, setTheme } = useTheme();
  const auth = useAuth();
  const navigate = useNavigate();
  const { notify } = useNotifications();

  const cycleTheme = () => {
    const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
    notify({ kind: "info", title: "Theme changed", subtitle: `Using ${next} theme.` });
  };

  const ThemeIcon = theme === "dark" ? Moon : theme === "system" ? Laptop : Light;

  return (
    <Header aria-label="wFileManager" className="wfm-carbon-header">
      <SkipToContent />
      <HeaderMenuButton
        aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
        isActive={expanded}
        onClick={onToggle}
      />
      <HeaderName href="/explorer" prefix="">
        wFileManager
      </HeaderName>
      <HeaderGlobalBar>
        <HeaderGlobalAction
          aria-label={`Theme: ${theme}. Change theme`}
          tooltipAlignment="end"
          onClick={cycleTheme}
        >
          <ThemeIcon size={20} />
        </HeaderGlobalAction>
        <HeaderGlobalAction
          aria-label={`${auth.user?.isAdmin ? "Administrator" : "User"} account: ${auth.user?.username || "unknown"}`}
          tooltipAlignment="end"
          onClick={() => navigate({ to: "/account" })}
        >
          <UserAvatar size={20} />
        </HeaderGlobalAction>
        <HeaderGlobalAction
          aria-label="Sign out"
          tooltipAlignment="end"
          onClick={async () => {
            await auth.logout();
            navigate({ to: "/login" });
          }}
        >
          <Logout size={20} />
        </HeaderGlobalAction>
      </HeaderGlobalBar>
    </Header>
  );
}

export function ConnectionBanner() {
  const [state, setState] = useState<"checking" | "connected" | "failed">("checking");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const health = await fetch("/api/health?scope=application", { cache: "no-store" });
        if (!health.ok) throw new Error("Application health check failed");
        if (active) setState("connected");
      } catch {
        if (active) setState("failed");
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (state === "connected") return null;

  return (
    <div className="wfm-connection-region">
      {state === "checking" ? (
        <InlineLoading description="Checking local wFileManager service…" />
      ) : (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Local service unavailable"
          subtitle="The interface cannot currently reach the wFileManager service on this server."
        />
      )}
    </div>
  );
}
