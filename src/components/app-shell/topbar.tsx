import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Checkmark,
  CheckmarkOutline,
  ErrorOutline,
  Information,
  Laptop,
  Light,
  Logout,
  Moon,
  Notification,
  TrashCan,
  UserAvatar,
  WarningAlt,
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
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useTheme } from "@/lib/theme";
import { AppSidebar } from "./sidebar";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { wfilemanagerApi } from "@/lib/wfilemanager-api";
import { useNotifications } from "@/lib/notifications";
import { formatRelative } from "@/lib/format";

export function Topbar() {
  const { theme, setTheme } = useTheme();
  const auth = useAuth();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const notifications = useNotifications();

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

      <HeaderName href="/" prefix="">
        wFileManager
      </HeaderName>

      <HeaderGlobalBar>
        <CarbonPopover
          open={notifOpen}
          autoAlign
          align="bottom-end"
          caret={false}
          border
          className="wfm-header-popover"
          onRequestClose={() => setNotifOpen(false)}
        >
          <HeaderGlobalAction
            aria-label="Notifications"
            className="relative"
            isActive={notifOpen}
            onClick={() => {
              setNotifOpen((open) => !open);
              setThemeOpen(false);
              setAccountOpen(false);
              if (!notifOpen) void notifications.refresh();
            }}
          >
            <Notification size={20} />
            {notifications.unreadCount > 0 && (
              <span className="wfm-carbon-header__count">
                {notifications.unreadCount > 99 ? "99+" : notifications.unreadCount}
              </span>
            )}
          </HeaderGlobalAction>
          <CarbonPopoverContent className="wfm-notifications-panel">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <div className="text-sm font-semibold">Notifications</div>
                <div className="text-xs text-muted-foreground">
                  Automatically removed after 7 days
                </div>
              </div>
              {notifications.unreadCount > 0 && (
                <button
                  onClick={() => void notifications.markAllRead()}
                  className="text-xs text-primary hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.loading && notifications.notifications.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Loading notifications…
                </div>
              ) : notifications.notifications.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No notifications.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {notifications.notifications.slice(0, 6).map((item) => {
                    const ToneIcon =
                      item.tone === "success"
                        ? CheckmarkOutline
                        : item.tone === "warning"
                          ? WarningAlt
                          : item.tone === "error"
                            ? ErrorOutline
                            : Information;
                    return (
                      <li key={item.id} className={!item.readAt ? "bg-primary/[0.05]" : undefined}>
                        <div className="flex items-start gap-3 p-4">
                          <ToneIcon
                            size={20}
                            className={
                              item.tone === "error"
                                ? "mt-0.5 shrink-0 text-destructive"
                                : item.tone === "warning"
                                  ? "mt-0.5 shrink-0 text-warning"
                                  : "mt-0.5 shrink-0 text-primary"
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-2">
                              <p className="flex-1 text-sm font-medium">{item.title}</p>
                              {!item.readAt && <span className="mt-1.5 h-1.5 w-1.5 bg-primary" />}
                            </div>
                            {item.message && (
                              <p className="mt-1 text-xs text-muted-foreground">{item.message}</p>
                            )}
                            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                              <span>{formatRelative(item.createdAt)}</span>
                              {!item.readAt && (
                                <button
                                  onClick={() => void notifications.markRead(item.id)}
                                  className="hover:text-foreground"
                                >
                                  Mark read
                                </button>
                              )}
                              {item.link && (
                                <a
                                  href={item.link}
                                  onClick={() => void notifications.markRead(item.id)}
                                  className="hover:text-foreground"
                                >
                                  Open
                                </a>
                              )}
                            </div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            aria-label="Delete notification"
                            onClick={() => void notifications.remove(item.id)}
                          >
                            <TrashCan size={16} />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border p-3">
              <Link
                to="/notifications"
                onClick={() => setNotifOpen(false)}
                className="text-xs text-primary hover:underline"
              >
                Open notification center
              </Link>
              {notifications.notifications.length > 0 && (
                <button
                  onClick={() => void notifications.clearAll()}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Clear all
                </button>
              )}
            </div>
          </CarbonPopoverContent>
        </CarbonPopover>

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
              setNotifOpen(false);
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
              setNotifOpen(false);
              setThemeOpen(false);
            }}
          >
            <UserAvatar size={20} />
          </HeaderGlobalAction>
          <CarbonPopoverContent className="wfm-account-panel">
            <div className="wfm-account-panel__identity">
              <span className="wfm-account-panel__name">
                {auth.user?.displayName || auth.user?.username}
              </span>
              <span className="wfm-account-panel__role">
                {auth.user?.isAdmin ? "Administrator" : auth.user?.roleName || "User"}
              </span>
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
  const [onlineUsers, setOnlineUsers] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const health = await fetch("/api/health?scope=application", { cache: "no-store" });
        if (!health.ok) throw new Error("Application health check failed");
        const presence = await wfilemanagerApi.onlineUsers();
        if (!active) return;
        setOnlineUsers(presence.onlineUsers);
        setState("connected");
      } catch {
        if (!active) return;
        setState("failed");
        setOnlineUsers(null);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const label =
    state === "checking"
      ? "Checking active users…"
      : state === "connected"
        ? `${onlineUsers ?? 0} ${onlineUsers === 1 ? "user" : "users"} online`
        : "Unable to read the current online-user count.";
  return (
    <div className={`wfm-connection-banner wfm-connection-banner--${state}`}>
      <span className="wfm-connection-banner__dot" />
      <span>{label}</span>
    </div>
  );
}
