import { pgTable, text, serial, timestamp, integer, numeric, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { transportadorasTable } from "./transportadoras";
import { motoristasTable } from "./motoristas";
import { clientesTable } from "./clientes";

export const viagensTable = pgTable("viagens", {
  id: serial("id").primaryKey(),
  transportadoraId: integer("transportadora_id").notNull().references(() => transportadorasTable.id),
  motoristaId: integer("motorista_id").references(() => motoristasTable.id),
  clienteId: integer("cliente_id").references(() => clientesTable.id),
  numeroNF: text("numero_nf"),
  valorFrete: numeric("valor_frete", { precision: 12, scale: 2 }).notNull(),
  origem: text("origem"),
  destino: text("destino"),
  status: text("status", { enum: ["pendente", "em_transito", "entregue", "validado", "faturado"] }).notNull().default("pendente"),
  dataPartida: timestamp("data_partida", { withTimezone: true }),
  dataEntrega: timestamp("data_entrega", { withTimezone: true }),
  canhotoId: integer("canhoto_id"),
  xmlId: integer("xml_id"),
  emailFinanceiro: text("email_financeiro"),
  enderecoLat: real("endereco_lat"),
  enderecoLon: real("endereco_lon"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertViagemSchema = createInsertSchema(viagensTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertViagem = z.infer<typeof insertViagemSchema>;
export type Viagem = typeof viagensTable.$inferSelect;
