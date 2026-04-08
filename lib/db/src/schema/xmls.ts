import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { transportadorasTable } from "./transportadoras";

export const xmlsTable = pgTable("xmls", {
  id: serial("id").primaryKey(),
  transportadoraId: integer("transportadora_id").notNull().references(() => transportadorasTable.id),
  tipo: text("tipo", { enum: ["cte", "manifesto", "comprovante"] }).notNull(),
  numeroCte: text("numero_cte"),
  cnpjEmissor: text("cnpj_emissor"),
  cnpjDestinatario: text("cnpj_destinatario"),
  nomeDestinatario: text("nome_destinatario"),
  valorFrete: numeric("valor_frete", { precision: 12, scale: 2 }),
  dataEmissao: timestamp("data_emissao", { withTimezone: true }),
  xmlContent: text("xml_content"),
  chaveAcesso: text("chave_acesso"),
  enderecoEntrega: text("endereco_entrega"),
  status: text("status", { enum: ["processando", "conciliado", "pendente", "erro"] }).notNull().default("pendente"),
  canhotoId: integer("canhoto_id"),
  viagemId: integer("viagem_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertXmlSchema = createInsertSchema(xmlsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertXml = z.infer<typeof insertXmlSchema>;
export type XmlUpload = typeof xmlsTable.$inferSelect;
