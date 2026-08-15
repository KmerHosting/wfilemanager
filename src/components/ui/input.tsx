import * as React from "react";
import { PasswordInput, TextInput } from "@carbon/react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, id, defaultValue, ...props }, ref) => {
    const normalizedDefaultValue =
      typeof defaultValue === "string" || typeof defaultValue === "number"
        ? defaultValue
        : undefined;
    if (type === "file") {
      return (
        <input
          ref={ref}
          id={id}
          type="file"
          className={cn("wfm-carbon-file-input", className)}
          {...props}
          defaultValue={normalizedDefaultValue}
        />
      );
    }
    if (type === "password") {
      return (
        <PasswordInput
          {...(props as unknown as React.ComponentProps<typeof PasswordInput>)}
          ref={ref as never}
          id={id || "wfm-input"}
          labelText={props["aria-label"] || ""}
          hideLabel
          className={cn("wfm-carbon-input", className)}
          defaultValue={normalizedDefaultValue}
        />
      );
    }
    return (
      <TextInput
        {...(props as unknown as React.ComponentProps<typeof TextInput>)}
        ref={ref as never}
        id={id || "wfm-input"}
        type={type}
        labelText={props["aria-label"] || ""}
        hideLabel
        className={cn("wfm-carbon-input", className)}
        defaultValue={normalizedDefaultValue}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
