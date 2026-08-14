import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ListTodo,
  FolderTree,
  UploadCloud,
  Trash2,
  TerminalSquare,
  Users,
  ShieldCheck,
  UserCircle2,
  BookOpen,
  Info,
  Bell,
  LifeBuoy,
  Globe2,
  ScrollText,
} from "lucide-react";
import { SideNav, SideNavDivider, SideNavItems, SideNavLink } from "@carbon/react";
import { SERVER_INFO } from "@/lib/demo/data";
import { useAuth } from "@/lib/auth";
import { localApi } from "@/lib/local-api";

type Item = {
  to?: string;
  href?: string;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number | string }>;
  permission?: string;
  anyPermission?: string[];
  adminOnly?: boolean;
  newTab?: boolean;
};

const NAV: { label: string; items: Item[] }[] = [
  {
    label: "Workspace",
    items: [
      { to: "/", label: "Overview", icon: LayoutDashboard },
      { to: "/explorer", label: "File Explorer", icon: FolderTree, permission: "browse" },
      { to: "/uploads", label: "Uploads", icon: UploadCloud, permission: "upload" },
      { to: "/tasks", label: "Background tasks", icon: ListTodo },
      {
        to: "/trash",
        label: "Trash",
        icon: Trash2,
        anyPermission: ["delete", "restore", "permanently_delete"],
      },
    ],
  },
  {
    label: "Administration",
    items: [
      { to: "/terminal", label: "Terminal", icon: TerminalSquare, adminOnly: true },
      { to: "/users", label: "Users", icon: Users, permission: "manage_users" },
      { to: "/roles", label: "Roles & permissions", icon: ShieldCheck, permission: "manage_roles" },
      { to: "/logs", label: "Audit logs", icon: ScrollText, adminOnly: true },
    ],
  },
  {
    label: "Personal",
    items: [
      { to: "/notifications", label: "Notifications", icon: Bell },
      { to: "/account", label: "Account", icon: UserCircle2 },
    ],
  },
  {
    label: "Resources",
    items: [
      {
        href: "https://wfilemanager.kmerhosting.com/docs",
        label: "Documentation",
        icon: BookOpen,
        newTab: true,
      },
      { to: "/about", label: "About & updates", icon: Info },
      { href: "mailto:support@kmerhosting.com", label: "Support", icon: LifeBuoy },
      {
        href: "https://wfilemanager.kmerhosting.com",
        label: "Website",
        icon: Globe2,
        newTab: true,
      },
    ],
  },
];

export function AppSidebar({ className }: { className?: string }) {
  const { user } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [version, setVersion] = useState(SERVER_INFO.wfmVersion);
  const isActive = (to?: string) =>
    Boolean(
      to && (to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`)),
    );
  const canSee = (item: Item) => {
    if (item.adminOnly) return Boolean(user?.isAdmin);
    if (!item.permission && !item.anyPermission) return true;
    if (user?.isAdmin) return true;
    const permissions = user?.permissions || [];
    if (item.permission) return permissions.includes(item.permission);
    return item.anyPermission?.some((permission) => permissions.includes(permission)) || false;
  };

  useEffect(() => {
    let mounted = true;
    void localApi
      .updateInfo()
      .then((result) => {
        if (mounted && result.currentVersion) setVersion(result.currentVersion);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <SideNav
      expanded
      isFixedNav
      isChildOfHeader={false}
      aria-label="wFileManager navigation"
      className={`wfm-carbon-sidenav ${className || ""}`}
    >
      <div className="wfm-carbon-sidenav__brand">
        <strong>wFileManager</strong>
        <span>From KmerHosting LLC</span>
      </div>
      <SideNavItems>
        {NAV.map((group, groupIndex) => (
          <div key={group.label} className="wfm-carbon-sidenav__group">
            {groupIndex > 0 && <SideNavDivider />}
            <div className="wfm-carbon-sidenav__label">{group.label}</div>
            {group.items.filter(canSee).map((item) => {
              const Icon = item.icon;
              const href = item.to || item.href || "#";
              return (
                <SideNavLink
                  key={href}
                  href={href}
                  isActive={isActive(item.to)}
                  renderIcon={Icon}
                  target={item.newTab ? "_blank" : undefined}
                  rel={item.newTab ? "noreferrer" : undefined}
                >
                  {item.label}
                </SideNavLink>
              );
            })}
          </div>
        ))}
      </SideNavItems>
      <div className="wfm-carbon-sidenav__version">v{version}</div>
    </SideNav>
  );
}
