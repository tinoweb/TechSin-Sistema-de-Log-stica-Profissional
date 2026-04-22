/* ─────────────────────────────────────────────────────────────────────
 * seed-usuarios.ts
 *
 * Cria a conta inicial de superadmin (dono do SaaS) e um admin para a
 * primeira transportadora cadastrada. Seguro para rodar varias vezes:
 * se os e-mails ja existirem, apenas pula.
 *
 * Variaveis de ambiente (opcionais — se nao definidas usa defaults):
 *   SEED_SUPERADMIN_EMAIL     (default: dono@techsin.com.br)
 *   SEED_SUPERADMIN_SENHA     (default: Troque@2026!)
 *   SEED_SUPERADMIN_NOME      (default: Dono TechSin)
 *   SEED_ADMIN_EMAIL          (default: admin@transportadora.com.br)
 *   SEED_ADMIN_SENHA          (default: Troque@2026!)
 *   SEED_ADMIN_NOME           (default: Administrador)
 *
 * Uso: pnpm --filter @workspace/scripts seed-usuarios
 * ───────────────────────────────────────────────────────────────────── */
import { db, usuariosTable, transportadorasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const SUPERADMIN_EMAIL = process.env.SEED_SUPERADMIN_EMAIL ?? "dono@techsin.com.br";
const SUPERADMIN_SENHA = process.env.SEED_SUPERADMIN_SENHA ?? "Troque@2026!";
const SUPERADMIN_NOME  = process.env.SEED_SUPERADMIN_NOME  ?? "Dono TechSin";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@transportadora.com.br";
const ADMIN_SENHA = process.env.SEED_ADMIN_SENHA ?? "Troque@2026!";
const ADMIN_NOME  = process.env.SEED_ADMIN_NOME  ?? "Administrador";

async function criarSeExistir(opts: {
  email: string;
  senha: string;
  nome: string;
  role: "superadmin" | "admin";
  transportadoraId: number | null;
}) {
  const existente = await db
    .select({ id: usuariosTable.id })
    .from(usuariosTable)
    .where(eq(usuariosTable.email, opts.email))
    .limit(1);

  if (existente.length > 0) {
    console.log(`[skip] Usuario ${opts.email} ja existe.`);
    return;
  }

  const senhaHash = await bcrypt.hash(opts.senha, 10);
  await db.insert(usuariosTable).values({
    email:            opts.email,
    senhaHash,
    nome:             opts.nome,
    role:             opts.role,
    transportadoraId: opts.transportadoraId,
    ativo:            true,
  });
  console.log(`[ok] Usuario criado: ${opts.email} (${opts.role})`);
}

async function main() {
  console.log("Seeding usuarios...");

  /* 1) Superadmin global (sem tenant). */
  await criarSeExistir({
    email:            SUPERADMIN_EMAIL,
    senha:            SUPERADMIN_SENHA,
    nome:             SUPERADMIN_NOME,
    role:             "superadmin",
    transportadoraId: null,
  });

  /* 2) Admin da primeira transportadora existente (se houver). */
  const [primeiraTransportadora] = await db
    .select({ id: transportadorasTable.id, nome: transportadorasTable.nome })
    .from(transportadorasTable)
    .orderBy(transportadorasTable.id)
    .limit(1);

  if (!primeiraTransportadora) {
    console.log(
      "[warn] Nenhuma transportadora encontrada. " +
      "Rode `pnpm --filter @workspace/scripts seed-flashcash` primeiro " +
      "ou crie a transportadora manualmente para vincular o admin.",
    );
  } else {
    await criarSeExistir({
      email:            ADMIN_EMAIL,
      senha:            ADMIN_SENHA,
      nome:             ADMIN_NOME,
      role:             "admin",
      transportadoraId: primeiraTransportadora.id,
    });
    console.log(
      `[info] Admin vinculado a transportadora #${primeiraTransportadora.id} (${primeiraTransportadora.nome}).`,
    );
  }

  console.log("\n=== CREDENCIAIS GERADAS ===");
  console.log(`Superadmin: ${SUPERADMIN_EMAIL} / ${SUPERADMIN_SENHA}`);
  console.log(`Admin:      ${ADMIN_EMAIL} / ${ADMIN_SENHA}`);
  console.log("⚠️  Troque as senhas no primeiro login em producao.\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed falhou:", err);
    process.exit(1);
  });
