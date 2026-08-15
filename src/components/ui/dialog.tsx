import * as React from "react";
import { ComposedModal, ModalFooter, ModalHeader } from "@carbon/react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

type DialogContextValue = {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
};

const DialogContext = React.createContext<DialogContextValue | null>(null);

function Dialog({
  open = false,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return <DialogContext.Provider value={{ open, onOpenChange }}>{children}</DialogContext.Provider>;
}

const DialogTrigger = React.forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<typeof Slot> & { asChild?: boolean }
>(({ onClick, ...props }, ref) => {
  const context = React.useContext(DialogContext);
  return (
    <Slot
      ref={ref}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        context?.onOpenChange?.(true);
      }}
    />
  );
});
DialogTrigger.displayName = "DialogTrigger";

const DialogClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ onClick, ...props }, ref) => {
  const context = React.useContext(DialogContext);
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      onClick={(event) => {
        onClick?.(event);
        context?.onOpenChange?.(false);
      }}
    />
  );
});
DialogClose.displayName = "DialogClose";

const DialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const context = React.useContext(DialogContext);
    if (!context) return null;
    return (
      <ComposedModal
        open={context.open}
        onClose={() => context.onOpenChange?.(false)}
        className={cn("wfm-carbon-modal", className)}
        {...props}
      >
        {children}
      </ComposedModal>
    );
  },
);
DialogContent.displayName = "DialogContent";

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <ModalHeader className={cn("wfm-carbon-modal__header", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) => (
  <ModalFooter className={cn("wfm-carbon-modal__footer", className)} {...props}>
    {children}
  </ModalFooter>
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2 ref={ref} className={cn("cds--modal-header__heading", className)} {...props} />
  ),
);
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("cds--modal-header__label", className)} {...props} />
));
DialogDescription.displayName = "DialogDescription";

const DialogPortal = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const DialogOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => <div ref={ref} {...props} />,
);
DialogOverlay.displayName = "DialogOverlay";

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
