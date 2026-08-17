import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ToastNotification } from "@carbon/react";

type NoticeKind = "success" | "error" | "info" | "warning";

type NoticeInput = {
  id?: string;
  kind: NoticeKind;
  title: string;
  subtitle?: string;
  timeout?: number;
};

type Notice = Required<Pick<NoticeInput, "id" | "kind" | "title">> &
  Pick<NoticeInput, "subtitle" | "timeout">;

type NotificationContextValue = {
  notify: (notice: NoticeInput) => string;
  dismiss: (id: string) => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const sequence = useRef(0);
  const [notices, setNotices] = useState<Notice[]>([]);

  const dismiss = useCallback((id: string) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
  }, []);

  const notify = useCallback((input: NoticeInput) => {
    const id = input.id ?? `wfm-notice-${++sequence.current}`;
    const next: Notice = {
      id,
      kind: input.kind,
      title: input.title,
      subtitle: input.subtitle,
      timeout: input.timeout ?? 5000,
    };

    setNotices((current) => {
      const index = current.findIndex((notice) => notice.id === id);
      if (index === -1) return [...current, next];
      const copy = [...current];
      copy[index] = next;
      return copy;
    });
    return id;
  }, []);

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="wfm-toast-region" aria-live="polite" aria-relevant="additions text">
        {notices.map((notice) => (
          <ToastNotification
            key={notice.id}
            kind={notice.kind}
            lowContrast
            title={notice.title}
            subtitle={notice.subtitle}
            timeout={notice.timeout}
            aria-label={`Close ${notice.title} notification`}
            onClose={() => dismiss(notice.id)}
          />
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotifications must be used within NotificationProvider");
  return context;
}
