import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "./auth";

/* ── Rotas publicas (sem cookie/token) ───────────────────────────────
 * Todas as outras rotas exigem login via cookie de sessao. */
const PUBLIC_ROUTES: Array<{ method: string; re: RegExp }> = [
  /* Infra */
  { method: "GET",  re: /^\/healthz\/?$/ },

  /* Auth */
  { method: "POST", re: /^\/auth\/login\/?$/ },
  { method: "POST", re: /^\/auth\/logout\/?$/ },

  /* App do motorista (acesso via link com magic token) */
  { method: "GET",  re: /^\/motoristas\/by-token\/[^/]+\/?$/ },
  { method: "GET",  re: /^\/viagens\/\d+\/?$/ },
  { method: "POST", re: /^\/viagens\/\d+\/canhoto\/?$/ },
];

export function authGuard(req: Request, res: Response, next: NextFunction): void {
  const isPublic = PUBLIC_ROUTES.some(r => r.method === req.method && r.re.test(req.path));
  if (isPublic) return next();
  return requireAuth(req, res, next);
}
