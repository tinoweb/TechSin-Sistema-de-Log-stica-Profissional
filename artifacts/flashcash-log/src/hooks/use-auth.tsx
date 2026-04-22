import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api-client";

/* ── Tipos compartilhados com o backend ─────────────────────────────── */
export interface SessaoUsuario {
  id: number;
  nome: string;
  email: string;
  role: "superadmin" | "admin" | "operador" | "financeiro";
  transportadoraId: number | null;
  ativo: boolean;
}

interface AuthContextValue {
  user: SessaoUsuario | null;
  loading: boolean;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/* ── Provider ────────────────────────────────────────────────────────
 * Mantem a sessao do usuario logado e sincroniza com o backend via
 * cookie HttpOnly. Nao armazena token em localStorage (XSS-safe). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessaoUsuario | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const me = await api.get<{ user: SessaoUsuario }>("/auth/me");
      setUser(me.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function login(email: string, senha: string) {
    const resp = await api.post<{ user: SessaoUsuario }>("/auth/login", { email, senha });
    setUser(resp.user);
  }

  async function logout() {
    try { await api.post("/auth/logout", {}); } catch { /* segue, cookie ja expirou */ }
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
