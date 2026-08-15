import { useEffect, useState, type ComponentType } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  Book,
  CloudUpload,
  Dashboard,
  FolderOpen,
  Globe,
  Help,
  Information,
  Notification,
  Security,
  Task,
  Terminal,
  TrashCan,
  UserAvatar,
  UserMultiple,
} from "@carbon/icons-react";
import { SideNav, SideNavDivider, SideNavItems, SideNavLink } from "@carbon/react";
import { SERVER_INFO } from "@/lib/demo/data";
import { useAuth } from "@/lib/auth";
import { localApi } from "@/lib/local-api";

type Item = {
  to?: string;
  href?: string;
  label: string;
  icon: ComponentType<{ size?: number | string; className?: string }>;
  permission?: string;
  anyPermission?: string[];
  adminOnly?: boolean;
  newTab?: boolean;
};

const NAV: { label: string; items: Item[] }[] = [
  {
    label: "Workspace",
    items: [
      { to: "/", label: "Overview", icon: Dashboard },
      { to: "/explorer", label: "File Explorer", icon: FolderOpen, permission: "browse" },
      { to: "/uploads", label: "Uploads", icon: CloudUpload, permission: "upload" },
      { to: "/tasks", label: "Background tasks", icon: Task },
      {
        to: "/trash",
        label: "Trash",
        icon: TrashCan,
        anyPermission: ["delete", "restore", "permanently_delete"],
      },
    ],
  },
  {
    label: "Administration",
    items: [
      { to: "/terminal", label: "Terminal", icon: Terminal, adminOnly: true },
      { to: "/users", label: "Users", icon: UserMultiple, permission: "manage_users" },
      { to: "/roles", label: "Roles & permissions", icon: Security, permission: "manage_roles" },
      { to: "/logs", label: "Audit logs", icon: Information, adminOnly: true },
    ],
  },
  {
    label: "Personal",
    items: [
      { to: "/notifications", label: "Notifications", icon: Notification },
      { to: "/account", label: "Account", icon: UserAvatar },
    ],
  },
  {
    label: "Resources",
    items: [
      {
        href: "https://wfilemanager.kmerhosting.com/docs",
        label: "Documentation",
        icon: Book,
        newTab: true,
      },
      { to: "/about", label: "About & updates", icon: Information },
      { href: "mailto:support@kmerhosting.com", label: "Support", icon: Help },
      { href: "https://wfilemanager.kmerhosting.com", label: "Website", icon: Globe, newTab: true },
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
      isChildOfHeader
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
              const href = item.to || item.href || "#";
              return (
                <SideNavLink
                  key={href}
                  href={href}
                  isActive={isActive(item.to)}
                  renderIcon={item.icon}
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
