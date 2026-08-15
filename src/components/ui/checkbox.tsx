import * as React from "react";
import { Checkbox as CarbonCheckbox } from "@carbon/react";

type CheckboxProps = Omit<
  React.ComponentPropsWithoutRef<typeof CarbonCheckbox>,
  "labelText" | "onChange" | "checked" | "id"
> & {
  id?: string;
  checked?: boolean | "indeterminate";
  onCheckedChange?: (checked: boolean) => void;
};

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ id, checked, onCheckedChange, className, ...props }, ref) => {
    const generatedId = React.useId();
    return (
      <CarbonCheckbox
        ref={ref as never}
        id={id || generatedId}
        checked={checked === true}
        indeterminate={checked === "indeterminate"}
        labelText={props["aria-label"] || "Checkbox"}
        hideLabel
        onChange={(_, data) => onCheckedChange?.(data.checked)}
        className={className}
        {...props}
      />
    );
  },
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
