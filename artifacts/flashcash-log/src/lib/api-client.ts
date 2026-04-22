const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* Rotas publicas que NAO devem disparar redirect ao receber 401. */
const PUBLIC_PATHS = ["/auth/login", "/auth/logout", "/auth/me", "/healthz"];

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (res.status === 401 && !PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    /* Sessao expirou. Volta para a tela de login (rota raiz) sem perder a URL atual. */
    if (typeof window !== "undefined" && window.location.pathname !== (BASE || "/")) {
      window.location.href = `${BASE}/`;
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
