import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { transportadorasTable } from "./transportadoras";

export const motoristasTable = pgTable("motoristas", {
  id: serial("id").primaryKey(),
  transportadoraId: integer("transportadora_id").notNull().references(() => transportadorasTable.id),
  nome: text("nome").notNull(),
  cpf: text("cpf").notNull(),
  telefone: text("telefone"),
  email: text("email"),
  cnh: text("cnh"),
  status: text("status", { enum: ["ativo", "inativo", "em_rota"] }).notNull().default("ativo"),
  totalEntregas: integer("total_entregas").notNull().default(0),
  magicToken: text("magic_token").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMotoristaSchema = createInsertSchema(motoristasTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMotorista = z.infer<typeof insertMotoristaSchema>;
export type Motorista = typeof motoristasTable.$inferSelect;
