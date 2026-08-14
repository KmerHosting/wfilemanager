import { ProgressBar } from "@carbon/react";

import { cn } from "@/lib/utils";

function Progress({ className, value = 0 }: { className?: string; value?: number | null }) {
  return (
    <ProgressBar
      className={cn("wfm-carbon-progress", className)}
      label="Progress"
      hideLabel
      value={value ?? undefined}
      max={100}
      status={(value ?? 0) >= 100 ? "finished" : "active"}
    />
  );
}

export { Progress };
