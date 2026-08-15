import * as React from "react";
import { TextArea } from "@carbon/react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, id, defaultValue, ...props }, ref) => {
  const normalizedDefaultValue =
    typeof defaultValue === "string" || typeof defaultValue === "number" ? defaultValue : undefined;
  return (
    <TextArea
      {...(props as unknown as React.ComponentProps<typeof TextArea>)}
      ref={ref as never}
      id={id}
      labelText={props["aria-label"] || ""}
      hideLabel
      defaultValue={normalizedDefaultValue}
      className={cn("wfm-carbon-textarea", className)}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
