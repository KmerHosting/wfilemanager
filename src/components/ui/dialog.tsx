import * as React from "react";
import { ComposedModal, ModalBody, ModalFooter, ModalHeader } from "@carbon/react";
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
>(({ onClick, asChild: _asChild, ...props }, ref) => {
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

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof ComposedModal>
>(({ className, children, containerClassName, ...props }, ref) => {
  const context = React.useContext(DialogContext);
  if (!context) return null;
  const content = React.Children.toArray(children);
  const body = content.filter(
    (child) =>
      !React.isValidElement(child) || (child.type !== DialogHeader && child.type !== DialogFooter),
  );
  return (
    <ComposedModal
      ref={ref}
      open={context.open}
      onClose={() => context.onOpenChange?.(false)}
      className="wfm-carbon-modal"
      containerClassName={cn("wfm-carbon-modal__container", className, containerClassName)}
      {...props}
    >
      {content.filter((child) => React.isValidElement(child) && child.type === DialogHeader)}
      {body.length > 0 && <ModalBody className="wfm-carbon-modal__body">{body}</ModalBody>}
      {content.filter((child) => React.isValidElement(child) && child.type === DialogFooter)}
    </ComposedModal>
  );
});
DialogContent.displayName = "DialogContent";

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
