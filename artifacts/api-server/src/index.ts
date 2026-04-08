import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startKeepAlive();
});

/* ── Keep-Alive ─────────────────────────────────────────────────────
 * Faz um self-ping a cada 5 minutos durante o horário comercial
 * (06:00–22:00 BRT / UTC-3) para evitar que o Replit coloque a
 * aplicação em modo sleep.
 *
 * URL alvo: variável de ambiente PUBLIC_URL (padrão: techsin.replit.app)
 * ────────────────────────────────────────────────────────────────── */
function startKeepAlive(): void {
  const BASE_URL =
    (process.env["PUBLIC_URL"] ?? "https://techsin.replit.app").replace(/\/$/, "");
  const PING_URL   = `${BASE_URL}/api/healthz`;
  const INTERVAL   = 5 * 60 * 1_000; // 5 min em ms
  const BRT_OFFSET = -3 * 60;        // UTC-3 em minutos

  function isBusinessHourBRT(): boolean {
    const nowUTC     = new Date();
    const totalMin   = nowUTC.getUTCHours() * 60 + nowUTC.getUTCMinutes() + BRT_OFFSET;
    const brtMinutes = ((totalMin % 1440) + 1440) % 1440; // wrap 0-1439
    const brtHour    = brtMinutes / 60;
    return brtHour >= 6 && brtHour < 22;
  }

  async function ping(): Promise<void> {
    if (!isBusinessHourBRT()) {
      logger.debug({ pingUrl: PING_URL }, "keep-alive: fora do horário comercial, pulando");
      return;
    }
    const t0 = Date.now();
    try {
      const res = await fetch(PING_URL, {
        signal: AbortSignal.timeout(8_000),
        headers: { "x-keepalive": "1" },
      });
      logger.info(
        { pingUrl: PING_URL, status: res.status, ms: Date.now() - t0 },
        "keep-alive: ping OK",
      );
    } catch (err) {
      logger.warn(
        { pingUrl: PING_URL, ms: Date.now() - t0, err },
        "keep-alive: ping falhou",
      );
    }
  }

  setInterval(ping, INTERVAL);
  logger.info(
    { pingUrl: PING_URL, intervalMin: INTERVAL / 60_000, horas: "06:00–22:00 BRT" },
    "keep-alive: agendador iniciado",
  );
}
