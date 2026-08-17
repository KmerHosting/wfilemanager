import { Column, Grid } from "@carbon/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

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
    <Grid fullWidth condensed className="wfm-auth-shell">
      <Column sm={4} md={4} lg={6} className="wfm-auth-aside">
        <div className="wfm-auth-aside__content">
          <Link to="/" className="wfm-auth-brand">
            wFileManager
          </Link>
          <div className="wfm-auth-aside__copy">
            <h2>Server file management with a native Carbon interface.</h2>
            <p>
              Browse, edit, upload and recover files directly on this Linux server. One local
              administrator account and local SQLite state.
            </p>
          </div>
          <p className="wfm-auth-aside__legal">
            © {new Date().getFullYear()} KmerHosting LLC. MIT licensed.
          </p>
        </div>
      </Column>
      <Column sm={4} md={4} lg={10} className="wfm-auth-main">
        <div className="wfm-auth-form">
          <Link to="/" className="wfm-auth-brand wfm-auth-brand--mobile">
            wFileManager
          </Link>
          <h1>{title}</h1>
          {desc ? <p className="wfm-auth-description">{desc}</p> : null}
          <div className="wfm-auth-content">{children}</div>
          {footer ? <div>{footer}</div> : null}
          <p className="wfm-auth-legal--mobile">
            © {new Date().getFullYear()} KmerHosting LLC. MIT licensed.
          </p>
        </div>
      </Column>
    </Grid>
  );
}
