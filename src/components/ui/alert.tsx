import * as React from "react";
import { InlineNotification } from "@carbon/react";
import { cn } from "@/lib/utils";

type AlertProps = {
  className?: string;
  variant?: "default" | "destructive";
  children?: React.ReactNode;
  id?: string;
  "aria-label"?: string;
};

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, children, id, "aria-label": ariaLabel }, _ref) => (
    <InlineNotification
      id={id}
      aria-label={ariaLabel}
      kind={variant === "destructive" ? "error" : "info"}
      lowContrast
      hideCloseButton
      className={cn("wfm-carbon-alert", className)}
    >
      {children}
    </InlineNotification>
  ),
);
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h4 ref={ref} className={cn("cds--inline-notification__title", className)} {...props} />
  ),
);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("cds--inline-notification__subtitle", className)} {...props} />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
