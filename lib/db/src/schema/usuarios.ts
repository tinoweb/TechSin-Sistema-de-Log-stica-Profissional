import { pgTable, text, serial, timestamp, boolean, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { transportadorasTable } from "./transportadoras";

/* ── Tabela de usuarios (multi-tenant) ───────────────────────────────
 * Um usuario sempre pertence a UMA transportadora, exceto os superadmins
 * (donos do SaaS) que nao tem transportadoraId. Cada usuario tem um papel
 * que determina o que ele pode fazer dentro da empresa dele.
 *
 * roles:
 *   - "superadmin": dono do SaaS, enxerga todas as transportadoras (global)
 *   - "admin":      administrador da transportadora, acesso completo
 *   - "operador":   usa o dia-a-dia (aprovar canhotos, cadastrar motorista)
 *   - "financeiro": ve faturas e cobrancas (read-mostly)
 * ────────────────────────────────────────────────────────────────── */
export const usuariosTable = pgTable("usuarios", {
  id: serial("id").primaryKey(),

  /* null = superadmin global do SaaS. Caso contrario, tenant owner. */
  transportadoraId: integer("transportadora_id").references(() => transportadorasTable.id, { onDelete: "cascade" }),

  nome:       text("nome").notNull(),
  email:      text("email").notNull().unique(),
  senhaHash:  text("senha_hash").notNull(),
  role:       text("role", { enum: ["superadmin", "admin", "operador", "financeiro"] }).notNull().default("operador"),
  ativo:      boolean("ativo").notNull().default(true),

  /* Metadados de sessao para auditoria. */
  ultimoLoginAt: timestamp("ultimo_login_at", { withTimezone: true }),
  ultimoIp:      text("ultimo_ip"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  /* Indice por tenant para queries frequentes de listagem de usuarios da empresa. */
  byTenant: index("usuarios_transportadora_id_idx").on(t.transportadoraId),
}));

/* Nunca exponha o hash ao cliente. */
export const insertUsuarioSchema = createInsertSchema(usuariosTable).omit({
  id: true, createdAt: true, updatedAt: true, ultimoLoginAt: true, ultimoIp: true,
});
export type InsertUsuario = z.infer<typeof insertUsuarioSchema>;
export type Usuario = typeof usuariosTable.$inferSelect;

/* DTO seguro que pode ser enviado ao frontend (sem senhaHash). */
export type UsuarioPublico = Omit<Usuario, "senhaHash">;

export function toUsuarioPublico(u: Usuario): UsuarioPublico {
  const { senhaHash: _ignored, ...safe } = u;
  return safe;
}
