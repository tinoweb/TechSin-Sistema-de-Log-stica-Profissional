import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transportadorasTable = pgTable("transportadoras", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  cnpj: text("cnpj").notNull().unique(),
  email: text("email").notNull(),
  telefone: text("telefone"),
  emailFinanceiro: text("email_financeiro"),
  /* Nome exibido no campo "De:" dos e-mails disparados (white-label).
   * Ex: "JMega Embalagens". Se null, cai de volta para o campo `nome`.
   * Tamb\u00e9m \u00e9 usado no assunto e no corpo do e-mail ao cliente final,
   * para que ele nunca veja a marca TechSin. */
  emailRemetente: text("email_remetente"),
  ativo: boolean("ativo").notNull().default(true),
  plano: text("plano", { enum: ["starter", "pro", "enterprise"] }).notNull().default("starter"),
  totalCanhotos: integer("total_canhotos").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTransportadoraSchema = createInsertSchema(transportadorasTable).omit({ id: true, createdAt: true, updatedAt: true, totalCanhotos: true });
export type InsertTransportadora = z.infer<typeof insertTransportadoraSchema>;
export type Transportadora = typeof transportadorasTable.$inferSelect;
