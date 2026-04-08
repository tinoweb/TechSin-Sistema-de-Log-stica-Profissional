import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ShieldCheck, Building2, Users, Truck, FileText, CheckCircle2,
  XCircle, Plus, RefreshCw, TrendingUp, Lock, Unlock, X, Globe
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Transportadora {
  id: number; nome: string; cnpj: string; email: string; telefone?: string;
  emailFinanceiro?: string; ativo: boolean; plano: string;
  totalMotoristasAtivos: number; totalViagens: number; canhotosDigitalizados: number;
  createdAt: string;
}
interface GlobalStats {
  totalTransportadoras: number; ativas: number; bloqueadas: number;
  totalMotoristas: number; totalViagens: number; totalCanhotos: number; canhotosValidados: number;
}
interface StatsResponse { transportadoras: Transportadora[]; global: GlobalStats; }

const PLAN_LABELS: Record<string, { label: string; cls: string }> = {
  starter: { label: "Starter", cls: "bg-white/5 text-muted-foreground border-border" },
  pro: { label: "Pro", cls: "bg-primary/10 text-primary border-primary/25" },
  enterprise: { label: "Enterprise", cls: "bg-amber-500/10 text-amber-400 border-amber-500/25" },
};

export default function SuperAdmin() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ nome: "", cnpj: "", email: "", emailFinanceiro: "", telefone: "", plano: "starter" });
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<StatsResponse>("/super-admin/stats");
      setData(d);
    } catch (e: any) {
      toast({ title: "Erro ao carregar dados", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const toggleStatus = async (id: number, nome: string, current: boolean) => {
    setToggling(id);
    try {
      await api.patch(`/super-admin/transportadoras/${id}/toggle`, {});
      await load();
      toast({ title: current ? `${nome} bloqueada` : `${nome} reativada` });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setToggling(null); }
  };

  const createTransportadora = async () => {
    if (!form.nome || !form.cnpj || !form.email) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" }); return;
    }
    setCreating(true);
    try {
      await api.post("/super-admin/transportadoras", form);
      await load();
      setShowCreate(false);
      setForm({ nome: "", cnpj: "", email: "", emailFinanceiro: "", telefone: "", plano: "starter" });
      toast({ title: "Transportadora cadastrada com sucesso!" });
    } catch (e: any) {
      toast({ title: "Erro ao cadastrar", description: e.message, variant: "destructive" });
    } finally { setCreating(false); }
  };

  const g = data?.global;
  const transportadoras = data?.transportadoras ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/15">
            <ShieldCheck className="w-4.5 h-4.5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">Painel Super Admin</h2>
            <p className="text-xs text-muted-foreground">Controle total de todas as transportadoras da plataforma.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs border-border" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button size="sm" className="h-8 text-xs font-semibold" style={{ background: "linear-gradient(135deg, #d97706, #f59e0b)" }} onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Nova Transportadora
          </Button>
        </div>
      </div>

      {/* Global KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: "Transportadoras", value: g?.totalTransportadoras ?? "—", sub: `${g?.ativas ?? 0} ativas · ${g?.bloqueadas ?? 0} bloqueadas`, icon: Building2, color: "text-amber-400" },
          { label: "Motoristas Cadastrados", value: g?.totalMotoristas ?? "—", sub: "Em toda a plataforma", icon: Users, color: "text-primary" },
          { label: "Total de Viagens", value: g?.totalViagens ?? "—", sub: "Histórico completo", icon: Truck, color: "text-foreground" },
          { label: "Canhotos Digitalizados", value: g?.totalCanhotos ?? "—", sub: `${g?.canhotosValidados ?? 0} validados pela IA`, icon: FileText, color: "text-success" },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-lg px-4 py-4">
            <div className="flex items-start justify-between mb-3">
              <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Transportadoras table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Globe className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-foreground">Transportadoras Cadastradas</h3>
          <span className="ml-auto text-[10px] text-muted-foreground">{transportadoras.length} empresas</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-muted-foreground">Carregando...</div>
        ) : transportadoras.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground">Nenhuma transportadora.</div>
        ) : (
          <div className="divide-y divide-border">
            {transportadoras.map((t) => {
              const planCfg = PLAN_LABELS[t.plano] ?? PLAN_LABELS.starter;
              return (
                <div key={t.id} className="px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-center hover:bg-white/3 transition-colors">
                  {/* Company info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{t.nome}</p>
                      <Badge variant="outline" className={`text-[9px] ${planCfg.cls}`}>{planCfg.label}</Badge>
                      {t.ativo ? (
                        <Badge variant="outline" className="text-[9px] bg-success/8 text-success border-success/25">
                          <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Ativa
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] bg-destructive/8 text-destructive border-destructive/25">
                          <XCircle className="w-2.5 h-2.5 mr-1" /> Bloqueada
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                      <span className="text-[10px] text-muted-foreground font-mono">{t.cnpj}</span>
                      <span className="text-[10px] text-muted-foreground">{t.email}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-[10px]">
                      <span className="text-muted-foreground"><span className="text-foreground font-medium">{t.totalMotoristasAtivos}</span> motoristas</span>
                      <span className="text-muted-foreground"><span className="text-foreground font-medium">{t.totalViagens}</span> viagens</span>
                      <span className="text-success font-medium"><span>{t.canhotosDigitalizados}</span> canhotos</span>
                    </div>
                  </div>

                  {/* Magic link preview */}
                  <div className="hidden xl:block shrink-0 text-[10px] text-muted-foreground text-right">
                    <div className="font-mono">/drive/tok-{t.id}-•••</div>
                    <div className="text-[9px]">Magic Link ativo</div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className={`h-8 text-xs ${t.ativo ? "border-destructive/30 text-destructive hover:bg-destructive/8" : "border-success/30 text-success hover:bg-success/8"}`}
                      disabled={toggling === t.id}
                      onClick={() => toggleStatus(t.id, t.nome, t.ativo)}
                    >
                      {toggling === t.id ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : t.ativo ? (
                        <><Lock className="w-3 h-3 mr-1.5" /> Bloquear</>
                      ) : (
                        <><Unlock className="w-3 h-3 mr-1.5" /> Reativar</>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Cadastrar Nova Transportadora</h3>
              <button onClick={() => setShowCreate(false)} className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/8">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3.5">
              {[
                { key: "nome", label: "Nome da Empresa *", placeholder: "Flash Transportes LTDA" },
                { key: "cnpj", label: "CNPJ *", placeholder: "00.000.000/0001-00" },
                { key: "email", label: "E-mail *", placeholder: "contato@empresa.com.br" },
                { key: "emailFinanceiro", label: "E-mail Financeiro", placeholder: "financeiro@empresa.com.br" },
                { key: "telefone", label: "Telefone", placeholder: "(11) 9xxxx-xxxx" },
              ].map(({ key, label, placeholder }) => (
                <div key={key} className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
                  <Input
                    className="h-9 text-sm bg-background border-border"
                    placeholder={placeholder}
                    value={(form as any)[key]}
                    onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Plano</Label>
                <select
                  className="w-full h-9 text-sm bg-background border border-border rounded px-3 text-foreground"
                  value={form.plano}
                  onChange={e => setForm(p => ({ ...p, plano: e.target.value }))}
                >
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <Button variant="outline" className="flex-1 h-9 text-sm" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button className="flex-1 h-9 text-sm font-semibold" style={{ background: "linear-gradient(135deg, #d97706, #f59e0b)" }} onClick={createTransportadora} disabled={creating}>
                {creating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <><Plus className="w-3.5 h-3.5 mr-1.5" /> Cadastrar</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
