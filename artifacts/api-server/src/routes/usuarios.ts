import { Router, type IRouter } from "express";
import { db, usuariosTable, transportadorasTable } from "@workspace/db";
import { eq, and, or, like, count } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { resolveTenantId, requireTenantId } from "../lib/tenant-scope";
import type { Request, Response } from "express";

const router: IRouter = Router();

/* ─────────────────────────────────────────────────────────────────────
 * GET /usuarios
 *
 * Lista usuários com filtro por tenant:
 * - Superadmin: lista todos os usuários de todas as transportadoras
 * - Admin: lista apenas usuarios da propria transportadora
 * - Outros roles: 403
 * ───────────────────────────────────────────────────────────────────── */
router.get("/usuarios", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Nao autenticado" });

    const tenantId = resolveTenantId(req);
    const role = user.role;

    // Apenas superadmin e admin podem listar usuarios
    if (role !== "superadmin" && role !== "admin") {
      return res.status(403).json({ error: "Sem permissao" });
    }

    let query = db
      .select({
        id: usuariosTable.id,
        email: usuariosTable.email,
        nome: usuariosTable.nome,
        role: usuariosTable.role,
        transportadoraId: usuariosTable.transportadoraId,
        ativo: usuariosTable.ativo,
        createdAt: usuariosTable.createdAt,
        ultimoLoginAt: usuariosTable.ultimoLoginAt,
      })
      .from(usuariosTable);

    // Se nao for superadmin, filtra pelo tenant
    if (role !== "superadmin" && typeof tenantId === "number") {
      query = query.where(eq(usuariosTable.transportadoraId, tenantId));
    }

    // Filtro de busca opcional (email ou nome)
    const search = typeof req.query?.search === "string" ? req.query.search.trim() : "";
    if (search) {
      query = query.where(
        or(
          like(usuariosTable.email, `%${search}%`),
          like(usuariosTable.nome, `%${search}%`)
        )!
      );
    }

    const usuarios = await query.orderBy(usuariosTable.createdAt);

    // Se for superadmin, enriquece com nome da transportadora
    let enriched = usuarios;
    if (role === "superadmin") {
      enriched = await Promise.all(
        usuarios.map(async (u) => {
          if (!u.transportadoraId) return { ...u, transportadoraNome: null };
          const [transportadora] = await db
            .select({ nome: transportadorasTable.nome })
            .from(transportadorasTable)
            .where(eq(transportadorasTable.id, u.transportadoraId))
            .limit(1);
          return { ...u, transportadoraNome: transportadora?.nome ?? null };
        })
      );
    }

    res.json(enriched);
  } catch (err) {
    req.log?.error({ err }, "Erro ao listar usuarios");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ─────────────────────────────────────────────────────────────────────
 * POST /usuarios
 *
 * Cria um novo usuario.
 * - Superadmin: pode criar usuario para qualquer transportadora (ou superadmin global)
 * - Admin: so pode criar usuario para sua propria transportadora
 * - Senha OBRIGATORIA (hash no backend)
 * ───────────────────────────────────────────────────────────────────── */
router.post("/usuarios", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Nao autenticado" });

    const role = user.role;
    if (role !== "superadmin" && role !== "admin") {
      return res.status(403).json({ error: "Sem permissao" });
    }

    const { email, senha, nome, role: novoRole, transportadoraId } = req.body;

    // Validacoes basicas
    if (typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "E-mail invalido" });
    }
    if (typeof senha !== "string" || senha.length < 6) {
      return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres" });
    }
    if (typeof nome !== "string" || nome.trim().length === 0) {
      return res.status(400).json({ error: "Nome obrigatorio" });
    }
    if (!["superadmin", "admin", "operador", "financeiro"].includes(novoRole)) {
      return res.status(400).json({ error: "Role invalido" });
    }

    // Validacoes de tenant
    let finalTransportadoraId: number | null = null;
    if (novoRole === "superadmin") {
      // Superadmin nao tem tenant
      if (role !== "superadmin") {
        return res.status(403).json({ error: "Apenas superadmin pode criar superadmin" });
      }
      finalTransportadoraId = null;
    } else {
      // Outros roles precisam de tenant
      if (role === "superadmin") {
        // Superadmin pode definir o tenant
        if (typeof transportadoraId !== "number") {
          return res.status(400).json({ error: "transportadoraId obrigatorio para esta role" });
        }
        finalTransportadoraId = transportadoraId;
      } else {
        // Admin so pode criar para seu proprio tenant
        const tenantId = requireTenantId(req);
        finalTransportadoraId = tenantId;
      }
    }

    // Verifica se email ja existe
    const [existente] = await db
      .select({ id: usuariosTable.id })
      .from(usuariosTable)
      .where(eq(usuariosTable.email, email.toLowerCase().trim()))
      .limit(1);

    if (existente) {
      return res.status(409).json({ error: "E-mail ja cadastrado" });
    }

    // Hash da senha
    const senhaHash = await bcrypt.hash(senha, 10);

    const [created] = await db
      .insert(usuariosTable)
      .values({
        email: email.toLowerCase().trim(),
        senhaHash,
        nome: nome.trim(),
        role: novoRole,
        transportadoraId: finalTransportadoraId,
        ativo: true,
      })
      .returning({
        id: usuariosTable.id,
        email: usuariosTable.email,
        nome: usuariosTable.nome,
        role: usuariosTable.role,
        transportadoraId: usuariosTable.transportadoraId,
        ativo: usuariosTable.ativo,
        createdAt: usuariosTable.createdAt,
      });

    res.status(201).json(created);
  } catch (err) {
    req.log?.error({ err }, "Erro ao criar usuario");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ─────────────────────────────────────────────────────────────────────
 * PATCH /usuarios/:id
 *
 * Edita um usuario (nome, role, transportadoraId, ativo).
 * - Senha NAO pode ser alterada aqui (usar PATCH /usuarios/:id/senha)
 * - Superadmin: pode editar qualquer usuario
 * - Admin: so pode editar usuarios do seu tenant
 * - Usuario nao pode editar a si mesmo (evitar lockout)
 * ───────────────────────────────────────────────────────────────────── */
router.patch("/usuarios/:id", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Nao autenticado" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID invalido" });

    // Usuario nao pode se auto-editar
    if (id === user.userId) {
      return res.status(400).json({ error: "Use a pagina de perfil para editar seus dados" });
    }

    const role = user.role;
    if (role !== "superadmin" && role !== "admin") {
      return res.status(403).json({ error: "Sem permissao" });
    }

    // Busca o usuario alvo
    const [alvo] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, id)).limit(1);
    if (!alvo) return res.status(404).json({ error: "Usuario nao encontrado" });

    // Verifica permissao de tenant
    if (role !== "superadmin") {
      const tenantId = requireTenantId(req);
      if (alvo.transportadoraId !== tenantId) {
        return res.status(403).json({ error: "Sem permissao para editar usuario de outro tenant" });
      }
    }

    const { nome, role: novoRole, transportadoraId, ativo } = req.body;

    const updates: any = {};
    if (typeof nome === "string" && nome.trim().length > 0) {
      updates.nome = nome.trim();
    }
    if (typeof novoRole === "string" && ["superadmin", "admin", "operador", "financeiro"].includes(novoRole)) {
      // Apenas superadmin pode promover a superadmin
      if (novoRole === "superadmin" && role !== "superadmin") {
        return res.status(403).json({ error: "Apenas superadmin pode promover a superadmin" });
      }
      updates.role = novoRole;

      // Se mudou para superadmin, remove tenant
      if (novoRole === "superadmin") {
        updates.transportadoraId = null;
      }
    }
    if (typeof ativo === "boolean") {
      updates.ativo = ativo;
    }

    // Superadmin pode mudar tenant
    if (role === "superadmin" && typeof transportadoraId === "number" && novoRole !== "superadmin") {
      updates.transportadoraId = transportadoraId;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "Nenhum campo para atualizar" });
    }

    const [updated] = await db
      .update(usuariosTable)
      .set(updates)
      .where(eq(usuariosTable.id, id))
      .returning({
        id: usuariosTable.id,
        email: usuariosTable.email,
        nome: usuariosTable.nome,
        role: usuariosTable.role,
        transportadoraId: usuariosTable.transportadoraId,
        ativo: usuariosTable.ativo,
        createdAt: usuariosTable.createdAt,
      });

    res.json(updated);
  } catch (err) {
    req.log?.error({ err }, "Erro ao editar usuario");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ─────────────────────────────────────────────────────────────────────
 * PATCH /usuarios/:id/senha
 *
 * Altera a senha de um usuario.
 * - Superadmin: pode alterar senha de qualquer usuario
 * - Admin: so pode alterar senha de usuarios do seu tenant
 * - Usuario pode alterar sua propria senha (requer senha atual)
 * ───────────────────────────────────────────────────────────────────── */
router.patch("/usuarios/:id/senha", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Nao autenticado" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID invalido" });

    const { senha, senhaAtual } = req.body;

    if (typeof senha !== "string" || senha.length < 6) {
      return res.status(400).json({ error: "Nova senha deve ter pelo menos 6 caracteres" });
    }

    // Busca o usuario alvo
    const [alvo] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, id)).limit(1);
    if (!alvo) return res.status(404).json({ error: "Usuario nao encontrado" });

    // Se esta alterando a propria senha, precisa da senha atual
    if (id === user.userId) {
      if (typeof senhaAtual !== "string" || senhaAtual.length === 0) {
        return res.status(400).json({ error: "Senha atual obrigatoria para alterar sua propria senha" });
      }
      const ok = await bcrypt.compare(senhaAtual, alvo.senhaHash);
      if (!ok) {
        return res.status(401).json({ error: "Senha atual incorreta" });
      }
    } else {
      // Alterando senha de outro usuario - precisa ser superadmin ou admin do tenant
      const role = user.role;
      if (role !== "superadmin" && role !== "admin") {
        return res.status(403).json({ error: "Sem permissao" });
      }

      if (role !== "superadmin") {
        const tenantId = requireTenantId(req);
        if (alvo.transportadoraId !== tenantId) {
          return res.status(403).json({ error: "Sem permissao para alterar senha de outro tenant" });
        }
      }
    }

    // Hash da nova senha
    const senhaHash = await bcrypt.hash(senha, 10);

    await db
      .update(usuariosTable)
      .set({ senhaHash })
      .where(eq(usuariosTable.id, id));

    res.json({ success: true });
  } catch (err) {
    req.log?.error({ err }, "Erro ao alterar senha");
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ─────────────────────────────────────────────────────────────────────
 * DELETE /usuarios/:id
 *
 * Remove um usuario.
 * - Superadmin: pode remover qualquer usuario
 * - Admin: so pode remover usuarios do seu tenant
 * - Nao pode remover a si mesmo
 * ───────────────────────────────────────────────────────────────────── */
router.delete("/usuarios/:id", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Nao autenticado" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID invalido" });

    // Nao pode se auto-remover
    if (id === user.userId) {
      return res.status(400).json({ error: "Nao pode remover a si mesmo" });
    }

    const role = user.role;
    if (role !== "superadmin" && role !== "admin") {
      return res.status(403).json({ error: "Sem permissao" });
    }

    // Busca o usuario alvo
    const [alvo] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, id)).limit(1);
    if (!alvo) return res.status(404).json({ error: "Usuario nao encontrado" });

    // Verifica permissao de tenant
    if (role !== "superadmin") {
      const tenantId = requireTenantId(req);
      if (alvo.transportadoraId !== tenantId) {
        return res.status(403).json({ error: "Sem permissao para remover usuario de outro tenant" });
      }
    }

    await db.delete(usuariosTable).where(eq(usuariosTable.id, id));

    res.json({ success: true });
  } catch (err) {
    req.log?.error({ err }, "Erro ao remover usuario");
    res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
