# Carbon frontend contract

wFileManager uses IBM Carbon Design System as the source of truth for its user-facing React interface.

## Required foundations

- `@carbon/react` for application components and UI shell.
- `@carbon/icons-react` for interface iconography.
- Carbon White and G100 themes emitted through the official Sass theme mixin.
- Carbon semantic color tokens instead of product-local hexadecimal UI colors.
- Carbon type styles for application headings, labels, helper text and body copy.
- Carbon spacing tokens and breakpoints for application-specific layout.
- Carbon motion durations/easing for application-specific transitions.
- Carbon Grid/Column for responsive content composition.

## Component rule

If Carbon provides a component for a visible interaction, use the Carbon component rather than recreating it. This includes buttons, inputs, password fields, checkboxes, search, notifications, loading states, progress, tables, tiles, modals and the UI shell.

The application shell uses Carbon `HeaderContainer`, `Header`, `HeaderMenuButton`, `HeaderGlobalAction`, `SideNav` in rail mode, and `Content`. Rail expansion, hover, focus and keyboard behavior are delegated to Carbon.

## No parallel design system

The user-facing application must not import components from `src/components/ui`, Radix UI, Sonner or Tailwind utility styling. Those legacy frontend paths were removed from the application surface in 0.11.5.

Run the conformance check with:

```bash
bun run audit:carbon
```

CI runs this audit in addition to lint, build, typecheck and tests.
