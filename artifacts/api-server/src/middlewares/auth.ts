import type { Request, Response, NextFunction } from "express";
import { AUTH_COOKIE_NAME, verifyAuthToken, type JwtPayload } from "../lib/auth";

/* Estende o Request do Express com o usuario autenticado. */
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/* ── requireAuth ─────────────────────────────────────────────────────
 * Bloqueia qualquer request sem cookie de sessao valido.
 * Se valido, injeta req.user com o payload do JWT. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[AUTH_COOKIE_NAME] ?? extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Nao autenticado" });
    return;
  }

  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: "Sessao invalida ou expirada" });
    return;
  }

  req.user = payload;
  next();
}

/* ── requireSuperAdmin ───────────────────────────────────────────────
 * Usar apos requireAuth. Garante role='superadmin'. */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Nao autenticado" });
    return;
  }
  if (req.user.role !== "superadmin") {
    res.status(403).json({ error: "Acesso restrito aos administradores do sistema" });
    return;
  }
  next();
}

/* ── requireTenant ───────────────────────────────────────────────────
 * Usar apos requireAuth. Garante que o usuario pertence a uma transportadora
 * (nao e superadmin global). Rotas de negocio do dia-a-dia usam isso. */
export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Nao autenticado" });
    return;
  }
  if (req.user.transportadoraId == null) {
    res.status(403).json({ error: "Superadmin deve usar /super-admin para operacoes globais" });
    return;
  }
  next();
}

/* Aceita Bearer token em Authorization (uso futuro: API keys, mobile). */
function extractBearerToken(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const [scheme, token] = h.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}
