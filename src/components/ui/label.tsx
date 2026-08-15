import * as React from "react";
import { FormLabel } from "@carbon/react";

const Label = React.forwardRef<HTMLLabelElement, React.ComponentProps<"label">>(
  ({ className, ...props }, ref) => <FormLabel className={className} {...props} />,
);
Label.displayName = "Label";

export { Label };
