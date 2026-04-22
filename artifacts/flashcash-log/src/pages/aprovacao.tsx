import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CheckCircle2, XCircle, MapPin, Camera, Edit3, RefreshCw,
  ShieldCheck, Clock, AlertTriangle, X, Eye, FileText, Download,
  MessageCircle, ExternalLink, Filter, CheckSquare
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface Canhoto {
  id: number; viagemId: number; motoristaId?: number;
  fotoUrl?: string; numeroNF?: string; cnpjCliente?: string;
  latitude?: number; longitude?: number; iaConfidencia?: number;
  valorDetectado?: number; valorFrete?: number;
  assinaturaDetectada?: boolean; status: string; sealId?: string;
  observacoes?: string; timestamp?: string; capturedAt?: string;
  clienteNome?: string; clienteEmail?: string; motoristaNome?: string;
  origem?: string; destino?: string;
  fraudAlert?: boolean; fraudDistanciaMetros?: number;
}

function OSMMapThumb({ lat, lon }: { lat: number; lon: number }) {
  const d = 0.006;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - d},${lat - d},${lon + d},${lat + d}&layer=mapnik&marker=${lat},${lon}`;
  return <iframe src={src} className="w-full h-full rounded border border-border" title="Mapa" loading="lazy" />;
}

async function gerarPDF(c: Canhoto) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const PAGE_W = 210;
  const MARGIN = 18;
  let y = 0;

  // Header band
  doc.setFillColor(28, 40, 64);
  doc.rect(0, 0, PAGE_W, 38, "F");
  doc.setFontSize(20);
  doc.setTextColor(60, 130, 246);
  doc.setFont("helvetica", "bold");
  doc.text("TechSin", MARGIN, 16);
  doc.setFontSize(9);
  doc.setTextColor(180, 195, 220);
  doc.setFont("helvetica", "normal");
  doc.text("Comprovante Profissional de Entrega", MARGIN, 23);
  doc.setFontSize(8);
  doc.text("Comprovante digital — TechSin Logística", MARGIN, 29);
  // Seal badge
  if (c.sealId) {
    doc.setFontSize(7);
    doc.setTextColor(74, 222, 128);
    doc.text(c.sealId, PAGE_W - MARGIN, 16, { align: "right" });
  }
  doc.setFontSize(7.5);
  doc.setTextColor(120, 140, 160);
  doc.text(new Date().toLocaleString("pt-BR"), PAGE_W - MARGIN, 22, { align: "right" });

  y = 46;

  // Title row
  doc.setFontSize(13);
  doc.setTextColor(30, 40, 55);
  doc.setFont("helvetica", "bold");
  doc.text(`Entrega: NF ${c.numeroNF ?? "—"}`, MARGIN, y);
  y += 8;

  // Fraud alert banner
  if (c.fraudAlert) {
    doc.setFillColor(254, 240, 138);
    doc.rect(MARGIN - 2, y - 4, PAGE_W - 2 * MARGIN + 4, 10, "F");
    doc.setTextColor(180, 83, 9);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(`⚠  ALERTA DE FRAUDE — Distância: ${c.fraudDistanciaMetros ?? "?"}m do endereço esperado`, MARGIN, y + 2);
    y += 14;
  }

  // Data table
  const rows = [
    ["Cliente", c.clienteNome ?? "—"],
    ["E-mail Faturamento", c.clienteEmail ?? "—"],
    ["Motorista", c.motoristaNome ?? "—"],
    ["Origem", c.origem ?? "—"],
    ["Destino", c.destino ?? "—"],
    ["Valor do Frete", c.valorFrete ? `R$ ${c.valorFrete.toFixed(2).replace(".", ",")}` : "—"],
    ["GPS Capturado", c.latitude ? `${c.latitude.toFixed(5)}, ${c.longitude?.toFixed(5)}` : "Não disponível"],
    ["Captura (câmera)", c.capturedAt ? new Date(c.capturedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"],
    ["Assinatura", c.assinaturaDetectada ? "Detectada ✓" : "Não detectada ✗"],
    ["Confiança IA", c.iaConfidencia != null ? `${(c.iaConfidencia * 100).toFixed(0)}%` : "—"],
    ["Status Final", c.status === "validado" ? "APROVADO" : c.status === "rejeitado" ? "REJEITADO" : "PENDENTE"],
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  rows.forEach(([label, value], i) => {
    const rowY = y + i * 7;
    if (i % 2 === 0) {
      doc.setFillColor(245, 247, 251);
      doc.rect(MARGIN - 2, rowY - 4, PAGE_W - 2 * MARGIN + 4, 7, "F");
    }
    doc.setTextColor(90, 100, 120);
    doc.text(label, MARGIN, rowY);
    doc.setTextColor(20, 30, 50);
    doc.setFont("helvetica", "bold");
    doc.text(String(value), MARGIN + 60, rowY);
    doc.setFont("helvetica", "normal");
  });
  y += rows.length * 7 + 8;

  // Canhoto photo (if it's a real URL, we add a placeholder note)
  if (c.fotoUrl) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = c.fotoUrl!;
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const maxW = (PAGE_W - 2 * MARGIN) / 2 - 3;
      const maxH = 50;
      const aspect = img.naturalWidth / img.naturalHeight;
      const imgW = Math.min(maxW, maxH * aspect);
      const imgH = imgW / aspect;
      doc.setFontSize(8); doc.setTextColor(90, 100, 120);
      doc.text("Foto do Canhoto:", MARGIN, y);
      y += 4;
      doc.addImage(dataUrl, "JPEG", MARGIN, y, imgW, imgH);
      y += imgH + 6;
    } catch {
      doc.setFontSize(8); doc.setTextColor(120, 130, 150);
      doc.text("[Foto do canhoto disponível no sistema TechSin]", MARGIN, y);
      y += 8;
    }
  }

  // OSM Map note
  doc.setFontSize(8); doc.setTextColor(90, 100, 120);
  doc.text(`Coordenadas GPS verificadas via OpenStreetMap: ${c.latitude?.toFixed(5) ?? "N/A"}, ${c.longitude?.toFixed(5) ?? "N/A"}`, MARGIN, y);
  y += 10;

  // Footer band
  doc.setFillColor(245, 247, 251);
  doc.rect(0, 280, PAGE_W, 17, "F");
  doc.setFontSize(7);
  doc.setTextColor(120, 130, 150);
  doc.text("TechSin © 2026 — Comprovante de entrega. Gerado automaticamente.", MARGIN, 290);
  doc.text("www.techsin.com.br", PAGE_W - MARGIN, 290, { align: "right" });

  doc.save(`comprovante-${c.numeroNF ?? c.id}-${c.sealId ?? "techsin"}.pdf`);
}

interface PendingViagem {
  id: number;
  numeroNF?: string;
  destino?: string;
  valorFrete?: number;
  clienteNome?: string;
  motoristaNome?: string;
  status: string;
  xmlId?: number | null;
}

export default function Aprovacao() {
  const { user } = useAuth();
  const [canhotos, setCanhotos] = useState<Canhoto[]>([]);
  const [pendingViagens, setPendingViagens] = useState<PendingViagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editModal, setEditModal] = useState<Canhoto | null>(null);
  const [editForm, setEditForm] = useState({ numeroNF: "", cnpjCliente: "", observacoes: "", valorFrete: "", motoristaNome: "" });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // New states for improvements
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState({ motorista: "", cliente: "", status: "todos", dataInicio: "", dataFim: "" });
  const [rejectModal, setRejectModal] = useState<Canhoto | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [bulkRejectModal, setBulkRejectModal] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState("");
  const [fraudConfirmModal, setFraudConfirmModal] = useState<Canhoto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const tenantId = user?.transportadoraId ?? 1;
      const [all, pending] = await Promise.all([
        api.get<Canhoto[]>(`/canhotos?transportadoraId=${tenantId}`),
        api.get<PendingViagem[]>(`/viagens/pendentes-canhoto?transportadoraId=${tenantId}`).catch(() => [] as PendingViagem[]),
      ]);
      // Fila mostra apenas pendentes — aprovados vão para Operações/Faturamento
      setCanhotos(all.filter(c => c.status === "pendente"));
      setPendingViagens(pending);
    } catch (e: any) {
      toast({ title: "Erro ao carregar canhotos", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast, user?.transportadoraId]);

  useEffect(() => { load(); }, [load]);

  /* Auto-refresh a cada 10 segundos — detecta novos uploads e canhotos */
  useEffect(() => {
    const interval = setInterval(() => { load(); }, 10_000);
    return () => clearInterval(interval);
  }, [load]);

  const approve = async (id: number) => {
    setProcessing(id);
    try {
      const result = await api.post<{ emailEnviado?: boolean }>(`/canhotos/${id}/approve`, {});
      await load();
      if (selectedId === id) setSelectedId(null);
      toast({
        title: "Canhoto aprovado!",
        description: result?.emailEnviado
          ? "Fatura gerada e e-mail de cobrança enviado ao cliente."
          : "Fatura gerada. E-mail de cobrança registrado (configure RESEND_API_KEY para envio real).",
      });
    } catch (e: any) {
      toast({ title: "Erro ao aprovar", description: e.message, variant: "destructive" });
    } finally { setProcessing(null); }
  };

  const reject = async (id: number, reason: string) => {
    setProcessing(id);
    try {
      await api.post(`/canhotos/${id}/validate`, { status: "rejeitado", observacoes: reason });
      await load();
      if (selectedId === id) setSelectedId(null);
      setRejectModal(null);
      setRejectReason("");
      toast({ title: "Canhoto rejeitado." });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setProcessing(null); }
  };

  const bulkApprove = async () => {
    if (selectedIds.size === 0) return;
    setProcessing(-1);
    try {
      await Promise.all(Array.from(selectedIds).map(id => api.post(`/canhotos/${id}/approve`, {})));
      setSelectedIds(new Set());
      await load();
      toast({ title: `${selectedIds.size} canhotos aprovados!` });
    } catch (e: any) {
      toast({ title: "Erro ao aprovar em lote", description: e.message, variant: "destructive" });
    } finally { setProcessing(null); }
  };

  const bulkReject = async () => {
    if (selectedIds.size === 0 || !bulkRejectReason) return;
    setProcessing(-1);
    try {
      await Promise.all(Array.from(selectedIds).map(id =>
        api.post(`/canhotos/${id}/validate`, { status: "rejeitado", observacoes: bulkRejectReason })
      ));
      setSelectedIds(new Set());
      setBulkRejectModal(false);
      setBulkRejectReason("");
      await load();
      toast({ title: `${selectedIds.size} canhotos rejeitados!` });
    } catch (e: any) {
      toast({ title: "Erro ao rejeitar em lote", description: e.message, variant: "destructive" });
    } finally { setProcessing(null); }
  };

  const bulkSendWhatsApp = () => {
    if (selectedIds.size === 0) return;
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const links = Array.from(selectedIds).map(id => {
      const canhoto = canhotos.find(c => c.id === id);
      return canhoto ? `${window.location.origin}${base}/entrega/${canhoto.viagemId}` : "";
    }).filter(Boolean);
    
    const msg = links.length > 1 
      ? `Olá! Seguem os links das suas cargas no TechSin:\n${links.join("\n")}`
      : `Olá! Segue o link da sua carga no TechSin: ${links[0]}`;
    
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const downloadPDF = async (c: Canhoto) => {
    setGeneratingPdf(c.id);
    try {
      await gerarPDF(c);
      toast({ title: "PDF gerado!", description: `Comprovante da NF ${c.numeroNF ?? c.id} baixado.` });
    } catch (e: any) {
      toast({ title: "Erro ao gerar PDF", description: e.message, variant: "destructive" });
    } finally { setGeneratingPdf(null); }
  };

  const sendToWhatsApp = (viagemId: number) => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const link = `${window.location.origin}${base}/entrega/${viagemId}`;
    const msg  = `Olá! Segue o link da sua carga no TechSin: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const openEdit = (c: Canhoto) => {
    setEditForm({ numeroNF: c.numeroNF ?? "", cnpjCliente: c.cnpjCliente ?? "", observacoes: c.observacoes ?? "" });
    setEditModal(c);
  };

  const saveEdit = async () => {
    if (!editModal) return;
    setSaving(true);
    try {
      await api.patch(`/canhotos/${editModal.id}`, editForm);
      await load();
      setEditModal(null);
      toast({ title: "Dados corrigidos com sucesso!" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const pendentes = canhotos.filter(c => c.status === "pendente");
  const fraudCount = canhotos.filter(c => c.fraudAlert).length;
  const selected = selectedId ? canhotos.find(c => c.id === selectedId) : null;
  const totalAguardando = pendentes.length + pendingViagens.length;

  // Apply filters
  const filteredCanhotos = canhotos.filter(c => {
    if (filters.motorista && !c.motoristaNome?.toLowerCase().includes(filters.motorista.toLowerCase())) return false;
    if (filters.cliente && !c.clienteNome?.toLowerCase().includes(filters.cliente.toLowerCase())) return false;
    if (filters.status !== "todos" && c.status !== filters.status) return false;
    if (filters.dataInicio && c.capturedAt && new Date(c.capturedAt) < new Date(filters.dataInicio)) return false;
    if (filters.dataFim && c.capturedAt && new Date(c.capturedAt) > new Date(filters.dataFim)) return false;
    return true;
  });

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCanhotos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCanhotos.map(c => c.id)));
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Fila de Conferência</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Revise, corrija e aprove os canhotos. Gere comprovantes PDF com um clique.</p>
        </div>
        <div className="flex items-center gap-2">
          {fraudCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-red-500/10 border border-red-500/25">
              <AlertTriangle className="w-3 h-3 text-red-400" />
              <span className="text-red-400 font-semibold">{fraudCount} alerta{fraudCount > 1 ? "s" : ""} de fraude</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-amber-400 font-medium">{totalAguardando} aguardando</span>
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs border-border" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="w-3.5 h-3.5" />
          <span>Filtros:</span>
        </div>
        <Input
          placeholder="Motorista..."
          value={filters.motorista}
          onChange={e => setFilters(f => ({ ...f, motorista: e.target.value }))}
          className="h-8 w-40 text-xs"
        />
        <Input
          placeholder="Cliente..."
          value={filters.cliente}
          onChange={e => setFilters(f => ({ ...f, cliente: e.target.value }))}
          className="h-8 w-40 text-xs"
        />
        <Select value={filters.status} onValueChange={v => setFilters(f => ({ ...f, status: v }))}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="validado">Aprovado</SelectItem>
            <SelectItem value="rejeitado">Rejeitado</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={filters.dataInicio}
          onChange={e => setFilters(f => ({ ...f, dataInicio: e.target.value }))}
          className="h-8 w-36 text-xs"
        />
        <Input
          type="date"
          value={filters.dataFim}
          onChange={e => setFilters(f => ({ ...f, dataFim: e.target.value }))}
          className="h-8 w-36 text-xs"
        />
        {(filters.motorista || filters.cliente || filters.status !== "todos" || filters.dataInicio || filters.dataFim) && (
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setFilters({ motorista: "", cliente: "", status: "todos", dataInicio: "", dataFim: "" })}>
            Limpar
          </Button>
        )}
      </div>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-2 text-xs">
            <CheckSquare className="w-4 h-4 text-primary" />
            <span className="text-foreground font-medium">{selectedIds.size} selecionado{selectedIds.size > 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={bulkSendWhatsApp}>
              <MessageCircle className="w-3 h-3" /> WhatsApp
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setBulkRejectModal(true)}>
              <XCircle className="w-3 h-3" /> Rejeitar
            </Button>
            <Button size="sm" className="h-8 text-xs gap-1" onClick={bulkApprove} disabled={processing === -1}>
              {processing === -1 ? <RefreshCw className="w-3 h-3 animate-spin" /> : <><CheckCircle2 className="w-3 h-3" /> Aprovar</>}
            </Button>
          </div>
        </div>
      )}

      {/* ── Aguardando Canhoto do Motorista ───────────────────────────────────── */}
      {pendingViagens.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0 animate-pulse" />
            <h3 className="text-sm font-semibold text-foreground">Aguardando Canhoto do Motorista</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/12 text-blue-400 border border-blue-500/20 font-medium">
              {pendingViagens.length} envio{pendingViagens.length !== 1 ? "s" : ""} pendente{pendingViagens.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {pendingViagens.map(v => (
              <div key={v.id} className="bg-card border border-blue-500/15 rounded-lg px-4 py-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-bold text-foreground truncate">NF {v.numeroNF ?? `VGM-${v.id}`}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{v.clienteNome ?? "—"}</p>
                    {v.destino && <p className="text-[10px] text-muted-foreground truncate">{v.destino}</p>}
                  </div>
                  {v.valorFrete != null && (
                    <span className="text-xs font-semibold text-success shrink-0">{formatCurrency(v.valorFrete)}</span>
                  )}
                </div>
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5 w-full"
                  style={{ background: "rgba(37,211,102,0.15)", border: "1px solid rgba(37,211,102,0.3)", color: "#25D366" }}
                  onClick={() => sendToWhatsApp(v.id)}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Enviar Link ao Motorista
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Queue list */}
        <div className="space-y-3">
          {/* Section: Aguardando Aprovação */}
          {!loading && pendentes.length > 0 && (
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />
              <h3 className="text-sm font-semibold text-foreground">Aguardando Aprovação</h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/12 text-amber-400 border border-amber-500/20 font-medium">
                {pendentes.length} canhoto{pendentes.length !== 1 ? "s" : ""} para revisar
              </span>
            </div>
          )}
          {loading ? (
            <div className="bg-card border border-border rounded-lg py-10 text-center text-xs text-muted-foreground">Carregando fila...</div>
          ) : canhotos.length === 0 ? (
            <div className="bg-card border border-border rounded-lg py-12 text-center">
              <CheckCircle2 className="w-8 h-8 text-success mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">Fila vazia!</p>
              <p className="text-xs text-muted-foreground mt-1">Todos os canhotos foram processados.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                <Checkbox
                  checked={selectedIds.size === filteredCanhotos.length && filteredCanhotos.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <span>Selecionar todos ({filteredCanhotos.length})</span>
              </div>
              {filteredCanhotos.map(c => (
                <div
                  key={c.id}
                  className={`bg-card border rounded-lg overflow-hidden cursor-pointer transition-all duration-200 ${
                    c.fraudAlert ? "border-red-500/40" :
                    selectedId === c.id ? "border-primary shadow-[0_0_0_1px_rgba(60,130,246,0.3)]" : "border-border hover:border-white/20"
                  }`}
                  onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                >
                  {c.fraudAlert && (
                    <div className="px-4 py-1.5 flex items-center gap-1.5 text-[10px] font-medium text-red-300" style={{ backgroundColor: "rgba(239,68,68,0.08)" }}>
                      <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                      ALERTA DE FRAUDE — Motorista estava a {c.fraudDistanciaMetros ?? "?"}m do endereço esperado
                    </div>
                  )}
                  <div className="px-4 py-3 flex items-center gap-3">
                    <Checkbox
                      checked={selectedIds.has(c.id)}
                      onCheckedChange={() => toggleSelect(c.id)}
                      onClick={e => e.stopPropagation()}
                    />
                    <div className={`w-2 h-2 rounded-full shrink-0 ${c.fraudAlert ? "bg-red-400" : c.status === "pendente" ? "bg-amber-400" : "bg-success"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-mono font-bold text-foreground">{c.numeroNF ?? `Canhoto #${c.id}`}</p>
                        <StatusBadge status={c.status} fraudAlert={c.fraudAlert} />
                        {c.iaConfidencia != null && (
                          <span className={`text-[9px] font-mono ${c.iaConfidencia >= 0.85 ? "text-success" : "text-amber-400"}`}>
                            IA: {(c.iaConfidencia * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                        {c.motoristaNome ?? "Motorista"} · {c.clienteNome ?? "Cliente desconhecido"}
                      </p>
                      {c.valorFrete && (
                        <p className="text-xs font-semibold text-success mt-0.5">{formatCurrency(c.valorFrete)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        className="w-7 h-7 rounded flex items-center justify-center hover:bg-green-500/15 transition-colors"
                        onClick={e => { e.stopPropagation(); sendToWhatsApp(c.viagemId); }}
                        title="Enviar para o Motorista via WhatsApp"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-green-500" />
                      </button>
                      <button
                        className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/8 transition-colors"
                        onClick={e => { e.stopPropagation(); openEdit(c); }}
                        title="Editar dados"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button
                        className="w-7 h-7 rounded flex items-center justify-center hover:bg-primary/10 transition-colors"
                        onClick={e => { e.stopPropagation(); downloadPDF(c); }}
                        disabled={generatingPdf === c.id}
                        title="Baixar PDF"
                      >
                        {generatingPdf === c.id ? <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" /> : <Download className="w-3.5 h-3.5 text-primary" />}
                      </button>
                      <button
                        className="w-7 h-7 rounded flex items-center justify-center hover:bg-success/10 transition-colors"
                        onClick={e => {
                          e.stopPropagation();
                          if (c.fraudAlert) {
                            setFraudConfirmModal(c);
                          } else {
                            approve(c.id);
                          }
                        }}
                        disabled={processing === c.id}
                        title="Aprovar"
                      >
                        {processing === c.id ? <RefreshCw className="w-3.5 h-3.5 text-success animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 text-success" />}
                      </button>
                      <button
                        className="w-7 h-7 rounded flex items-center justify-center hover:bg-destructive/10 transition-colors"
                        onClick={e => { e.stopPropagation(); setRejectModal(c); setRejectReason(""); }}
                        disabled={processing === c.id}
                        title="Rejeitar"
                      >
                        <XCircle className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Side-by-side proof panel */}
        {selected ? (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Prova Real de Entrega</h3>
                <span className="text-xs font-mono text-muted-foreground">{selected.numeroNF}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] border-green-500/30 text-green-400 hover:bg-green-500/8 px-2"
                  onClick={() => sendToWhatsApp(selected.viagemId)}
                >
                  <MessageCircle className="w-3 h-3 mr-1" />
                  WhatsApp
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] border-primary/30 text-primary hover:bg-primary/8 px-2"
                  onClick={() => downloadPDF(selected)}
                  disabled={generatingPdf === selected.id}
                >
                  {generatingPdf === selected.id ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}
                  PDF
                </Button>
                <button onClick={() => setSelectedId(null)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/8">
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Fraud alert banner */}
              {selected.fraudAlert && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-red-500/30 text-xs" style={{ backgroundColor: "rgba(239,68,68,0.07)" }}>
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-300">Alerta de Fraude Geográfica</p>
                    <p className="text-red-400/80 mt-0.5">
                      Motorista estava a <strong>{selected.fraudDistanciaMetros ?? "?"}m</strong> do endereço de entrega esperado (limite: 500m). Revise antes de aprovar.
                    </p>
                  </div>
                </div>
              )}

              {/* Map + Photo side by side */}
              <div className="grid grid-cols-2 gap-3 h-44">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                    <MapPin className="w-2.5 h-2.5 text-primary" /> GPS da Entrega
                  </p>
                  {selected.latitude && selected.longitude ? (
                    <div className="h-36">
                      <OSMMapThumb lat={selected.latitude} lon={selected.longitude} />
                    </div>
                  ) : (
                    <div className="h-36 rounded border border-border bg-background flex items-center justify-center">
                      <p className="text-[10px] text-muted-foreground text-center">GPS não disponível</p>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Camera className="w-2.5 h-2.5 text-success" /> Foto do Canhoto
                  </p>
                  {selected.fotoUrl ? (
                    <img src={selected.fotoUrl} alt="Canhoto" className="w-full h-36 object-cover rounded border border-border" />
                  ) : (
                    <div className="h-36 rounded border border-border bg-background flex items-center justify-center">
                      <p className="text-[10px] text-muted-foreground text-center">Sem foto</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Data grid */}
              <div className="rounded-lg border border-border p-3 space-y-2" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
                {[
                  { label: "Nota Fiscal", value: selected.numeroNF ?? "—" },
                  { label: "Cliente", value: selected.clienteNome ?? "—" },
                  { label: "E-mail Faturamento", value: selected.clienteEmail ?? "—" },
                  { label: "Motorista", value: selected.motoristaNome ?? "—" },
                  { label: "Valor do Frete", value: selected.valorFrete ? formatCurrency(selected.valorFrete) : "—" },
                  { label: "Assinatura", value: selected.assinaturaDetectada ? "✓ Detectada" : "✗ Não detectada" },
                  { label: "GPS", value: selected.latitude ? `${selected.latitude?.toFixed(4)}, ${selected.longitude?.toFixed(4)}` : "—" },
                  { label: "Confiança IA", value: selected.iaConfidencia != null ? `${(selected.iaConfidencia * 100).toFixed(0)}%` : "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between gap-4 text-xs">
                    <span className="text-muted-foreground shrink-0">{label}</span>
                    <span className="text-foreground font-mono text-right truncate">{value}</span>
                  </div>
                ))}
              </div>

              {/* Seal */}
              {selected.sealId && (
                <div className="flex items-center gap-2 px-3 py-2 rounded bg-success/5 border border-success/15">
                  <ShieldCheck className="w-3.5 h-3.5 text-success shrink-0" />
                  <span className="text-[10px] font-mono text-success">{selected.sealId}</span>
                </div>
              )}

              {/* Action buttons */}
              {selected.status === "pendente" && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 h-9 text-xs border-border text-muted-foreground hover:bg-white/5"
                    onClick={() => openEdit(selected)}
                  >
                    <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Corrigir
                  </Button>
                  <Button
                    className="flex-1 h-9 text-xs font-semibold border-destructive/30 text-destructive bg-transparent hover:bg-destructive/8"
                    variant="outline"
                    onClick={() => { setRejectModal(selected); setRejectReason(""); }}
                    disabled={processing === selected.id}
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1.5" /> Rejeitar
                  </Button>
                  <Button
                    className="flex-1 h-9 text-xs font-semibold"
                    style={{ background: selected.fraudAlert ? "linear-gradient(135deg, #ef4444, #dc2626)" : "linear-gradient(135deg, #16a34a, #4ADE80)", color: "#000" }}
                    onClick={() => {
                      if (selected.fraudAlert) {
                        setFraudConfirmModal(selected);
                      } else {
                        approve(selected.id);
                      }
                    }}
                    disabled={processing === selected.id}
                  >
                    {processing === selected.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Aprovar</>}
                  </Button>
                </div>
              )}
              {selected.status === "validado" && (
                <div className="flex items-center gap-2 justify-center py-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <p className="text-xs text-success font-medium">Canhoto aprovado — fatura gerada para faturamento expresso.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg flex items-center justify-center py-16">
            <div className="text-center">
              <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Selecione um canhoto para ver a prova de entrega</p>
              <p className="text-[10px] text-muted-foreground mt-1">Clique em PDF para gerar o comprovante profissional</p>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
          <div className="bg-card border border-border rounded-xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Corrigir Dados do Canhoto</h3>
              </div>
              <button onClick={() => setEditModal(null)} className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/8">
                <X className="w-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-xs text-muted-foreground">Corrija os dados antes de aprovar. Útil quando a IA cometeu um pequeno erro.</p>
              {[
                { key: "numeroNF", label: "Número da Nota Fiscal", placeholder: "NF-2026-04521" },
                { key: "cnpjCliente", label: "CNPJ do Cliente", placeholder: "00.000.000/0001-00" },
                { key: "valorFrete", label: "Valor do Frete", placeholder: "1500.00", type: "number" },
                { key: "motoristaNome", label: "Nome do Motorista", placeholder: "João Silva" },
                { key: "observacoes", label: "Observações", placeholder: "Ex.: Entrega parcial, 3 volumes recusados..." },
              ].map(({ key, label, placeholder, type }) => (
                <div key={key} className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <Input
                    className="h-9 text-sm bg-background border-border"
                    type={type || "text"}
                    placeholder={placeholder}
                    value={(editForm as any)[key]}
                    onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <Button variant="outline" className="flex-1 h-9 text-sm border-border text-muted-foreground" onClick={() => setEditModal(null)}>Cancelar</Button>
              <Button className="flex-1 h-9 text-sm font-semibold" style={{ background: "linear-gradient(135deg, #2563EB, #3C82F6)" }} onClick={saveEdit} disabled={saving}>
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <><ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Salvar</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal with Reason */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
          <div className="bg-card border border-border rounded-xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-destructive" />
                <h3 className="text-sm font-semibold text-foreground">Rejeitar Canhoto</h3>
              </div>
              <button onClick={() => setRejectModal(null)} className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/8">
                <X className="w-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-xs text-muted-foreground">Informe o motivo da rejeição. Este será registrado no histórico.</p>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Motivo</Label>
                <Select value={rejectReason} onValueChange={setRejectReason}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Selecione o motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Foto borrada ou ilegível">Foto borrada ou ilegível</SelectItem>
                    <SelectItem value="Dados incorretos na nota fiscal">Dados incorretos na nota fiscal</SelectItem>
                    <SelectItem value="Suspeita de fraude (GPS fora do local)">Suspeita de fraude (GPS fora do local)</SelectItem>
                    <SelectItem value="Assinatura não detectada">Assinatura não detectada</SelectItem>
                    <SelectItem value="Entrega não realizada">Entrega não realizada</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {rejectReason === "Outro" && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Descreva o motivo</Label>
                  <Input
                    className="h-9 text-sm bg-background border-border"
                    placeholder="Detalhes adicionais..."
                    value={rejectReason === "Outro" ? (editForm as any).observacoes : ""}
                    onChange={e => setEditForm(p => ({ ...p, observacoes: e.target.value }))}
                  />
                </div>
              )}
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <Button variant="outline" className="flex-1 h-9 text-sm border-border text-muted-foreground" onClick={() => setRejectModal(null)}>Cancelar</Button>
              <Button
                className="flex-1 h-9 text-sm font-semibold bg-destructive hover:bg-destructive/90"
                onClick={() => reject(rejectModal.id, rejectReason === "Outro" ? (editForm as any).observacoes || "Outro" : rejectReason)}
                disabled={!rejectReason || (rejectReason === "Outro" && !(editForm as any).observacoes)}
              >
                {processing === rejectModal.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <><XCircle className="w-3.5 h-3.5 mr-1.5" /> Rejeitar</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Reject Modal */}
      {bulkRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
          <div className="bg-card border border-border rounded-xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-destructive" />
                <h3 className="text-sm font-semibold text-foreground">Rejeitar em Lote ({selectedIds.size})</h3>
              </div>
              <button onClick={() => setBulkRejectModal(false)} className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/8">
                <X className="w-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-xs text-muted-foreground">Informe o motivo da rejeição em lote. Este será aplicado a todos os canhotos selecionados.</p>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Motivo</Label>
                <Select value={bulkRejectReason} onValueChange={setBulkRejectReason}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Selecione o motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Foto borrada ou ilegível">Foto borrada ou ilegível</SelectItem>
                    <SelectItem value="Dados incorretos na nota fiscal">Dados incorretos na nota fiscal</SelectItem>
                    <SelectItem value="Suspeita de fraude (GPS fora do local)">Suspeita de fraude (GPS fora do local)</SelectItem>
                    <SelectItem value="Assinatura não detectada">Assinatura não detectada</SelectItem>
                    <SelectItem value="Entrega não realizada">Entrega não realizada</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <Button variant="outline" className="flex-1 h-9 text-sm border-border text-muted-foreground" onClick={() => setBulkRejectModal(false)}>Cancelar</Button>
              <Button
                className="flex-1 h-9 text-sm font-semibold bg-destructive hover:bg-destructive/90"
                onClick={bulkReject}
                disabled={!bulkRejectReason || processing === -1}
              >
                {processing === -1 ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <><XCircle className="w-3.5 h-3.5 mr-1.5" /> Rejeitar {selectedIds.size}</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Fraud Confirm Modal */}
      {fraudConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
          <div className="bg-card border border-red-500/30 rounded-xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-red-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-semibold text-red-300">Alerta de Fraude Detectado</h3>
              </div>
              <button onClick={() => setFraudConfirmModal(null)} className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/8">
                <X className="w-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-red-300">GPS fora do endereço esperado</p>
                  <p className="text-red-400/80 mt-1">
                    Motorista estava a <strong>{fraudConfirmModal.fraudDistanciaMetros ?? "?"}m</strong> do endereço de entrega (limite: 500m).
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Tem certeza que deseja aprovar este canhoto mesmo com o alerta de fraude? Revise o GPS e a foto antes de confirmar.
              </p>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <Button variant="outline" className="flex-1 h-9 text-sm border-border text-muted-foreground" onClick={() => setFraudConfirmModal(null)}>
                Cancelar
              </Button>
              <Button
                className="flex-1 h-9 text-sm font-semibold bg-red-500 hover:bg-red-600"
                onClick={() => {
                  approve(fraudConfirmModal.id);
                  setFraudConfirmModal(null);
                }}
                disabled={processing === fraudConfirmModal.id}
              >
                {processing === fraudConfirmModal.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <><AlertTriangle className="w-3.5 h-3.5 mr-1.5" /> Aprovar Mesmo Assim</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, fraudAlert }: { status: string; fraudAlert?: boolean }) {
  if (fraudAlert) return <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-400 border-red-500/25"><AlertTriangle className="w-2.5 h-2.5 mr-1" /> Fraude?</Badge>;
  if (status === "pendente") return <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/25"><Clock className="w-2.5 h-2.5 mr-1" /> Pendente</Badge>;
  if (status === "validado") return <Badge variant="outline" className="text-[9px] bg-success/10 text-success border-success/25"><CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Aprovado</Badge>;
  if (status === "rejeitado") return <Badge variant="outline" className="text-[9px] bg-destructive/10 text-destructive border-destructive/25"><XCircle className="w-2.5 h-2.5 mr-1" /> Rejeitado</Badge>;
  return <Badge variant="outline" className="text-[9px]">{status}</Badge>;
}
