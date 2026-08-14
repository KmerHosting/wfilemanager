import type { ReactNode } from "react";
import { Tag } from "@carbon/react";

import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export interface BadgeProps {
  children?: ReactNode;
  className?: string;
  variant?: BadgeVariant;
}

const TYPE_BY_VARIANT: Record<BadgeVariant, "blue" | "gray" | "red" | "cool-gray"> = {
  default: "blue",
  secondary: "gray",
  destructive: "red",
  outline: "cool-gray",
};

function Badge({ children, className, variant = "default" }: BadgeProps) {
  return (
    <Tag type={TYPE_BY_VARIANT[variant]} size="sm" className={cn("wfm-carbon-badge", className)}>
      {children}
    </Tag>
  );
}

export { Badge };
