import * as React from "react";
import { Button as CarbonButton } from "@carbon/react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "cds--btn inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "cds--btn--primary",
        destructive: "cds--btn--danger",
        outline: "cds--btn--tertiary",
        secondary: "cds--btn--secondary",
        ghost: "cds--btn--ghost",
        link: "cds--btn--ghost underline-offset-4 hover:underline",
      },
      size: {
        default: "cds--btn--md",
        sm: "cds--btn--sm",
        lg: "cds--btn--lg",
        icon: "cds--btn--ghost w-12 min-w-12 px-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  href?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, href, ...props }, ref) => {
    if (asChild) {
      return (
        <Slot ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
          {children}
        </Slot>
      );
    }

    const kind =
      variant === "destructive"
        ? "danger"
        : variant === "outline"
          ? "tertiary"
          : variant === "secondary"
            ? "secondary"
            : variant === "ghost" || variant === "link"
              ? "ghost"
              : "primary";
    const carbonSize = size === "icon" ? "md" : size === "default" || !size ? "md" : size;
    return (
      <CarbonButton
        ref={ref as never}
        kind={kind}
        size={carbonSize}
        hasIconOnly={size === "icon"}
        iconDescription={props["aria-label"] || "Action"}
        href={href}
        className={className}
        {...props}
      >
        {children}
      </CarbonButton>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
