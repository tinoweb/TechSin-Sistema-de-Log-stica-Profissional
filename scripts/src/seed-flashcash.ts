import { db, transportadorasTable, motoristasTable, clientesTable, viagensTable, canhotosTable, xmlsTable, faturasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

async function seed() {
  console.log("Seeding FlashCash Log data...");

  const [transportadora] = await db.insert(transportadorasTable).values({
    nome: "Flash Transportes LTDA",
    cnpj: "12.345.678/0001-90",
    email: "contato@flashtransportes.com.br",
    telefone: "(11) 99999-1234",
    emailFinanceiro: "financeiro@flashtransportes.com.br",
  }).onConflictDoNothing().returning();

  if (!transportadora) {
    console.log("Transportadora already seeded, skipping.");
    return;
  }

  const [m1] = await db.insert(motoristasTable).values({
    transportadoraId: transportadora.id,
    nome: "Carlos Eduardo Souza",
    cpf: "123.456.789-00",
    telefone: "(11) 98888-1111",
    email: "carlos@flash.com",
    cnh: "12345678901",
    status: "em_rota",
    totalEntregas: 47,
  }).returning();

  const [m2] = await db.insert(motoristasTable).values({
    transportadoraId: transportadora.id,
    nome: "Roberto Lima Neto",
    cpf: "987.654.321-00",
    telefone: "(11) 97777-2222",
    email: "roberto@flash.com",
    cnh: "98765432100",
    status: "ativo",
    totalEntregas: 23,
  }).returning();

  const [m3] = await db.insert(motoristasTable).values({
    transportadoraId: transportadora.id,
    nome: "Fernanda Costa Alves",
    cpf: "456.789.123-00",
    telefone: "(11) 96666-3333",
    email: "fernanda@flash.com",
    cnh: "45678912300",
    status: "em_rota",
    totalEntregas: 31,
  }).returning();

  const [c1] = await db.insert(clientesTable).values({
    transportadoraId: transportadora.id,
    nome: "Mercado Livre Brasil",
    cnpj: "03.007.331/0001-41",
    email: "logistica@mercadolivre.com.br",
    emailFinanceiro: "financeiro@mercadolivre.com.br",
    telefone: "(11) 3333-1234",
    endereco: "Av. das Nações Unidas, 3003 - São Paulo, SP",
    totalFaturas: 12,
    valorTotal: "145000.00",
  }).returning();

  const [c2] = await db.insert(clientesTable).values({
    transportadoraId: transportadora.id,
    nome: "Amazon Servicos de Varejo",
    cnpj: "15.436.940/0001-03",
    email: "vendas@amazon.com.br",
    emailFinanceiro: "pagamentos@amazon.com.br",
    telefone: "(11) 4444-5678",
    endereco: "Rua do Rocha Pombo, 180 - São Paulo, SP",
    totalFaturas: 8,
    valorTotal: "89500.00",
  }).returning();

  const [c3] = await db.insert(clientesTable).values({
    transportadoraId: transportadora.id,
    nome: "Magazine Luiza SA",
    cnpj: "47.960.950/0001-21",
    email: "logistica@magazineluiza.com.br",
    emailFinanceiro: "contas@magazineluiza.com.br",
    telefone: "(11) 5555-9012",
    endereco: "Rua Francisco Rodrigues Filho, 1172 - Franca, SP",
    totalFaturas: 15,
    valorTotal: "210000.00",
  }).returning();

  const [v1] = await db.insert(viagensTable).values({
    transportadoraId: transportadora.id,
    motoristaId: m1.id,
    clienteId: c1.id,
    numeroNF: "NF-2024-001",
    valorFrete: "8750.00",
    origem: "São Paulo, SP",
    destino: "Campinas, SP",
    status: "em_transito",
    dataPartida: new Date(Date.now() - 3 * 60 * 60 * 1000),
  }).returning();

  const [v2] = await db.insert(viagensTable).values({
    transportadoraId: transportadora.id,
    motoristaId: m3.id,
    clienteId: c2.id,
    numeroNF: "NF-2024-002",
    valorFrete: "12300.00",
    origem: "Guarulhos, SP",
    destino: "Rio de Janeiro, RJ",
    status: "validado",
    dataPartida: new Date(Date.now() - 8 * 60 * 60 * 1000),
    dataEntrega: new Date(Date.now() - 1 * 60 * 60 * 1000),
  }).returning();

  const [v3] = await db.insert(viagensTable).values({
    transportadoraId: transportadora.id,
    motoristaId: m2.id,
    clienteId: c3.id,
    numeroNF: "NF-2024-003",
    valorFrete: "5400.00",
    origem: "São Paulo, SP",
    destino: "Franca, SP",
    status: "faturado",
    dataPartida: new Date(Date.now() - 24 * 60 * 60 * 1000),
    dataEntrega: new Date(Date.now() - 18 * 60 * 60 * 1000),
  }).returning();

  const [canhoto1] = await db.insert(canhotosTable).values({
    viagemId: v2.id,
    motoristaId: m3.id,
    fotoUrl: "https://via.placeholder.com/400x600?text=Canhoto+NF-2024-002",
    latitude: -22.9068,
    longitude: -43.1729,
    timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000),
    numeroCte: "CTE-2024-002",
    cnpjCliente: "15.436.940/0001-03",
    numeroNF: "NF-2024-002",
    valorDetectado: "12300.00",
    assinaturaDetectada: true,
    sealId: `SEAL-${randomUUID().substring(0, 8).toUpperCase()}`,
    status: "validado",
    iaConfidencia: 0.96,
  }).returning();

  const [canhoto2] = await db.insert(canhotosTable).values({
    viagemId: v3.id,
    motoristaId: m2.id,
    fotoUrl: "https://via.placeholder.com/400x600?text=Canhoto+NF-2024-003",
    latitude: -20.5386,
    longitude: -47.4007,
    timestamp: new Date(Date.now() - 18 * 60 * 60 * 1000),
    numeroCte: "CTE-2024-003",
    cnpjCliente: "47.960.950/0001-21",
    numeroNF: "NF-2024-003",
    valorDetectado: "5400.00",
    assinaturaDetectada: true,
    sealId: `SEAL-${randomUUID().substring(0, 8).toUpperCase()}`,
    status: "validado",
    iaConfidencia: 0.91,
  }).returning();

  await db.update(viagensTable).set({ canhotoId: canhoto1.id, status: "validado" }).where(eq(viagensTable.id, v2.id));
  await db.insert(xmlsTable).values({
    transportadoraId: transportadora.id,
    tipo: "cte",
    numeroCte: "CTE-2024-002",
    cnpjEmissor: "12.345.678/0001-90",
    cnpjDestinatario: "15.436.940/0001-03",
    nomeDestinatario: "Amazon Servicos de Varejo",
    valorFrete: "12300.00",
    dataEmissao: new Date(Date.now() - 10 * 60 * 60 * 1000),
    xmlContent: `<CTe><infCte><ide><cCT>CTE2024002</cCT></ide><emit><CNPJ>12345678000190</CNPJ></emit><dest><CNPJ>15436940000103</CNPJ><xNome>Amazon Servicos de Varejo</xNome></dest><vPrest><vTPrest>12300.00</vTPrest></vPrest></infCte></CTe>`,
    status: "conciliado",
    canhotoId: canhoto1.id,
    viagemId: v2.id,
  }).returning();

  await db.insert(xmlsTable).values({
    transportadoraId: transportadora.id,
    tipo: "cte",
    numeroCte: "CTE-2024-004",
    cnpjEmissor: "12.345.678/0001-90",
    cnpjDestinatario: "03.007.331/0001-41",
    nomeDestinatario: "Mercado Livre Brasil",
    valorFrete: "8750.00",
    dataEmissao: new Date(Date.now() - 2 * 60 * 60 * 1000),
    xmlContent: `<CTe><infCte><ide><cCT>CTE2024004</cCT></ide><vPrest><vTPrest>8750.00</vTPrest></vPrest></infCte></CTe>`,
    status: "pendente",
  }).returning();

  const [fatura1] = await db.insert(faturasTable).values({
    transportadoraId: transportadora.id,
    clienteId: c3.id,
    viagemId: v3.id,
    canhotoId: canhoto2.id,
    numeroFatura: "FAT-2024-001",
    valor: "5400.00",
    status: "antecipado",
    valorAntecipado: "5319.00",
    taxaAntecipacao: "0.015",
    dataEmissao: new Date(Date.now() - 16 * 60 * 60 * 1000),
    dataVencimento: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    kitEnviadoEm: new Date(Date.now() - 15 * 60 * 60 * 1000),
    antecipacaoSolicitadaEm: new Date(Date.now() - 14 * 60 * 60 * 1000),
  }).returning();

  const [fatura2] = await db.insert(faturasTable).values({
    transportadoraId: transportadora.id,
    clienteId: c2.id,
    viagemId: v2.id,
    canhotoId: canhoto1.id,
    numeroFatura: "FAT-2024-002",
    valor: "12300.00",
    status: "enviado",
    dataEmissao: new Date(Date.now() - 30 * 60 * 1000),
    dataVencimento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    kitEnviadoEm: new Date(Date.now() - 20 * 60 * 1000),
  }).returning();

  console.log("Seed complete!");
  console.log(`- Transportadora: ${transportadora.nome}`);
  console.log(`- Motoristas: ${m1.nome}, ${m2.nome}, ${m3.nome}`);
  console.log(`- Clientes: ${c1.nome}, ${c2.nome}, ${c3.nome}`);
  console.log(`- Viagens: ${v1.id}, ${v2.id}, ${v3.id}`);
  console.log(`- Canhotos: ${canhoto1.id}, ${canhoto2.id}`);
  console.log(`- Faturas: ${fatura1.id}, ${fatura2.id}`);
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
