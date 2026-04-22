import { Router, type IRouter } from "express";
import { db, usuariosTable, transportadorasTable, toUsuarioPublico } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  signAuthToken,
  verifyPassword,
} from "../lib/auth";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

/* ── POST /api/auth/login ────────────────────────────────────────────
 * Valida credenciais, atualiza metadata de sessao e seta cookie httpOnly. */
router.post("/auth/login", async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const senha = typeof req.body?.senha === "string" ? req.body.senha : "";
    if (!email || !senha) {
      return res.status(400).json({ error: "Informe e-mail e senha" });
    }

    const [user] = await db.select().from(usuariosTable).where(eq(usuariosTable.email, email));
    if (!user || !user.ativo) {
      // Nao diferencia "usuario nao existe" de "senha errada" para evitar enumeration
      return res.status(401).json({ error: "Credenciais invalidas" });
    }

    const ok = await verifyPassword(senha, user.senhaHash);
    if (!ok) {
      return res.status(401).json({ error: "Credenciais invalidas" });
    }

    // Bloqueia login se a transportadora foi desativada pelo superadmin
    if (user.transportadoraId != null) {
      const [tenant] = await db.select().from(transportadorasTable).where(eq(transportadorasTable.id, user.transportadoraId));
      if (!tenant || !tenant.ativo) {
        return res.status(403).json({ error: "Conta da empresa suspensa. Fale com o suporte." });
      }
    }

    const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.ip ?? null;
    await db.update(usuariosTable)
      .set({ ultimoLoginAt: new Date(), ultimoIp: ip })
      .where(eq(usuariosTable.id, user.id));

    const token = signAuthToken(user);
    res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());

    req.log.info({ userId: user.id, role: user.role, tenant: user.transportadoraId }, "auth: login ok");
    return res.json({ user: toUsuarioPublico({ ...user, ultimoLoginAt: new Date(), ultimoIp: ip }) });
  } catch (err) {
    req.log.error({ err }, "auth: erro no login");
    return res.status(500).json({ error: "Erro interno" });
  }
});

/* ── POST /api/auth/logout ─────────────────────────────────────────── */
router.post("/auth/logout", (req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, { ...authCookieOptions(), maxAge: 0 });
  return res.json({ ok: true });
});

/* ── GET /api/auth/me ────────────────────────────────────────────────
 * Retorna o usuario autenticado (usado pelo frontend para hidratar a sessao). */
router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const [user] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, req.user!.userId));
    if (!user || !user.ativo) {
      return res.status(401).json({ error: "Usuario nao encontrado ou inativo" });
    }

    let transportadora: { id: number; nome: string; emailRemetente: string | null } | null = null;
    if (user.transportadoraId != null) {
      const [t] = await db.select().from(transportadorasTable).where(eq(transportadorasTable.id, user.transportadoraId));
      if (t) transportadora = { id: t.id, nome: t.nome, emailRemetente: t.emailRemetente };
    }

    return res.json({ user: toUsuarioPublico(user), transportadora });
  } catch (err) {
    req.log.error({ err }, "auth: erro em /me");
    return res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
