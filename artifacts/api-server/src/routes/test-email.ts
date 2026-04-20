import { Router } from "express";
import { sendBillingEmail } from "../services/email";
import { logger } from "../lib/logger";

const router = Router();

/**
 * GET /api/test-email
 * Rota para testar o envio de email
 * (montada sob /api no app.ts — por isso só /test-email aqui)
 * Query params:
 *   - to: email destinatário (opcional, padrão: teste@exemplo.com)
 *   - force: enviar mesmo sem RESEND_API_KEY (opcional)
 */
router.get("/test-email", async (req, res) => {
  const to = (req.query.to as string) || "teste@exemplo.com";
  const force = req.query.force === "true";

  const hasResendKey = !!process.env["RESEND_API_KEY"];
  const resendKeyPreview = hasResendKey
    ? `${process.env["RESEND_API_KEY"]}`.substring(0, 10) + "..."
    : "NÃO CONFIGURADA";

  logger.info({ to, hasResendKey }, "test-email: iniciando teste");

  try {
    const result = await sendBillingEmail({
      to,
      clienteNome: "Cliente Teste",
      numeroNF: "123456",
      valorFrete: 1250.5,
      destino: "São Paulo - SP",
      sealId: "TEST-123-ABC",
    });

    res.json({
      success: true,
      config: {
        resendKeyConfigured: hasResendKey,
        resendKeyPreview,
        recipient: to,
      },
      result: {
        sent: result.sent,
        preview: result.preview.substring(0, 500) + "...",
      },
      message: result.sent
        ? "Email enviado com sucesso!"
        : hasResendKey
          ? "Email não enviado - verifique logs para detalhes do erro"
          : "Email não enviado - RESEND_API_KEY não configurada",
    });
  } catch (err) {
    logger.error({ err }, "test-email: erro ao testar email");
    res.status(500).json({
      success: false,
      error: err.message,
      config: {
        resendKeyConfigured: hasResendKey,
        resendKeyPreview,
      },
    });
  }
});

export default router;
