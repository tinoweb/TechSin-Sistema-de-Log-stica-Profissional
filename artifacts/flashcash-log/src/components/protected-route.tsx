import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

/* ── ProtectedRoute ─────────────────────────────────────────────────
 * Envolve rotas internas do painel. Se o usuario nao estiver autenticado,
 * redireciona para "/" (login). Se a rota exigir um role especifico e
 * o usuario nao tiver, mostra mensagem de acesso negado. */
interface Props {
  children: ReactNode;
  allowedRoles?: Array<"superadmin" | "admin" | "operador" | "financeiro">;
}

export function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) setLocation("/");
  }, [loading, user, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-sm text-muted-foreground">
        Carregando sessao...
      </div>
    );
  }
  if (!user) return null;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-sm p-8">
          <h2 className="text-lg font-semibold mb-2">Acesso negado</h2>
          <p className="text-sm text-muted-foreground">
            Seu usuario ({user.role}) nao tem permissao para acessar esta area.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
