/**
 * E-mail gerado automaticamente pelo OCR quando o cliente é criado
 * a partir do CNPJ extraído e ainda não tem e-mail real cadastrado.
 * Formato: pendente+<timestamp>@preencher.com
 */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return /^pendente\+\d+@preencher\.com$/i.test(email.trim());
}

/**
 * Retorna o e-mail para exibição na UI. Se for placeholder automático,
 * retorna null para que a UI mostre "—" ou mensagem amigável.
 */
export function displayEmail(email: string | null | undefined): string | null {
  if (!email || isPlaceholderEmail(email)) return null;
  return email;
}

export function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return "-";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateString));
  } catch (e) {
    return dateString;
  }
}
