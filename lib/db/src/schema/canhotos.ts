import { pgTable, text, serial, timestamp, integer, numeric, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { viagensTable } from "./viagens";
import { motoristasTable } from "./motoristas";

export const canhotosTable = pgTable("canhotos", {
  id: serial("id").primaryKey(),
  viagemId: integer("viagem_id").notNull().references(() => viagensTable.id),
  motoristaId: integer("motorista_id").references(() => motoristasTable.id),
  fotoUrl: text("foto_url"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  numeroCte: text("numero_cte"),
  cnpjCliente: text("cnpj_cliente"),
  numeroNF: text("numero_nf"),
  valorDetectado: numeric("valor_detectado", { precision: 12, scale: 2 }),
  assinaturaDetectada: boolean("assinatura_detectada").default(false),
  sealId: text("seal_id"),
  // Exact client-side shutter timestamp — hidden audit trail for billing records
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  status: text("status", { enum: ["pendente", "validado", "rejeitado"] }).notNull().default("pendente"),
  iaConfidencia: real("ia_confidencia"),
  observacoes: text("observacoes"),
  fraudAlert: boolean("fraud_alert").notNull().default(false),
  fraudDistanciaMetros: integer("fraud_distancia_metros"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCanhotoSchema = createInsertSchema(canhotosTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCanhoto = z.infer<typeof insertCanhotoSchema>;
export type Canhoto = typeof canhotosTable.$inferSelect;
