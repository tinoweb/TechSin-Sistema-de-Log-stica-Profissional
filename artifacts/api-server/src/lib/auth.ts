import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Usuario } from "@workspace/db";

/* ── Configuracao JWT ────────────────────────────────────────────────
 * Em producao, JWT_SECRET DEVE estar definido no .env (>= 32 chars).
 * Se nao estiver, geramos um aviso bem visivel nos logs e usamos um
 * fallback determinstico apenas para facilitar dev local. */
const JWT_SECRET: string = (() => {
  const fromEnv = process.env["JWT_SECRET"]?.trim();
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "JWT_SECRET ausente ou muito curto em producao (minimo 32 chars). " +
      "Gere com: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
    );
  }
  // Fallback apenas em dev
  return "dev-only-secret-please-set-JWT_SECRET-in-env-at-least-32-chars";
})();

const JWT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 dias

export const AUTH_COOKIE_NAME = "techsin_session";

export interface JwtPayload {
  userId:           number;
  transportadoraId: number | null; // null = superadmin
  role:             "superadmin" | "admin" | "operador" | "financeiro";
  email:            string;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signAuthToken(u: Pick<Usuario, "id" | "transportadoraId" | "role" | "email">): string {
  const payload: JwtPayload = {
    userId:           u.id,
    transportadoraId: u.transportadoraId,
    role:             u.role,
    email:            u.email,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_TTL_SECONDS });
}

export function verifyAuthToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    if (typeof decoded?.userId !== "number") return null;
    return decoded;
  } catch {
    return null;
  }
}

/* Cookie opts: em producao exige HTTPS (secure=true).
 * COOKIE_SECURE=false no .env desabilita o flag Secure (util em dev/staging sem HTTPS). */
export function authCookieOptions(): import("express").CookieOptions {
  const isProd = process.env["NODE_ENV"] === "production";
  const cookieSecureEnv = process.env["COOKIE_SECURE"];
  const secure = cookieSecureEnv === "false" ? false : isProd;
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge:   JWT_TTL_SECONDS * 1000,
    path:     "/",
  };
}
