import * as React from "react";
import { ProgressBar } from "@carbon/react";
import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value?: number }
>(({ className, value = 0, ...props }, ref) => (
  <div ref={ref} className={cn("wfm-carbon-progress", className)} {...props}>
    <ProgressBar label="Progress" hideLabel value={value} max={100} />
  </div>
));
Progress.displayName = "Progress";

export { Progress };
