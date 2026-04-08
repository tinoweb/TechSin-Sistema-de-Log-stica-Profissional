import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Cell as PieCell,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Wallet, Truck, FileCheck2, Send, TrendingUp, TrendingDown,
  Activity, Clock, CheckCircle2, AlertCircle, X, MapPin,
  Zap, Mail, Shield, Timer, DollarSign, AlertTriangle,
  Plus, Link2, Package
} from "lucide-react";
import { useLocation } from "wouter";
import { useFlashStore } from "@/lib/flash-store";
import { useToast } from "@/hooks/use-toast";

type ModalState = "none" | "faturamento" | "map";

function OSMMapFrame({ lat, lon, height = 240 }: { lat: number; lon: number; height?: number }) {
  const d = 0.006;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - d},${lat - d},${lon + d},${lat + d}&layer=mapnik&marker=${lat},${lon}`;
  return (
    <iframe src={src} width="100%" height={height} className="w-full rounded border border-border" title="Mapa" loading="lazy" />
  );
}

const SPEED_DATA = [
  { name: "Processo Tradicional", dias: 12, label: "12 dias", fill: "#404040" },
  { name: "TechSin", dias: 0.35, label: "15 min", fill: "#1D4ED8" },
];

const CLIENT_EMAILS: Record<string, string> = {
  "Mercado Livre Brasil": "financeiro@mercadolivre.com.br",
  "Amazon Servicos de Varejo": "nfe@amazon.com.br",
  "Magazine Luiza SA": "fiscal@magazineluiza.com.br",
  "Entrega via App Motorista": "financeiro@cliente.com.br",
};

export default function Dashboard() {
  const [, navigate] = useLocation();

  const [summary, setSummary] = useState<any>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [activity, setActivity] = useState<any[]>([]);

  const loadSummary = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([
        api.get<any>("/dashboard/summary?transportadoraId=1"),
        api.get<any[]>("/dashboard/recent-activity?transportadoraId=1").catch(() => []),
      ]);
      setSummary(s);
      setActivity(Array.isArray(a) ? a : []);
    } catch { /* keep previous data */ }
    finally { setIsLoadingSummary(false); }
  }, []);

  useEffect(() => {
    loadSummary();
    const interval = setInterval(loadSummary, 30_000);
    return () => clearInterval(interval);
  }, [loadSummary]);

  const { entregasRecentes, enviosLog, lastCanhotoNF, dispararFaturamento } = useFlashStore();
  const { toast } = useToast();

  const [modal, setModal] = useState<ModalState>("none");
  const [selectedEntregaId, setSelectedEntregaId] = useState<string | null>(null);
  const [mapEntregaId, setMapEntregaId] = useState<string | null>(null);
  const [faturamentoStep, setFaturamentoStep] = useState<"confirm" | "sending" | "done">("confirm");
  const [sendProgress, setSendProgress] = useState(0);
  const [newCanhotoAlert, setNewCanhotoAlert] = useState<string | null>(null);
  const prevNF = useRef<string | null>(null);

  useEffect(() => {
    if (lastCanhotoNF && lastCanhotoNF !== prevNF.current) {
      prevNF.current = lastCanhotoNF;
      setNewCanhotoAlert(lastCanhotoNF);
      setTimeout(() => setNewCanhotoAlert(null), 7000);
    }
  }, [lastCanhotoNF]);

  const selectedEntrega = selectedEntregaId ? entregasRecentes.find(e => e.id === selectedEntregaId) : null;
  const mapEntrega = mapEntregaId ? entregasRecentes.find(e => e.id === mapEntregaId) : null;

  const openFaturamento = (entregaId: string) => {
    setSelectedEntregaId(entregaId);
    setFaturamentoStep("confirm");
    setSendProgress(0);
    setModal("faturamento");
  };

  const confirmarFaturamento = () => {
    if (!selectedEntregaId) return;
    setFaturamentoStep("sending");
    setSendProgress(0);
    let prog = 0;
    const iv = setInterval(() => {
      prog += Math.random() * 18 + 8;
      if (prog >= 100) {
        prog = 100;
        clearInterval(iv);
        setTimeout(() => {
          setFaturamentoStep("done");
          dispararFaturamento(selectedEntregaId);
          setTimeout(() => {
            setModal("none");
            toast({ title: "Faturamento Expresso disparado!", description: `E-mail enviado com comprovante auditado.` });
          }, 1800);
        }, 300);
      }
      setSendProgress(Math.min(prog, 100));
    }, 150);
  };

  const totalValidados = entregasRecentes.filter(e => e.status === "validado_ia").length;
  const totalFaturados = entregasRecentes.filter(e => e.status === "faturado").length;
  const totalAnaliseManual = entregasRecentes.filter(e => e.status === "analise_manual").length;

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Alert banner */}
      {newCanhotoAlert && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-success/30 bg-success/8 animate-in slide-in-from-top-2 duration-300">
          <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
          <p className="text-sm flex-1">
            <span className="font-semibold text-success">Novo canhoto auditado!</span>{" "}
            Nota <span className="font-mono text-success">{newCanhotoAlert}</span> — GPS registrado. Pronto para conferência.
          </p>
          <button onClick={() => setNewCanhotoAlert(null)}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
        </div>
      )}

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Painel de Controle</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Visão geral das operações em tempo real</p>
        </div>
        {/* Quick Action Bar */}
        <div className="flex items-center gap-2">
          <Button
            className="h-9 px-4 text-sm font-semibold gap-2"
            style={{ background: "linear-gradient(135deg, #1D4ED8, #2563EB)" }}
            onClick={() => navigate("/xml")}
          >
            <Plus className="w-4 h-4" /> Novo Frete
          </Button>
          <Button
            variant="outline"
            className="h-9 px-4 text-sm border-border gap-2 hover:border-white/30"
            onClick={() => navigate("/motoristas")}
          >
            <Link2 className="w-4 h-4" /> Enviar Link
          </Button>
        </div>
      </div>

      {/* Fraud alert (if any) */}
      {!isLoadingSummary && (summary as any)?.fraudAlerts > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-red-500/30" style={{ background: "rgba(239,68,68,0.06)" }}>
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-sm flex-1">
            <span className="font-semibold text-red-300">{(summary as any).fraudAlerts} alerta{(summary as any).fraudAlerts > 1 ? "s" : ""} de divergência de GPS</span>
            {" — "}<span className="text-muted-foreground text-xs">verifique a Fila de Conferência</span>
          </p>
        </div>
      )}

      {/* 🟡 Análise Manual alert — entregas com comprovantes divergentes aguardando revisão */}
      {totalAnaliseManual > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-500/35 animate-in slide-in-from-top-2 duration-300" style={{ background: "rgba(245,158,11,0.08)" }}>
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-sm flex-1">
            <span className="font-semibold text-amber-300">
              {totalAnaliseManual} comprovante{totalAnaliseManual > 1 ? "s" : ""} aguardam análise manual
            </span>
            {" — "}<span className="text-muted-foreground text-xs">verifique as imagens antes de liberar o faturamento</span>
          </p>
        </div>
      )}

      {/* Operational Status Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          title="Faturamento Previsto"
          value={summary?.valorPrevisto != null ? formatCurrency(summary.valorPrevisto) : "—"}
          subtext={`${summary?.totalViagens ?? 0} notas no pipeline`}
          icon={Wallet}
          trend={0}
          accent="primary"
          isLoading={isLoadingSummary}
        />
        <KpiCard
          title="NFs Aguardando Canhoto"
          value={String(summary?.viagensPendentes ?? 0)}
          subtext={`${summary?.xmlsPendentes ?? 0} uploads pendentes`}
          icon={Package}
          trend={0}
          accent="primary"
          isLoading={isLoadingSummary}
        />
        <KpiCard
          title="Entregas Concluídas"
          value={String(summary?.canhotosValidados ?? 0)}
          subtext={formatCurrency(summary?.valorValidado ?? 0)}
          icon={CheckCircle2}
          trend={0}
          accent="success"
          isLoading={isLoadingSummary}
        />
        <KpiCard
          title="Faturado no Período"
          value={summary?.valorFaturado != null ? formatCurrency(summary.valorFaturado) : "—"}
          subtext={`${summary?.faturasEmAberto ?? 0} faturas em aberto`}
          icon={Send}
          trend={0}
          accent="neutral"
          isLoading={isLoadingSummary}
        />
      </div>

      {/* Notas Auditadas vs Pendentes chart */}
      {!isLoadingSummary && summary && (
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Notas Auditadas vs Pendentes</h3>
          </div>
          <p className="text-[11px] text-muted-foreground mb-4">Situação atual do pipeline de faturamento</p>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-center">
            {/* Donut chart */}
            <div className="flex justify-center">
              <div className="relative w-36 h-36">
                <PieChart width={144} height={144}>
                  <Pie
                    data={[
                      { name: "Auditadas", value: summary.canhotosValidados ?? 0, fill: "#4ADE80" },
                      { name: "Pendentes", value: (summary.totalViagens ?? 0) - (summary.canhotosValidados ?? 0), fill: "#3C82F6" },
                    ]}
                    cx={72} cy={72} innerRadius={46} outerRadius={68}
                    dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}
                  >
                    <PieCell fill="#4ADE80" />
                    <PieCell fill="#3C82F6" />
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-xl font-black text-foreground tabular-nums leading-none">
                    {summary.canhotosValidados ?? 0}
                  </p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">auditadas</p>
                </div>
              </div>
            </div>
            {/* Legend + values */}
            <div className="xl:col-span-2 space-y-3">
              {[
                { label: "Notas Auditadas", value: summary.canhotosValidados ?? 0, color: "#4ADE80", sub: `${formatCurrency(summary.valorValidado)}` },
                { label: "Aguardando Canhoto", value: (summary.totalViagens ?? 0) - (summary.canhotosValidados ?? 0), color: "#3C82F6", sub: `${formatCurrency(summary.valorEmTransito)} em trânsito` },
              ].map(item => {
                const total = summary.totalViagens ?? 1;
                const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                return (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-xs text-foreground">{item.label}</span>
                      </div>
                      <span className="text-xs font-mono font-bold tabular-nums" style={{ color: item.color }}>{item.value} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden bg-white/6">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{item.sub}</p>
                  </div>
                );
              })}
              <div className="pt-1 border-t border-border flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Total de notas registradas</span>
                <span className="text-sm font-black text-foreground tabular-nums">{summary.totalViagens ?? 0}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Speed chart + activity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Speed comparison */}
        <div className="xl:col-span-2 bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-1">
            <Timer className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Tempo Médio de Faturamento</h3>
          </div>
          <p className="text-[11px] text-muted-foreground mb-5">Da entrega ao e-mail de cobrança — comparativo real</p>

          {/* Visual comparison cards */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="rounded-lg border border-border p-5 text-center" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
              <div className="text-3xl mb-1">⏳</div>
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Processo Tradicional</p>
              <p className="text-4xl font-black text-foreground/50 tabular-nums leading-none">12</p>
              <p className="text-sm text-muted-foreground mt-1">dias úteis</p>
              <div className="mt-3 text-[10px] text-muted-foreground space-y-1">
                <div>1. Canhoto em papel perdido</div>
                <div>2. Digitar NF manualmente</div>
                <div>3. Cobrar por WhatsApp</div>
              </div>
            </div>
            <div className="rounded-lg border border-primary/30 p-5 text-center relative overflow-hidden" style={{ backgroundColor: "rgba(60,130,246,0.08)" }}>
              <div className="absolute top-2 right-2">
                <Badge className="bg-primary/20 text-primary border-primary/30 text-[9px]">TechSin</Badge>
              </div>
              <div className="text-3xl mb-1">⚡</div>
              <p className="text-xs text-primary mb-2 uppercase tracking-wider font-semibold">Com TechSin</p>
              <p className="text-4xl font-black text-primary tabular-nums leading-none">15</p>
              <p className="text-sm text-primary/80 mt-1">minutos</p>
              <div className="mt-3 text-[10px] text-primary/60 space-y-1">
                <div>1. Foto → IA valida</div>
                <div>2. GPS sela a entrega</div>
                <div>3. E-mail automático</div>
              </div>
            </div>
          </div>

          {/* Bar chart */}
          <div className="h-28 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={SPEED_DATA} layout="vertical" margin={{ left: 0, right: 40, top: 0, bottom: 0 }}>
                <XAxis type="number" hide domain={[0, 13]} />
                <YAxis type="category" dataKey="name" width={0} hide />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: "hsl(0 0% 15%)", borderColor: "hsl(0 0% 22%)", borderRadius: 6, fontSize: 11 }}
                  formatter={(_v: number, _n: string, props: any) => [props.payload.label, "Tempo"]}
                />
                <Bar dataKey="dias" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 11, fill: "#aaa", formatter: (v: any, entry: any) => entry?.payload?.label ?? "" }}>
                  {SPEED_DATA.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Redução de tempo com TechSin</div>
            <div className="text-sm font-bold text-success">99,9% mais rapido</div>
          </div>
        </div>

        {/* Activity feed */}
        <div className="bg-card border border-border rounded-lg p-5 flex flex-col">
          <h3 className="text-sm font-semibold text-foreground mb-3">Radar de Eventos</h3>
          <div className="flex-1 overflow-auto space-y-2 pr-1">
            {activity && activity.length > 0 ? (
              activity.slice(0, 8).map((item) => (
                <div key={item.id} className="flex gap-3 items-start p-2.5 rounded hover:bg-white/4 transition-colors">
                  <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${item.tipo === "canhoto_validado" ? "bg-success" : item.tipo === "antecipacao" ? "bg-primary" : "bg-muted-foreground/40"}`} />
                  <div className="min-w-0">
                    <p className="text-xs text-foreground leading-snug">{item.descricao}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {new Date(item.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {item.valor != null && <span className="text-[10px] font-mono text-primary">{formatCurrency(item.valor)}</span>}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-6">Sem atividades.</p>
            )}
          </div>
        </div>
      </div>

      {/* Entregas Recentes */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Entregas Recentes</h3>
          <span className="text-[10px] text-muted-foreground">{entregasRecentes.length} registros</span>
        </div>
        <div className="divide-y divide-border">
          {entregasRecentes.length === 0 ? (
            <div className="py-8 text-center">
              <AlertCircle className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Nenhuma entrega registrada.</p>
            </div>
          ) : (
            entregasRecentes.slice(0, 8).map((e) => {
              const isAnalise = e.status === "analise_manual";
              return (
                <div
                  key={e.id}
                  className="hover:bg-white/3 transition-colors"
                >
                  {/* 🟡 Amber warning row for análise manual */}
                  {isAnalise && (
                    <div className="flex items-center gap-2 px-5 pt-2.5 pb-0">
                      <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                      <p className="text-[10px] text-amber-400/90 font-medium">Comprovante divergente — verifique a imagem antes de aprovar</p>
                    </div>
                  )}
                  <div
                    className={`flex items-center gap-3 px-5 py-3 ${isAnalise ? "border-l-2 border-amber-500/50" : ""}`}
                    style={isAnalise ? { backgroundColor: "rgba(245,158,11,0.04)" } : {}}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono font-medium text-foreground truncate">{e.nf}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{e.cliente}</p>
                    </div>
                    <p className="text-xs font-mono font-semibold text-foreground shrink-0">{formatCurrency(e.valor)}</p>
                    <EntregaStatusBadge status={e.status} />

                    {/* Map icon */}
                    <button
                      title="Ver mapa de entrega"
                      className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/8 transition-colors shrink-0"
                      onClick={() => { setMapEntregaId(e.id); setModal("map"); }}
                    >
                      <MapPin className="w-3.5 h-3.5 text-primary" />
                    </button>

                    {/* 🟢 Faturar — only for standard canhoto validado */}
                    {e.status === "validado_ia" && (
                      <Button
                        size="sm"
                        className="h-7 text-[10px] px-2 shrink-0"
                        style={{ background: "linear-gradient(135deg, #2563EB, #3C82F6)" }}
                        onClick={() => openFaturamento(e.id)}
                      >
                        <Send className="w-3 h-3 mr-1" /> Faturar
                      </Button>
                    )}

                    {/* 🟡 Análise manual — show review prompt instead of Faturar */}
                    {isAnalise && (
                      <button
                        title="Ver imagem do comprovante"
                        className="h-7 px-2 text-[10px] shrink-0 rounded border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors"
                        onClick={() => { setMapEntregaId(e.id); setModal("map"); }}
                      >
                        Ver imagem
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Log de Envios */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Log de Envios — Faturamento Expresso</h3>
          <Badge className="ml-auto text-[10px] bg-success/10 text-success border-success/25">Automatizado</Badge>
        </div>
        {enviosLog.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-xs text-muted-foreground">Nenhum e-mail disparado ainda. Clique em "Faturar" em uma entrega validada.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {enviosLog.slice(0, 6).map((log) => (
              <div key={log.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-6 h-6 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground">
                    Enviado para <span className="font-mono text-primary">{log.clienteEmail}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {log.nf} · {log.clienteNome} · {formatCurrency(log.valor)}
                  </p>
                </div>
                <div className="text-[10px] font-mono text-success shrink-0">Confirmado às {log.confirmedAt}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ FATURAMENTO EXPRESSO MODAL ═══ */}
      {modal === "faturamento" && selectedEntrega && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
          <div className="bg-card border border-border rounded-xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
            {faturamentoStep === "confirm" && (
              <>
                <div className="px-6 py-5 border-b border-border">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/10">
                      <Send className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">Disparar Faturamento Expresso</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">Envio automático de comprovante auditado + instrucoes de pagamento.</p>
                </div>
                <div className="px-6 py-5 space-y-4">
                  <div className="rounded-lg border border-border p-4 space-y-3" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Nota Fiscal</span>
                      <span className="text-xs font-mono text-foreground">{selectedEntrega.nf}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Cliente</span>
                      <span className="text-xs font-medium text-foreground">{selectedEntrega.cliente}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">E-mail Destino</span>
                      <span className="text-xs font-mono text-primary truncate max-w-[160px]">{selectedEntrega.email}</span>
                    </div>
                    <div className="pt-3 border-t border-border flex justify-between">
                      <span className="text-xs font-semibold text-foreground">Valor do Frete</span>
                      <span className="text-xs font-bold font-mono text-success">{formatCurrency(selectedEntrega.valor)}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {["Foto do canhoto auditada pela IA", "Mapa GPS com ponto de entrega", "Carimbo TechSin + timestamp", "Instrucoes de pagamento em BRL"].map(item => (
                      <div key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Shield className="w-3 h-3 text-primary shrink-0" />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="px-6 pb-5 flex gap-3">
                  <Button variant="outline" className="flex-1 h-9 text-sm border-border text-muted-foreground" onClick={() => setModal("none")}>Cancelar</Button>
                  <Button className="flex-1 h-9 text-sm font-semibold" style={{ background: "linear-gradient(135deg, #2563EB, #3C82F6)" }} onClick={confirmarFaturamento}>
                    <Send className="w-3.5 h-3.5 mr-1.5" /> Disparar Agora
                  </Button>
                </div>
              </>
            )}

            {faturamentoStep === "sending" && (
              <div className="px-6 py-10 flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4 bg-primary/10">
                  <Mail className="w-7 h-7 text-primary animate-bounce" />
                </div>
                <h3 className="text-base font-semibold mb-1">Enviando comprovante...</h3>
                <p className="text-xs text-muted-foreground mb-5">Gerando PDF auditado e disparando e-mail</p>
                <div className="w-48 h-1.5 rounded-full overflow-hidden mb-2" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
                  <div className="h-full bg-primary rounded-full transition-all duration-150" style={{ width: `${sendProgress}%` }} />
                </div>
                <p className="text-xs font-mono text-muted-foreground">{Math.round(sendProgress)}%</p>
              </div>
            )}

            {faturamentoStep === "done" && (
              <div className="px-6 py-10 flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4 bg-success/10" style={{ boxShadow: "0 0 24px rgba(74,222,128,0.2)" }}>
                  <CheckCircle2 className="w-7 h-7 text-success" />
                </div>
                <h3 className="text-base font-bold">E-mail Enviado!</h3>
                <p className="text-xs text-muted-foreground mt-1 mb-3">Comprovante auditado entregue para</p>
                <p className="text-xs font-mono text-primary mb-4">{selectedEntrega.email}</p>
                <p className="text-xs text-success">Confirmado às {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ MAP POPUP MODAL ═══ */}
      {modal === "map" && mapEntrega && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.8)" }}>
          <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Prova Real de Entrega</h3>
                <Badge className="text-[10px] bg-success/10 text-success border-success/25">Auditado GPS</Badge>
              </div>
              <button onClick={() => setModal("none")} className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/8">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">NF: </span><span className="font-mono text-foreground">{mapEntrega.nf}</span></div>
                <div><span className="text-muted-foreground">Cliente: </span><span className="text-foreground">{mapEntrega.cliente}</span></div>
                <div className="col-span-2"><span className="text-muted-foreground">GPS: </span><span className="font-mono text-primary">{mapEntrega.lat.toFixed(5)}, {mapEntrega.lon.toFixed(5)}</span></div>
              </div>

              {/* Map + photo side by side */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                    <MapPin className="w-2.5 h-2.5" /> Mapa GPS
                  </p>
                  <OSMMapFrame lat={mapEntrega.lat} lon={mapEntrega.lon} height={180} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Shield className="w-2.5 h-2.5" /> Foto do Canhoto
                  </p>
                  {mapEntrega.fotoUrl ? (
                    <img src={mapEntrega.fotoUrl} alt="Canhoto" className="w-full h-44 object-cover rounded border border-border" />
                  ) : (
                    <div className="w-full h-44 rounded border border-border bg-background flex items-center justify-center">
                      <p className="text-[10px] text-muted-foreground text-center px-3">Foto capturada via câmera do motorista</p>
                    </div>
                  )}
                </div>
              </div>

              {mapEntrega.status === "analise_manual" ? (
                <div className="flex items-start gap-2 p-3 rounded border border-amber-500/35" style={{ backgroundColor: "rgba(245,158,11,0.08)" }}>
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-300 mb-0.5">Comprovante divergente — análise manual necessária</p>
                    <p className="text-[11px] text-amber-400/80">Verifique a foto ao lado antes de liberar o faturamento. Este comprovante não foi reconhecido como canhoto padrão.</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded bg-success/5 border border-success/20">
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  <p className="text-xs text-foreground">
                    Entrega <span className="font-semibold text-success">verificada e auditada</span> pelo TechSin. Pronta para faturamento.
                  </p>
                </div>
              )}

              {mapEntrega.status === "validado_ia" && (
                <Button
                  className="w-full h-9 text-sm font-semibold"
                  style={{ background: "linear-gradient(135deg, #2563EB, #3C82F6)" }}
                  onClick={() => { setModal("none"); setTimeout(() => openFaturamento(mapEntrega.id), 100); }}
                >
                  <Send className="w-4 h-4 mr-2" /> Disparar Faturamento Expresso
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EntregaStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    aguardando:    { label: "Aguardando",    cls: "bg-amber-500/10 text-amber-500 border-amber-500/25" },
    validado_ia:   { label: "🟢 Auditado",   cls: "bg-success/10 text-success border-success/25" },
    analise_manual:{ label: "🟡 Análise Manual", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    faturado:      { label: "Faturado",      cls: "bg-primary/10 text-primary border-primary/25" },
  };
  const c = cfg[status] ?? { label: status, cls: "border-border text-muted-foreground" };
  return <Badge variant="outline" className={`text-[10px] shrink-0 ${c.cls}`}>{c.label}</Badge>;
}

function KpiCard({ title, value, subtext, icon: Icon, trend, accent, isLoading }: any) {
  if (isLoading) return <Skeleton className="h-28 rounded-lg bg-card border border-border" />;
  const trendUp = trend > 0;
  const accentColor = accent === "success" ? "text-success" : accent === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="bg-card border border-border rounded-lg px-4 py-4">
      <div className="flex items-start justify-between mb-3">
        <p className="text-[11px] font-medium text-muted-foreground leading-tight">{title}</p>
        <div className="p-1.5 rounded bg-background"><Icon className="w-3.5 h-3.5 text-muted-foreground" /></div>
      </div>
      <p className={`text-xl font-semibold tabular-nums tracking-tight ${accentColor}`}>{value}</p>
      <div className="flex items-center justify-between mt-2">
        <p className="text-[10px] text-muted-foreground">{subtext}</p>
        <div className={`flex items-center gap-0.5 text-[10px] font-medium ${trendUp ? "text-success" : "text-destructive"}`}>
          {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {Math.abs(trend)}%
        </div>
      </div>
    </div>
  );
}
