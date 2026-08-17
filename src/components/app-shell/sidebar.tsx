import { useEffect, useState, type ComponentType } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  Book,
  Dashboard,
  FolderOpen,
  Globe,
  Help,
  Information,
  TrashCan,
  UserAvatar,
} from "@carbon/icons-react";
import { SideNav, SideNavDivider, SideNavItems, SideNavLink } from "@carbon/react";
import { localApi } from "@/lib/local-api";

type Item = {
  to?: string;
  href?: string;
  label: string;
  icon: ComponentType<{ size?: number | string; className?: string }>;
  newTab?: boolean;
};

const NAV: { label: string; items: Item[] }[] = [
  {
    label: "Files",
    items: [
      { to: "/", label: "Overview", icon: Dashboard },
      { to: "/explorer", label: "File Explorer", icon: FolderOpen },
      { to: "/trash", label: "Trash", icon: TrashCan },
    ],
  },
  {
    label: "Settings",
    items: [
      { to: "/account", label: "Administrator", icon: UserAvatar },
      { to: "/about", label: "About & updates", icon: Information },
    ],
  },
  {
    label: "Resources",
    items: [
      {
        href: "https://kmerhosting.com/docs",
        label: "Documentation",
        icon: Book,
        newTab: true,
      },
      { href: "mailto:support@kmerhosting.com", label: "Support", icon: Help },
      { href: "https://wfilemanager.kmerhosting.com", label: "Website", icon: Globe, newTab: true },
    ],
  },
];

export function AppSidebar({ className }: { className?: string }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [version, setVersion] = useState("");
  const isActive = (to?: string) =>
    Boolean(
      to && (to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`)),
    );

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
      <SideNavItems>
        {NAV.map((group, groupIndex) => (
          <div key={group.label} className="wfm-carbon-sidenav__group">
            {groupIndex > 0 && <SideNavDivider />}
            <div className="wfm-carbon-sidenav__label">{group.label}</div>
            {group.items.map((item) => {
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
      {version && <div className="wfm-carbon-sidenav__version">v{version}</div>}
    </SideNav>
  );
}
