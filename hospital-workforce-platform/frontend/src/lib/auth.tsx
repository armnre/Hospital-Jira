"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, sessionStore } from "./api";
import type { SessionUser } from "./types";

export type AuthState = {
  user: SessionUser | null;
  expiresAt: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => void;
  can: (permission: string) => boolean;
};

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    sessionStore.clear();
    setUser(null);
    setExpiresAt(null);
  }, []);

  useEffect(() => {
    const s = sessionStore.get();
    if (s) {
      setUser(s.user);
      setExpiresAt(s.expiresAt);
    }
    setReady(true);
    const onUnauthorized = () => logout();
    window.addEventListener("hwdt:unauthorized", onUnauthorized);
    return () => window.removeEventListener("hwdt:unauthorized", onUnauthorized);
  }, [logout]);

  // JWT expiration: sign out automatically when the token expires.
  useEffect(() => {
    if (!expiresAt) return;
    const ms = Date.parse(expiresAt) - Date.now();
    const t = setTimeout(logout, Math.max(0, ms));
    return () => clearTimeout(t);
  }, [expiresAt, logout]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.login(email, password);
    sessionStore.set({ accessToken: r.accessToken, expiresAt: r.expiresAt, user: r.user });
    setUser(r.user);
    setExpiresAt(r.expiresAt);
    return r.user;
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, expiresAt, ready, login, logout, can: (p: string) => Boolean(user?.permissions.includes(p)) }),
    [user, expiresAt, ready, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function homeFor(user: SessionUser): string {
  if (user.permissions.includes("supervisor:read")) return "/supervisor";
  if (user.permissions.includes("compliance:read")) return "/dashboard";
  if (user.employeeId) return `/employees/${user.employeeId}`;
  return "/login";
}
