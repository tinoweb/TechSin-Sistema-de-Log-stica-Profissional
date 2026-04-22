import { Link, useLocation } from "wouter";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Truck, Shield, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export default function Login() {
  const { user, loading, login } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /* Se ja esta autenticado, pula direto para o dashboard (ou super-admin). */
  useEffect(() => {
    if (!loading && user) {
      setLocation(user.role === "superadmin" ? "/super-admin" : "/dashboard");
    }
  }, [loading, user, setLocation]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSubmitting(true);
    try {
      await login(email.trim(), senha);
      /* Redirect acontece via useEffect quando o user for setado. */
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao entrar";
      /* A mensagem do backend vem como JSON; extraimos o "error" se houver. */
      try {
        const parsed = JSON.parse(msg);
        setErro(parsed.error ?? msg);
      } catch {
        setErro(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "hsl(0 0% 10%)" }}>
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between flex-1 p-12 border-r border-border" style={{ backgroundColor: "hsl(0 0% 12%)" }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded flex items-center justify-center text-[10px] font-black text-white"
            style={{ background: "linear-gradient(135deg, #1D4ED8, #2563EB)" }}
          >
            TS
          </div>
          <span className="font-bold text-base text-foreground">TechSin</span>
        </div>

        <div>
          <h1 className="text-4xl font-bold text-foreground leading-snug mb-4 tracking-tight">
            Controle total<br />
            da sua <span className="text-primary">operação logística.</span>
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed mb-10 max-w-md">
            Auditoria de canhotos, rastreamento GPS e faturamento automatizado para transportadoras. Simples, rápido e confiável.
          </p>

          <div className="grid grid-cols-3 gap-4 max-w-lg">
            {[
              { icon: Zap, label: "Auditoria Instantânea", sub: "OCR com IA em segundos" },
              { icon: Shield, label: "Prova de Entrega", sub: "Foto + GPS + timestamp" },
              { icon: Truck, label: "Gestão de Frota", sub: "Links diretos por motorista" },
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="p-4 rounded-lg border border-border bg-background">
                <Icon className="w-4 h-4 text-primary mb-2" />
                <div className="text-xs font-semibold text-foreground mb-0.5">{label}</div>
                <div className="text-[11px] text-muted-foreground">{sub}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          &copy; 2026 TechSin. Todos os direitos reservados.
        </p>
      </div>

      {/* Login panel */}
      <div className="flex-1 lg:max-w-md flex flex-col justify-center px-8 py-12">
        <div className="w-full max-w-sm mx-auto">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div
              className="w-7 h-7 rounded flex items-center justify-center text-[9px] font-black text-white"
              style={{ background: "linear-gradient(135deg, #1D4ED8, #2563EB)" }}
            >
              TS
            </div>
            <span className="font-bold text-sm text-foreground">TechSin</span>
          </div>

          <div className="mb-7">
            <h2 className="text-xl font-semibold text-foreground mb-1">Acesso ao Sistema</h2>
            <p className="text-sm text-muted-foreground">Insira suas credenciais corporativas para continuar.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 mb-6">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">E-mail corporativo</label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-card border border-border rounded px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                placeholder="voce@empresa.com.br"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">Senha</label>
              </div>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full bg-card border border-border rounded px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
              />
            </div>

            {erro && (
              <div className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded px-3 py-2">
                {erro}
              </div>
            )}

            <Button type="submit" disabled={submitting} className="w-full h-10 font-medium group text-sm">
              {submitting ? (
                <><Loader2 className="mr-2 w-4 h-4 animate-spin" /> Entrando...</>
              ) : (
                <>Entrar no Sistema <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border text-center">
            <p className="text-xs text-muted-foreground mb-3">Acesso para motoristas</p>
            <Link href="/motorista-app">
              <Button variant="outline" className="w-full h-9 text-xs border-border hover:bg-card">
                <Truck className="mr-2 w-3.5 h-3.5" />
                Acessar App do Motorista
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
