import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { transportadorasTable } from "./transportadoras";
import { clientesTable } from "./clientes";
import { viagensTable } from "./viagens";

export const faturasTable = pgTable("faturas", {
  id: serial("id").primaryKey(),
  transportadoraId: integer("transportadora_id").notNull().references(() => transportadorasTable.id),
  clienteId: integer("cliente_id").notNull().references(() => clientesTable.id),
  viagemId: integer("viagem_id").notNull().references(() => viagensTable.id),
  canhotoId: integer("canhoto_id"),
  xmlId: integer("xml_id"),
  numeroFatura: text("numero_fatura"),
  valor: numeric("valor", { precision: 12, scale: 2 }).notNull(),
  valorAntecipado: numeric("valor_antecipado", { precision: 12, scale: 2 }),
  taxaAntecipacao: numeric("taxa_antecipacao", { precision: 5, scale: 4 }).default("0.015"),
  status: text("status", { enum: ["pendente", "enviado", "pago", "antecipado"] }).notNull().default("pendente"),
  dataEmissao: timestamp("data_emissao", { withTimezone: true }).defaultNow(),
  dataVencimento: timestamp("data_vencimento", { withTimezone: true }),
  dataPagamento: timestamp("data_pagamento", { withTimezone: true }),
  kitEnviadoEm: timestamp("kit_enviado_em", { withTimezone: true }),
  antecipacaoSolicitadaEm: timestamp("antecipacao_solicitada_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertFaturaSchema = createInsertSchema(faturasTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFatura = z.infer<typeof insertFaturaSchema>;
export type Fatura = typeof faturasTable.$inferSelect;
