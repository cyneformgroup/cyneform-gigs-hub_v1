import type { AuthSession, LoginResponse, SessionUser } from "@cyneform/types";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, refreshSession, setAccessToken, setSessionLostHandler } from "./api";

type Status = "loading" | "anonymous" | "authenticated";

interface AuthValue {
  status: Status;
  user: SessionUser | null;
  can: (permission: string) => boolean;
  startLogin: (email: string, password: string) => Promise<string>;
  finishLogin: (challengeId: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const apply = useCallback(
    (session: AuthSession | null) => {
      if (!session) {
        setAccessToken(null);
        queryClient.clear();
      }
      setUser(session?.user ?? null);
      setStatus(session ? "authenticated" : "anonymous");
    },
    [queryClient],
  );

  useEffect(() => {
    setSessionLostHandler(() => apply(null));
    refreshSession().then(apply);
  }, [apply]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      can: (permission) => user?.permissions.includes(permission) ?? false,
      startLogin: async (email, password) =>
        (await api<LoginResponse>("/auth/login", { method: "POST", body: { email, password } }))
          .challengeId,
      finishLogin: async (challengeId, code) => {
        const session = await api<AuthSession>("/auth/verify-otp", {
          method: "POST",
          body: { challengeId, code },
        });
        setAccessToken(session.accessToken);
        apply(session);
      },
      logout: async () => {
        await api<void>("/auth/logout", { method: "POST" }).catch(() => undefined);
        apply(null);
      },
    }),
    [status, user, apply],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
