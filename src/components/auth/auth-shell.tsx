import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Column, Grid } from "@carbon/react";

export function AuthShell({
  title,
  desc,
  children,
  footer,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Grid fullWidth className="wfm-auth-shell">
      <Column sm={4} md={4} lg={6} className="wfm-auth-aside">
        <div className="wfm-auth-aside__content">
          <Link to="/" className="wfm-auth-brand">
            wFileManager
          </Link>
          <div className="wfm-auth-aside__copy">
            <h2>A modern and open source file manager for Linux servers.</h2>
            <p>
              Browse, edit, upload, share and audit files from a single administration panel. Built
              for Ubuntu 24.04 LTS.
            </p>
          </div>
          <p className="wfm-auth-aside__legal">
            © {new Date().getFullYear()} KmerHosting LLC. All rights reserved.
          </p>
        </div>
      </Column>
      <Column sm={4} md={4} lg={10} className="wfm-auth-main">
        <div className="wfm-auth-form">
          <Link to="/" className="wfm-auth-brand wfm-auth-brand--mobile">
            wFileManager
          </Link>
          <h1>{title}</h1>
          {desc && <p className="wfm-auth-description">{desc}</p>}
          <div className="wfm-auth-content">{children}</div>
          {footer && <div className="wfm-auth-footer">{footer}</div>}
          <p className="wfm-auth-legal--mobile">
            © {new Date().getFullYear()} KmerHosting LLC. All rights reserved.
          </p>
        </div>
      </Column>
    </Grid>
  );
}
