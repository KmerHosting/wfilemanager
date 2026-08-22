import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Add, Password, Renew, TrashCan } from "@carbon/icons-react";
import {
  Button,
  CodeSnippet,
  Form,
  InlineLoading,
  InlineNotification,
  Modal,
  PasswordInput,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextInput,
  Tile,
} from "@carbon/react";
import {
  ADMIN_PASSWORD_POLICY_TEXT,
  administratorPasswordError,
} from "@/lib/admin-password-policy";
import { useAuth } from "@/lib/auth";
import { useNotifications } from "@/lib/notifications";
import { wfilemanagerApi, type AuthUser } from "@/lib/wfilemanager-api";

export const Route = createFileRoute("/_app/account")({
  head: () => ({ meta: [{ title: "Account — wFileManager" }] }),
  component: Account,
});

const emptyUserForm = { username: "", displayName: "", password: "", confirm: "" };

function displayDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function Account() {
  const auth = useAuth();
  const { notify } = useNotifications();
  const [password, setPassword] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetUser, setResetUser] = useState<AuthUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AuthUser | null>(null);
  const [resetPassword, setResetPassword] = useState({ password: "", confirm: "" });
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const policyError = password.next ? administratorPasswordError(password.next) : null;
  const mismatch = Boolean(password.confirm && password.next !== password.confirm);
  const passwordDisabled =
    saving ||
    !password.current ||
    !password.next ||
    Boolean(policyError) ||
    mismatch ||
    !password.confirm;
  const createPolicyError = userForm.password
    ? administratorPasswordError(userForm.password)
    : null;
  const createMismatch = Boolean(userForm.confirm && userForm.password !== userForm.confirm);
  const createDisabled =
    saving ||
    !userForm.username.trim() ||
    !userForm.displayName.trim() ||
    !userForm.password ||
    Boolean(createPolicyError) ||
    createMismatch ||
    !userForm.confirm;
  const resetPolicyError = resetPassword.password
    ? administratorPasswordError(resetPassword.password)
    : null;
  const resetMismatch = Boolean(
    resetPassword.confirm && resetPassword.password !== resetPassword.confirm,
  );
  const resetDisabled =
    saving ||
    !resetPassword.password ||
    Boolean(resetPolicyError) ||
    resetMismatch ||
    !resetPassword.confirm;

  const loadUsers = useCallback(async () => {
    if (!auth.user?.isAdmin) return;
    setLoadingUsers(true);
    try {
      setUsers((await wfilemanagerApi.users()).users);
    } catch (error) {
      notify({
        kind: "error",
        title: "Unable to load users",
        subtitle: error instanceof Error ? error.message : "The request did not complete.",
      });
    } finally {
      setLoadingUsers(false);
    }
  }, [auth.user?.isAdmin, notify]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const changePassword = async () => {
    if (passwordDisabled) return;
    setSaving(true);
    try {
      await wfilemanagerApi.changePassword(password.current, password.next);
      setPassword({ current: "", next: "", confirm: "" });
      notify({
        kind: "success",
        title: "Password changed",
        subtitle: "Your password was updated.",
      });
    } catch (error) {
      notify({
        kind: "error",
        title: "Unable to change password",
        subtitle: error instanceof Error ? error.message : "The request did not complete.",
      });
    } finally {
      setSaving(false);
    }
  };

  const createUser = async () => {
    if (createDisabled) return;
    setSaving(true);
    try {
      await wfilemanagerApi.createUser(userForm.username, userForm.displayName, userForm.password);
      setUserForm(emptyUserForm);
      setCreateOpen(false);
      await loadUsers();
      notify({ kind: "success", title: "User created" });
    } catch (error) {
      notify({
        kind: "error",
        title: "Unable to create user",
        subtitle: error instanceof Error ? error.message : "The request did not complete.",
      });
    } finally {
      setSaving(false);
    }
  };

  const submitResetPassword = async () => {
    if (!resetUser || resetDisabled) return;
    setSaving(true);
    try {
      await wfilemanagerApi.resetUserPassword(resetUser.id, resetPassword.password);
      setResetPassword({ password: "", confirm: "" });
      setResetUser(null);
      notify({
        kind: "success",
        title: "Password reset",
        subtitle: `All sessions for ${resetUser.username} were revoked.`,
      });
    } catch (error) {
      notify({
        kind: "error",
        title: "Unable to reset password",
        subtitle: error instanceof Error ? error.message : "The request did not complete.",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleSuspension = async (user: AuthUser) => {
    setBusyUserId(user.id);
    try {
      await wfilemanagerApi.setUserSuspended(user.id, user.status === "active");
      await loadUsers();
      notify({
        kind: "success",
        title: user.status === "active" ? "User suspended" : "User reactivated",
      });
    } catch (error) {
      notify({
        kind: "error",
        title: "Unable to update user",
        subtitle: error instanceof Error ? error.message : "The request did not complete.",
      });
    } finally {
      setBusyUserId(null);
    }
  };

  const confirmDeleteUser = async () => {
    if (!deleteUser) return;
    setBusyUserId(deleteUser.id);
    try {
      await wfilemanagerApi.deleteUser(deleteUser.id);
      setDeleteUser(null);
      await loadUsers();
      notify({ kind: "success", title: "User deleted" });
    } catch (error) {
      notify({
        kind: "error",
        title: "Unable to delete user",
        subtitle: error instanceof Error ? error.message : "The request did not complete.",
      });
    } finally {
      setBusyUserId(null);
    }
  };

  if (!auth.user) return null;

  return (
    <section className="wfm-page" aria-labelledby="account-title">
      <header className="wfm-page__header">
        <div>
          <div className="wfm-account-heading">
            <h1 id="account-title" className="wfm-page__heading">
              Account
            </h1>
            <Tag type={auth.user.isAdmin ? "blue" : "gray"}>
              {auth.user.isAdmin ? "Administrator" : "User"}
            </Tag>
          </div>
          <p className="wfm-page__description">
            Signed in as <strong>{auth.user.displayName}</strong> ({auth.user.username}).
          </p>
        </div>
      </header>

      <div className="wfm-account-stack">
        <section className="wfm-account-section" aria-labelledby="change-password-title">
          <h2 id="change-password-title" className="wfm-section-title">
            Change password
          </h2>
          <Form
            className="wfm-account-password-form"
            onSubmit={(event) => {
              event.preventDefault();
              void changePassword();
            }}
          >
            <div className="wfm-account-password-form__fields">
              <PasswordInput
                id="current-password"
                labelText="Current password"
                autoComplete="current-password"
                value={password.current}
                onChange={(event) =>
                  setPassword((current) => ({ ...current, current: event.target.value }))
                }
              />
              <PasswordInput
                id="new-password"
                labelText="New password"
                autoComplete="new-password"
                helperText={ADMIN_PASSWORD_POLICY_TEXT}
                invalid={Boolean(policyError)}
                invalidText={policyError || undefined}
                value={password.next}
                onChange={(event) =>
                  setPassword((current) => ({ ...current, next: event.target.value }))
                }
              />
              <PasswordInput
                id="confirm-password"
                labelText="Confirm password"
                autoComplete="new-password"
                invalid={mismatch}
                invalidText={mismatch ? "Passwords do not match." : undefined}
                value={password.confirm}
                onChange={(event) =>
                  setPassword((current) => ({ ...current, confirm: event.target.value }))
                }
              />
            </div>
            <div className="wfm-account-password-form__actions">
              <Button renderIcon={Password} type="submit" disabled={passwordDisabled}>
                {saving ? "Changing…" : "Change password"}
              </Button>
            </div>
          </Form>
        </section>

        {auth.user.isAdmin ? (
          <section className="wfm-account-users" aria-labelledby="users-title">
            <div className="wfm-account-users__header">
              <div>
                <h2 id="users-title" className="wfm-section-title">
                  Users
                </h2>
                <p className="wfm-section-description">
                  Users can manage all files but cannot manage accounts.
                </p>
              </div>
              <Button renderIcon={Add} size="sm" onClick={() => setCreateOpen(true)}>
                Add user
              </Button>
            </div>

            {loadingUsers && !users.length ? (
              <InlineLoading description="Loading users…" />
            ) : (
              <TableContainer>
                <Table size="lg" useZebraStyles={false}>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Name</TableHeader>
                      <TableHeader>Username</TableHeader>
                      <TableHeader>Type</TableHeader>
                      <TableHeader>Status</TableHeader>
                      <TableHeader>Last sign-in</TableHeader>
                      <TableHeader>Actions</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>{user.displayName}</TableCell>
                        <TableCell className="wfm-mono">{user.username}</TableCell>
                        <TableCell>{user.isAdmin ? "Administrator" : "User"}</TableCell>
                        <TableCell>
                          <Tag type={user.status === "active" ? "green" : "warm-gray"}>
                            {user.status === "active" ? "Active" : "Suspended"}
                          </Tag>
                        </TableCell>
                        <TableCell>{displayDate(user.lastLoginAt)}</TableCell>
                        <TableCell>
                          {user.isAdmin ? (
                            <span className="wfm-muted">Current account</span>
                          ) : (
                            <div className="wfm-user-actions">
                              <Button
                                kind="ghost"
                                size="sm"
                                renderIcon={Password}
                                disabled={busyUserId === user.id}
                                onClick={() => setResetUser(user)}
                              >
                                Reset password
                              </Button>
                              <Button
                                kind="ghost"
                                size="sm"
                                renderIcon={Renew}
                                disabled={busyUserId === user.id}
                                onClick={() => void toggleSuspension(user)}
                              >
                                {user.status === "active" ? "Suspend" : "Reactivate"}
                              </Button>
                              <Button
                                kind="danger--ghost"
                                size="sm"
                                renderIcon={TrashCan}
                                disabled={busyUserId === user.id}
                                onClick={() => setDeleteUser(user)}
                              >
                                Delete
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </section>
        ) : null}

        {auth.user.isAdmin ? (
          <Tile className="wfm-panel-tile wfm-account-recovery">
            <h2 className="wfm-section-title">Lost the administrator password?</h2>
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title="Recovery is server-side only"
              subtitle="Run the reset command from a trusted shell on the server."
            />
            <div className="wfm-space-top">
              <CodeSnippet type="single">sudo wfilemanager-reset-admin-password</CodeSnippet>
            </div>
          </Tile>
        ) : null}
      </div>

      <Modal
        open={createOpen}
        size="sm"
        modalHeading="Add user"
        primaryButtonText={saving ? "Creating…" : "Create user"}
        secondaryButtonText="Cancel"
        primaryButtonDisabled={createDisabled}
        selectorPrimaryFocus="#new-user-username"
        onRequestClose={() => {
          setCreateOpen(false);
          setUserForm(emptyUserForm);
        }}
        onRequestSubmit={() => void createUser()}
      >
        <div className="wfm-modal-stack">
          <TextInput
            id="new-user-username"
            labelText="Username"
            helperText="3–32 characters: letters, numbers, dots, dashes or underscores."
            value={userForm.username}
            onChange={(event) =>
              setUserForm((current) => ({ ...current, username: event.target.value }))
            }
          />
          <TextInput
            id="new-user-display-name"
            labelText="Display name"
            value={userForm.displayName}
            onChange={(event) =>
              setUserForm((current) => ({ ...current, displayName: event.target.value }))
            }
          />
          <PasswordInput
            id="new-user-password"
            labelText="Password"
            helperText={ADMIN_PASSWORD_POLICY_TEXT}
            invalid={Boolean(createPolicyError)}
            invalidText={createPolicyError || undefined}
            value={userForm.password}
            onChange={(event) =>
              setUserForm((current) => ({ ...current, password: event.target.value }))
            }
          />
          <PasswordInput
            id="new-user-confirm-password"
            labelText="Confirm password"
            invalid={createMismatch}
            invalidText={createMismatch ? "Passwords do not match." : undefined}
            value={userForm.confirm}
            onChange={(event) =>
              setUserForm((current) => ({ ...current, confirm: event.target.value }))
            }
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(resetUser)}
        size="sm"
        modalHeading="Reset user password"
        modalLabel={resetUser?.username}
        primaryButtonText={saving ? "Resetting…" : "Reset password"}
        secondaryButtonText="Cancel"
        primaryButtonDisabled={resetDisabled}
        selectorPrimaryFocus="#reset-user-password"
        onRequestClose={() => {
          setResetUser(null);
          setResetPassword({ password: "", confirm: "" });
        }}
        onRequestSubmit={() => void submitResetPassword()}
      >
        <div className="wfm-modal-stack">
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="All existing sessions will be revoked"
          />
          <PasswordInput
            id="reset-user-password"
            labelText="New password"
            helperText={ADMIN_PASSWORD_POLICY_TEXT}
            invalid={Boolean(resetPolicyError)}
            invalidText={resetPolicyError || undefined}
            value={resetPassword.password}
            onChange={(event) =>
              setResetPassword((current) => ({ ...current, password: event.target.value }))
            }
          />
          <PasswordInput
            id="reset-user-confirm-password"
            labelText="Confirm password"
            invalid={resetMismatch}
            invalidText={resetMismatch ? "Passwords do not match." : undefined}
            value={resetPassword.confirm}
            onChange={(event) =>
              setResetPassword((current) => ({ ...current, confirm: event.target.value }))
            }
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteUser)}
        danger
        size="sm"
        modalHeading="Delete this user?"
        modalLabel={deleteUser?.username}
        primaryButtonText="Delete user"
        secondaryButtonText="Cancel"
        primaryButtonDisabled={Boolean(busyUserId)}
        onRequestClose={() => setDeleteUser(null)}
        onRequestSubmit={() => void confirmDeleteUser()}
      >
        This revokes every session for the user. Files created or changed by the user are not
        deleted.
      </Modal>
    </section>
  );
}
