import type { Request } from "express";

/* ── resolveTenantId ─────────────────────────────────────────────────
 * Retorna o transportadoraId que a request DEVE usar.
 *
 * - Usuarios comuns (admin/operador/financeiro) sempre ficam presos ao
 *   proprio tenant, ignorando qualquer valor em query/body.
 * - Superadmin pode passar ?transportadoraId=X (query) ou body.transportadoraId
 *   para operar em qualquer tenant. Se nao passar, retorna null (= "todos").
 *
 * Retorna `undefined` quando o usuario nao esta autenticado. A rota pode
 * decidir o que fazer (em geral, so chega aqui se ja passou por requireAuth). */
export function resolveTenantId(req: Request): number | null | undefined {
  const user = req.user;
  if (!user) return undefined;

  if (user.role === "superadmin") {
    const raw = (req.query?.transportadoraId as string | undefined) ?? req.body?.transportadoraId;
    if (raw === undefined || raw === null || raw === "") return null; // "todos os tenants"
    const parsed = typeof raw === "number" ? raw : parseInt(String(raw), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return user.transportadoraId ?? null;
}

/* ── requireTenantId ─────────────────────────────────────────────────
 * Mesma ideia, mas lanca se nao tiver tenant (uso em rotas de escrita
 * que sempre precisam saber a qual empresa o registro pertence). */
export function requireTenantId(req: Request): number {
  const resolved = resolveTenantId(req);
  if (typeof resolved !== "number") {
    throw new TenantScopeError("Informe transportadoraId (superadmin)");
  }
  return resolved;
}

export class TenantScopeError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "TenantScopeError";
  }
}
