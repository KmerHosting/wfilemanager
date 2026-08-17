import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Checkmark,
  Laptop,
  Light,
  Logout,
  Moon,
  UserAvatar,
} from "@carbon/icons-react";
import {
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderMenuButton,
  HeaderName,
  Popover as CarbonPopover,
  PopoverContent as CarbonPopoverContent,
  SkipToContent,
} from "@carbon/react";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useTheme } from "@/lib/theme";
import { AppSidebar } from "./sidebar";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export function Topbar() {
  const { theme, setTheme } = useTheme();
  const auth = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [themeOpen, setThemeOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    setThemeOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  return (
    <Header aria-label="wFileManager" className="wfm-carbon-header">
      <SkipToContent />
      <Sheet>
        <SheetTrigger asChild>
          <HeaderMenuButton
            aria-label="Open navigation"
            isActive={false}
            className="wfm-mobile-nav-action"
          />
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetClose asChild>
            <div className="h-full">
              <AppSidebar className="wfm-carbon-sidenav--mobile" />
            </div>
          </SheetClose>
        </SheetContent>
      </Sheet>

      <HeaderName href="/explorer" prefix="">
        wFileManager
      </HeaderName>

      <HeaderGlobalBar>
        <CarbonPopover
          open={themeOpen}
          autoAlign
          align="bottom-end"
          caret={false}
          border
          className="wfm-header-popover"
          onRequestClose={() => setThemeOpen(false)}
        >
          <HeaderGlobalAction
            aria-label="Theme"
            isActive={themeOpen}
            onClick={() => {
              setThemeOpen((open) => !open);
              setAccountOpen(false);
            }}
          >
            {theme === "dark" ? (
              <Moon size={20} />
            ) : theme === "light" ? (
              <Light size={20} />
            ) : (
              <Laptop size={20} />
            )}
          </HeaderGlobalAction>
          <CarbonPopoverContent className="wfm-theme-panel">
            <div className="wfm-theme-panel__label">Theme</div>
            {(["light", "dark", "system"] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={`wfm-theme-panel__item${theme === item ? " wfm-theme-panel__item--active" : ""}`}
                onClick={() => {
                  setTheme(item);
                  setThemeOpen(false);
                }}
              >
                {item === "light" ? (
                  <Light size={16} />
                ) : item === "dark" ? (
                  <Moon size={16} />
                ) : (
                  <Laptop size={16} />
                )}
                <span className="capitalize">{item}</span>
                {theme === item && <Checkmark size={16} className="wfm-theme-panel__check" />}
              </button>
            ))}
          </CarbonPopoverContent>
        </CarbonPopover>

        <CarbonPopover
          open={accountOpen}
          autoAlign
          align="bottom-end"
          caret={false}
          border
          className="wfm-header-popover"
          onRequestClose={() => setAccountOpen(false)}
        >
          <HeaderGlobalAction
            aria-label="Account menu"
            className="wfm-carbon-header__account"
            isActive={accountOpen}
            onClick={() => {
              setAccountOpen((open) => !open);
              setThemeOpen(false);
            }}
          >
            <UserAvatar size={20} />
          </HeaderGlobalAction>
          <CarbonPopoverContent className="wfm-account-panel">
            <div className="wfm-account-panel__identity">
              <span className="wfm-account-panel__name">
                {auth.user?.displayName || "Administrator"}
              </span>
              <span className="wfm-account-panel__role">Administrator</span>
            </div>
            <Link to="/account" className="wfm-account-panel__item">
              <UserAvatar size={16} />
              <span>Account</span>
            </Link>
            <button
              type="button"
              className="wfm-account-panel__item wfm-account-panel__item--danger"
              onClick={async () => {
                await auth.logout();
                setAccountOpen(false);
                toast.success("Signed out");
                navigate({ to: "/login" });
              }}
            >
              <Logout size={16} />
              <span>Sign out</span>
            </button>
          </CarbonPopoverContent>
        </CarbonPopover>
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
    <div className={`wfm-connection-banner wfm-connection-banner--${state}`}>
      <span className="wfm-connection-banner__dot" />
      <span>{state === "checking" ? "Checking local service…" : "Local service unavailable."}</span>
    </div>
  );
}
