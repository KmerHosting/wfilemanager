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
import type { ElementType } from "react";

type Item = {
  to?: string;
  href?: string;
  label: string;
  icon: ElementType;
  newTab?: boolean;
};

const FILE_ITEMS: Item[] = [
  { to: "/", label: "Overview", icon: Dashboard },
  { to: "/explorer", label: "File Explorer", icon: FolderOpen },
  { to: "/trash", label: "Trash", icon: TrashCan },
];

const ADMIN_ITEMS: Item[] = [
  { to: "/account", label: "Administrator", icon: UserAvatar },
  { to: "/about", label: "About & updates", icon: Information },
];

const RESOURCE_ITEMS: Item[] = [
  {
    href: "https://kmerhosting.com/docs",
    label: "Documentation",
    icon: Book,
    newTab: true,
  },
  { href: "mailto:support@kmerhosting.com", label: "Support", icon: Help },
  {
    href: "https://wfilemanager.kmerhosting.com",
    label: "Website",
    icon: Globe,
    newTab: true,
  },
];

function NavLinks({ items, pathname }: { items: Item[]; pathname: string }) {
  const isActive = (to?: string) =>
    Boolean(to && (to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`)));

  return items.map((item) => {
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
  });
}

export function AppSidebar({
  expanded,
  onOverlayClick,
}: {
  expanded: boolean;
  onOverlayClick?: () => void;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <SideNav
      isRail
      expanded={expanded}
      isChildOfHeader
      aria-label="wFileManager navigation"
      className="wfm-carbon-sidenav"
      onOverlayClick={onOverlayClick}
    >
      <SideNavItems>
        <NavLinks items={FILE_ITEMS} pathname={pathname} />
        <SideNavDivider />
        <NavLinks items={ADMIN_ITEMS} pathname={pathname} />
        <SideNavDivider />
        <NavLinks items={RESOURCE_ITEMS} pathname={pathname} />
        <p className="wfm-rail-hint">Hover or focus the rail to expand navigation.</p>
      </SideNavItems>
    </SideNav>
  );
}
