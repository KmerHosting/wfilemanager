import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Menu,
  Moon,
  Sun,
  Monitor,
  LogOut,
  UserCircle2,
  Check,
  CircleCheck,
  CircleAlert,
  CircleX,
  Info,
  Trash2,
} from "lucide-react";
import {
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderName,
  SkipToContent,
} from "@carbon/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const notifications = useNotifications();

  return (
    <Header aria-label="wFileManager" className="wfm-carbon-header">
      <SkipToContent />
      <Sheet>
        <SheetTrigger asChild>
          <HeaderGlobalAction
            aria-label="Open navigation"
            className="wfm-mobile-nav-action lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </HeaderGlobalAction>
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
        <Popover
          open={notifOpen}
          onOpenChange={(open) => {
            setNotifOpen(open);
            if (open) void notifications.refresh();
          }}
        >
          <PopoverTrigger asChild>
            <HeaderGlobalAction aria-label="Notifications" className="relative">
              <Bell className="h-4 w-4" />
              {notifications.unreadCount > 0 && (
                <span className="wfm-carbon-header__count">
                  {notifications.unreadCount > 99 ? "99+" : notifications.unreadCount}
                </span>
              )}
            </HeaderGlobalAction>
          </PopoverTrigger>
          <PopoverContent className="w-96 rounded-none border-border p-0 shadow-none" align="end">
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
                        ? CircleCheck
                        : item.tone === "warning"
                          ? CircleAlert
                          : item.tone === "error"
                            ? CircleX
                            : Info;
                    return (
                      <li key={item.id} className={!item.readAt ? "bg-primary/[0.05]" : undefined}>
                        <div className="flex items-start gap-3 p-4">
                          <ToneIcon
                            className={
                              item.tone === "error"
                                ? "mt-0.5 h-4 w-4 shrink-0 text-destructive"
                                : item.tone === "warning"
                                  ? "mt-0.5 h-4 w-4 shrink-0 text-warning"
                                  : "mt-0.5 h-4 w-4 shrink-0 text-primary"
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
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                            aria-label="Delete notification"
                            onClick={() => void notifications.remove(item.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <HeaderGlobalAction aria-label="Theme">
              {theme === "dark" ? (
                <Moon className="h-4 w-4" />
              ) : theme === "light" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Monitor className="h-4 w-4" />
              )}
            </HeaderGlobalAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 rounded-none shadow-none">
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(["light", "dark", "system"] as const).map((item) => (
              <DropdownMenuItem key={item} onClick={() => setTheme(item)}>
                {item === "light" ? (
                  <Sun className="mr-2 h-4 w-4" />
                ) : item === "dark" ? (
                  <Moon className="mr-2 h-4 w-4" />
                ) : (
                  <Monitor className="mr-2 h-4 w-4" />
                )}
                <span className="capitalize">{item}</span>
                {theme === item && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <HeaderGlobalAction aria-label="Account menu" className="wfm-carbon-header__account">
              <span className="wfm-carbon-header__avatar">
                {(auth.user?.displayName || auth.user?.username || "A")
                  .split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
            </HeaderGlobalAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60 rounded-none shadow-none">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{auth.user?.displayName || auth.user?.username}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {auth.user?.isAdmin ? "Administrator" : auth.user?.roleName || "User"}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/account">
                <UserCircle2 className="mr-2 h-4 w-4" /> Account
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={async () => {
                await auth.logout();
                toast.success("Signed out");
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
