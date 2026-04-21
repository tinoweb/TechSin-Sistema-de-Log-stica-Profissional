import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Search, RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle,
  MapPin, Camera, FileText, ShieldCheck, Filter, X, Pencil, Check, Loader2
} from "lucide-react";
import { formatCurrency, displayEmail, isPlaceholderEmail } from "@/lib/format";

interface Canhoto {
  id: number; viagemId: number;
  fotoUrl?: string; numeroNF?: string; cnpjCliente?: string;
  latitude?: number; longitude?: number; iaConfidencia?: number;
  valorDetectado?: number; valorFrete?: number; sealId?: string;
  assinaturaDetectada?: boolean; status: string; observacoes?: string;
  timestamp?: string; createdAt?: string;
  clienteId?: number | null;
  clienteNome?: string; clienteEmail?: string; motoristaNome?: string;
  origem?: string; destino?: string;
  fraudAlert?: boolean; fraudDistanciaMetros?: number;
}

function OSMPin({ lat, lon }: { lat: number; lon: number }) {
  const d = 0.005;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - d},${lat - d},${lon + d},${lat + d}&layer=mapnik&marker=${lat},${lon}`;
  return <iframe src={src} className="w-full h-full rounded border border-border" title="GPS" loading="lazy" />;
}

function StatusChip({ status, fraud }: { status: string; fraud?: boolean }) {
  if (fraud) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
      <AlertTriangle className="w-2.5 h-2.5" /> Alerta de Fraude
    </span>
  );
  if (status === "validado") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-success/10 text-success border border-success/20">
      <CheckCircle2 className="w-2.5 h-2.5" /> Auditado
    </span>
  );
  if (status === "rejeitado") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-destructive/10 text-destructive border border-destructive/20">
      <XCircle className="w-2.5 h-2.5" /> Rejeitado
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
      <Clock className="w-2.5 h-2.5" /> Pendente
    </span>
  );
}

export default function Arquivo() {
  const [canhotos, setCanhotos] = useState<Canhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selected, setSelected] = useState<Canhoto | null>(null);

  // Estado para edição inline do e-mail de faturamento
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const startEditEmail = () => {
    // Se for placeholder automatico, comeca com campo vazio para o admin preencher
    setEmailDraft(displayEmail(selected?.clienteEmail) ?? "");
    setEditingEmail(true);
  };

  const cancelEditEmail = () => {
    setEditingEmail(false);
    setEmailDraft("");
  };

  const saveEmail = async () => {
    if (!selected?.clienteId) {
      alert("Este registro não tem cliente vinculado. Associe um cliente antes de editar o e-mail.");
      return;
    }
    const trimmed = emailDraft.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      alert("E-mail inválido.");
      return;
    }
    try {
      setSavingEmail(true);
      // Se cliente ainda tem email geral como placeholder, atualiza ambos
      // (emailFinanceiro + email) para limpar o "pendente" da lista de clientes.
      const payload: Record<string, string> = { emailFinanceiro: trimmed };
      if (isPlaceholderEmail(selected.clienteEmail)) {
        payload.email = trimmed;
      }
      await api.patch(`/clientes/${selected.clienteId}`, payload);
      setSelected({ ...selected, clienteEmail: trimmed });
      setCanhotos(prev => prev.map(c => c.clienteId === selected.clienteId ? { ...c, clienteEmail: trimmed } : c));
      setEditingEmail(false);
    } catch (err) {
      alert("Erro ao salvar. Tente novamente.");
    } finally {
      setSavingEmail(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Canhoto[]>("/canhotos?transportadoraId=1");
      setCanhotos(data.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Reseta edição inline quando admin seleciona outro canhoto na fila
  useEffect(() => {
    setEditingEmail(false);
    setEmailDraft("");
  }, [selected?.id]);

  // Filtro opcional por clienteId vindo de outra tela (ex: pagina de Clientes)
  const clienteIdFilter = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("clienteId")
    : null;

  const filtered = canhotos.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (c.numeroNF ?? "").toLowerCase().includes(q) ||
      (c.clienteNome ?? "").toLowerCase().includes(q) ||
      (c.motoristaNome ?? "").toLowerCase().includes(q) ||
      (c.cnpjCliente ?? "").toLowerCase().includes(q) ||
      (c.sealId ?? "").toLowerCase().includes(q) ||
      (c.createdAt ?? "").includes(q);
    const matchStatus = filterStatus === "all" || c.status === filterStatus || (filterStatus === "fraude" && c.fraudAlert);
    const matchCliente = !clienteIdFilter || String(c.clienteId) === clienteIdFilter;
    return matchSearch && matchStatus && matchCliente;
  });

  const stats = {
    total: canhotos.length,
    auditados: canhotos.filter(c => c.status === "validado").length,
    pendentes: canhotos.filter(c => c.status === "pendente").length,
    fraudes: canhotos.filter(c => c.fraudAlert).length,
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Arquivo de Operações</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Histórico completo de auditoria · Busca por NF, cliente ou data</p>
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs border-border" onClick={load} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total de Operações", value: stats.total, color: "text-foreground" },
          { label: "Notas Auditadas", value: stats.auditados, color: "text-success" },
          { label: "Aguardando Conferência", value: stats.pendentes, color: "text-amber-400" },
          { label: "Alertas de Fraude", value: stats.fraudes, color: "text-red-400" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
            <p className={`text-2xl font-black tabular-nums mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por NF, cliente, motorista, data..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-8 text-xs bg-background border-border"
          />
          {search && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {[
            { key: "all", label: "Todos" },
            { key: "validado", label: "Auditados" },
            { key: "pendente", label: "Pendentes" },
            { key: "rejeitado", label: "Rejeitados" },
            { key: "fraude", label: "Fraude" },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilterStatus(f.key)}
              className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                filterStatus === f.key
                  ? "bg-primary text-white"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-white/20"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground ml-auto">{filtered.length} registros</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* List */}
        <div className="xl:col-span-2 space-y-2 max-h-[calc(100vh-280px)] overflow-auto pr-1">
          {loading ? (
            <div className="bg-card border border-border rounded-lg py-10 text-center text-xs text-muted-foreground">Carregando arquivo...</div>
          ) : filtered.length === 0 ? (
            <div className="bg-card border border-border rounded-lg py-12 text-center">
              <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum registro encontrado.</p>
            </div>
          ) : filtered.map(c => (
            <div
              key={c.id}
              className={`bg-card border rounded-lg px-4 py-3 cursor-pointer transition-all duration-150 ${
                c.fraudAlert ? "border-red-500/30" :
                selected?.id === c.id ? "border-primary/50" : "border-border hover:border-white/20"
              }`}
              onClick={() => setSelected(c.id === selected?.id ? null : c)}
            >
              {c.fraudAlert && (
                <div className="flex items-center gap-1 text-[9px] text-red-400 mb-1.5 font-medium">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  ALERTA DE FRAUDE — {c.fraudDistanciaMetros ?? "?"}m do endereço
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-mono font-bold text-foreground truncate">{c.numeroNF ?? `Canhoto #${c.id}`}</p>
                <StatusChip status={c.status} fraud={c.fraudAlert} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 truncate">{c.clienteNome ?? "—"} · {c.motoristaNome ?? "—"}</p>
              <div className="flex items-center justify-between mt-1.5">
                {c.valorFrete ? <p className="text-[10px] font-semibold text-success">{formatCurrency(c.valorFrete)}</p> : <span />}
                <p className="text-[10px] font-mono text-muted-foreground">
                  {c.createdAt ? new Date(c.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {selected ? (
          <div className="xl:col-span-3 bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Registro Completo</h3>
                <span className="text-xs font-mono text-muted-foreground">{selected.numeroNF}</span>
              </div>
              <button onClick={() => setSelected(null)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/8">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-auto max-h-[calc(100vh-240px)]">
              {selected.fraudAlert && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-red-500/30" style={{ backgroundColor: "rgba(239,68,68,0.07)" }}>
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-red-300">Alerta de Divergência de GPS</p>
                    <p className="text-[10px] text-red-400/80 mt-0.5">
                      Motorista estava a <strong>{selected.fraudDistanciaMetros ?? "?"}m</strong> do endereço de entrega (limite: 500m).
                    </p>
                  </div>
                </div>
              )}

              {/* Photo + Map */}
              <div className="grid grid-cols-2 gap-3 h-44">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Camera className="w-2.5 h-2.5 text-success" /> Foto do Canhoto
                  </p>
                  {selected.fotoUrl ? (
                    <img
                      src={selected.fotoUrl}
                      alt="Canhoto"
                      className="w-full h-36 object-cover rounded border border-border"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="h-36 rounded border border-border bg-background flex items-center justify-center">
                      <p className="text-[10px] text-muted-foreground">Sem foto</p>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                    <MapPin className="w-2.5 h-2.5 text-primary" /> GPS da Entrega
                  </p>
                  {selected.latitude && selected.longitude ? (
                    <div className="h-36">
                      <OSMPin lat={selected.latitude} lon={selected.longitude} />
                    </div>
                  ) : (
                    <div className="h-36 rounded border border-border bg-background flex items-center justify-center">
                      <p className="text-[10px] text-muted-foreground">GPS não disponível</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Data table */}
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <tbody>
                    {/* Linha especial: E-mail Faturamento com edição inline */}
                    <tr className="bg-background/40">
                      <td className="px-3 py-2 text-muted-foreground w-44 shrink-0">E-mail Faturamento</td>
                      <td className="px-3 py-2 text-foreground">
                        {editingEmail ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="email"
                              value={emailDraft}
                              onChange={(e) => setEmailDraft(e.target.value)}
                              className="h-7 text-xs flex-1"
                              placeholder="financeiro@cliente.com"
                              disabled={savingEmail}
                              autoFocus
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 w-7 p-0 border-success/30 text-success"
                              onClick={saveEmail}
                              disabled={savingEmail}
                              aria-label="Salvar e-mail"
                            >
                              {savingEmail ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 w-7 p-0 border-border"
                              onClick={cancelEditEmail}
                              disabled={savingEmail}
                              aria-label="Cancelar"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className={`flex-1 ${displayEmail(selected.clienteEmail) ? "" : "text-amber-400 italic"}`}>
                              {displayEmail(selected.clienteEmail) ?? "— clique no lápis para preencher"}
                            </span>
                            <button
                              type="button"
                              onClick={startEditEmail}
                              className="p-1 rounded hover:bg-white/5 text-muted-foreground hover:text-primary transition-colors"
                              aria-label="Editar e-mail"
                              title="Editar e-mail de faturamento"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {[
                      ["Nota Fiscal", selected.numeroNF ?? "—"],
                      ["Cliente", selected.clienteNome ?? "—"],
                      ["CNPJ Cliente", selected.cnpjCliente ?? "—"],
                      ["Motorista", selected.motoristaNome ?? "—"],
                      ["Valor do Frete", selected.valorFrete ? formatCurrency(selected.valorFrete) : "—"],
                      ["Origem", selected.origem ?? "—"],
                      ["Destino", selected.destino ?? "—"],
                      ["GPS", selected.latitude ? `${selected.latitude.toFixed(5)}, ${selected.longitude?.toFixed(5)}` : "—"],
                      ["Assinatura Detectada", selected.assinaturaDetectada ? "✓ Sim" : "✗ Não"],
                      ["Confiança IA", selected.iaConfidencia != null ? `${(selected.iaConfidencia * 100).toFixed(0)}%` : "—"],
                      ["Data/Hora", selected.createdAt ? new Date(selected.createdAt).toLocaleString("pt-BR") : "—"],
                      ["Status", selected.status],
                    ].map(([label, value], i) => (
                      <tr key={label} className={i % 2 === 0 ? "bg-background/40" : ""}>
                        <td className="px-3 py-2 text-muted-foreground w-44 shrink-0">{label}</td>
                        <td className="px-3 py-2 text-foreground font-mono">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Seal */}
              {selected.sealId && (
                <div className="flex items-center gap-2 px-3 py-2 rounded bg-success/5 border border-success/15">
                  <ShieldCheck className="w-3.5 h-3.5 text-success shrink-0" />
                  <span className="text-[10px] font-mono text-success">{selected.sealId}</span>
                  <span className="text-[10px] text-success/60 ml-1">— Selo de Autenticidade Digital TechSin</span>
                </div>
              )}

              {selected.observacoes && (
                <div className="px-3 py-2 rounded bg-background/40 border border-border">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Observações</p>
                  <p className="text-xs text-foreground">{selected.observacoes}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="xl:col-span-3 bg-card border border-border rounded-lg flex items-center justify-center py-20">
            <div className="text-center">
              <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Selecione um registro para ver os detalhes completos</p>
              <p className="text-[10px] text-muted-foreground mt-1">Foto do canhoto · Mapa GPS · XML original · Status de auditoria</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
