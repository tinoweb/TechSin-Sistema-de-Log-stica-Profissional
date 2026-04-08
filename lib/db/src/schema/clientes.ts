import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { transportadorasTable } from "./transportadoras";

export const clientesTable = pgTable("clientes", {
  id: serial("id").primaryKey(),
  transportadoraId: integer("transportadora_id").notNull().references(() => transportadorasTable.id),
  nome: text("nome").notNull(),
  cnpj: text("cnpj").notNull(),
  email: text("email").notNull(),
  emailFinanceiro: text("email_financeiro"),
  telefone: text("telefone"),
  endereco: text("endereco"),
  totalFaturas: integer("total_faturas").notNull().default(0),
  valorTotal: numeric("valor_total", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClienteSchema = createInsertSchema(clientesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCliente = z.infer<typeof insertClienteSchema>;
export type Cliente = typeof clientesTable.$inferSelect;
