import { logger } from "../lib/logger";

export interface EmailPayload {
  to: string;
  clienteNome: string;
  numeroNF: string;
  valorFrete: number;
  destino?: string;
  sealId?: string;
  /* Nome comercial da transportadora (nosso cliente SaaS) exibido como remetente
   * do e-mail para o cliente final. Ex: "JMega Embalagens". Obrigatório para
   * o white-label funcionar — se ausente, cai no fallback histórico. */
  transportadoraNome?: string;
}

const RESEND_KEY = process.env["RESEND_API_KEY"];
/* Endereço técnico usado no campo From: (compartilhado por todas as
 * transportadoras; o que muda é o display name antes do "<>").
 * Ex: cobranca@techsin.site. O Resend exige domínio verificado. */
const EMAIL_FROM_ADDRESS = process.env["EMAIL_FROM_ADDRESS"] ?? "onboarding@resend.dev";
/* Fallback para quando a transportadora não foi passada (compat histórica). */
const FALLBACK_BRAND = process.env["EMAIL_FALLBACK_BRAND"] ?? "TechSin";

export async function sendBillingEmail(payload: EmailPayload): Promise<{ sent: boolean; preview: string }> {
  const brand = payload.transportadoraNome?.trim() || FALLBACK_BRAND;
  const from    = `${brand} <${EMAIL_FROM_ADDRESS}>`;
  const subject = `Faturamento ${brand} – NF ${payload.numeroNF}`;
  const body    = buildEmailBody(payload, brand);

  if (RESEND_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [payload.to], subject, html: body }),
      });
      if (res.ok) {
        logger.info({ to: payload.to, nf: payload.numeroNF, from, subject }, "email: enviado via Resend");
        return { sent: true, preview: body };
      }
      const err = await res.text();
      logger.warn({ err, to: payload.to, from, status: res.status }, "email: falha Resend — registrado como pendente");
    } catch (err) {
      logger.warn({ err }, "email: erro de rede ao enviar");
    }
  } else {
    logger.info({ to: payload.to, nf: payload.numeroNF, brand }, "email: RESEND_API_KEY não configurada — e-mail registrado sem envio");
  }

  return { sent: false, preview: body };
}

function buildEmailBody(p: EmailPayload, brand: string): string {
  const valor = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.valorFrete);
  const year = new Date().getFullYear();
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f4f6f9;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <div style="background:linear-gradient(135deg,#1D4ED8,#2563EB);padding:24px">
    <h1 style="color:#fff;margin:0;font-size:20px">${brand}</h1>
    <p style="color:#93C5FD;margin:4px 0 0;font-size:13px">Faturamento</p>
  </div>
  <div style="padding:24px">
    <p style="color:#374151;font-size:14px">Olá, <strong>${p.clienteNome}</strong>,</p>
    <p style="color:#374151;font-size:14px">A entrega referente à <strong>NF ${p.numeroNF}</strong> foi concluída e aprovada. Segue o resumo para faturamento:</p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="color:#6b7280;font-size:13px">Nota Fiscal</span>
        <strong style="color:#111827;font-size:13px">${p.numeroNF}</strong>
      </div>
      ${p.destino ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#6b7280;font-size:13px">Destino</span><strong style="color:#111827;font-size:13px">${p.destino}</strong></div>` : ""}
      <div style="display:flex;justify-content:space-between">
        <span style="color:#6b7280;font-size:13px">Valor</span>
        <strong style="color:#16a34a;font-size:15px">${valor}</strong>
      </div>
    </div>
    ${p.sealId ? `<p style="color:#6b7280;font-size:11px">Selo digital: ${p.sealId}</p>` : ""}
    <p style="color:#374151;font-size:13px">Em caso de dúvidas, entre em contato com a <strong>${brand}</strong>.</p>
  </div>
  <div style="background:#f9fafb;padding:12px 24px;text-align:center">
    <p style="color:#9ca3af;font-size:11px;margin:0">${brand} © ${year}</p>
  </div>
</div></body></html>`;
}
