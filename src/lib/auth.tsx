import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { wfilemanagerApi, type AuthUser, type SetupPayload } from "./wfilemanager-api";
import { setupWFileManager } from "./setup-api";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  configured: boolean | null;
  refresh: () => Promise<void>;
  login: (username: string, password: string, remember: boolean) => Promise<void>;
  setup: (payload: SetupPayload) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const status = await wfilemanagerApi.status();
      setConfigured(status.configured);
      if (!status.configured) {
        setUser(null);
        return;
      }
      try {
        setUser((await wfilemanagerApi.me()).user);
      } catch (error) {
        if ((error as Error & { status?: number }).status !== 401)
          console.warn("Unable to restore the user session", error);
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      configured,
      refresh,
      async login(username, password, remember) {
        const result = await wfilemanagerApi.login(username, password, remember);
        setUser(result.user);
        setConfigured(true);
      },
      async setup(payload) {
        await setupWFileManager(payload);
        const result = await wfilemanagerApi.login("admin", payload.password, true);
        setUser(result.user);
        setConfigured(true);
      },
      async logout() {
        try {
          await wfilemanagerApi.logout();
        } catch {
          /* The local cookie is cleared on invalid sessions. */
        }
        setUser(null);
      },
    }),
    [user, loading, configured, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
