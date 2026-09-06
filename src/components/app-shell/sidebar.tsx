import { useRouterState } from "@tanstack/react-router";
import { Dashboard, FolderOpen, Information, TrashCan, UserAvatar } from "@carbon/icons-react";
import { SideNav, SideNavDivider, SideNavItems, SideNavLink } from "@carbon/react";
import type { ComponentType } from "react";

type Item = {
  to?: string;
  href?: string;
  label: string;
  icon: ComponentType;
  newTab?: boolean;
};

const FILE_ITEMS: Item[] = [
  { to: "/", label: "Overview", icon: Dashboard },
  { to: "/explorer", label: "File Explorer", icon: FolderOpen },
  { to: "/trash", label: "Trash", icon: TrashCan },
];

const ADMIN_ITEMS: Item[] = [
  { to: "/account", label: "Account", icon: UserAvatar },
  { to: "/about", label: "About & updates", icon: Information },
];

function NavLinks({ items, pathname }: { items: Item[]; pathname: string }) {
  const isActive = (to?: string) =>
    Boolean(
      to && (to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`)),
    );

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
        <p className="wfm-sidenav-label">Workspace</p>
        <NavLinks items={FILE_ITEMS} pathname={pathname} />
        <SideNavDivider />
        <p className="wfm-sidenav-label">Account</p>
        <NavLinks items={ADMIN_ITEMS} pathname={pathname} />
      </SideNavItems>
    </SideNav>
  );
}
