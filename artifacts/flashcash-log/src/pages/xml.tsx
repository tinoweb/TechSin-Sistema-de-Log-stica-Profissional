import { useListXmls, useUploadXml, useMatchXmlCanhoto, getListXmlsQueryKey } from "@workspace/api-client-react";
import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  UploadCloud, FileCode2, Link as LinkIcon, CheckCircle2,
  AlertCircle, Package, DollarSign, User, Hash, Calendar,
  XCircle, FileImage, FileText, Image, Scan, Brain, MapPin
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/format";
import { api } from "@/lib/api-client";

/* ── Tipos ─────────────────────────────────────────────────────────── */
type FileCategory = "xml" | "image" | "pdf";

interface ParsedXml {
  tipo: string;
  numeroCte: string;
  nomeDestinatario: string;
  cnpjDestinatario: string;
  valorFrete: number;
  dataEmissao: string;
  cnpjEmissor: string;
}

interface OcrExtracted {
  valorTotal:      number | null;
  cnpj:            string | null;
  dataDocumento:   string | null;
  tipoDocumento:   string;
  descricao:       string;
  enderecoEntrega: string | null;
}

interface UploadedMedia {
  category: "image" | "pdf";
  name: string;
  sizeMB: string;
  dataUrl?: string;
  ocr?: OcrExtracted;
}

type UploadResult =
  | { kind: "xml";   data: ParsedXml }
  | { kind: "media"; data: UploadedMedia };

/* ── Helpers ────────────────────────────────────────────────────────── */
const ACCEPTED_EXT = ".xml,.txt,.pdf,.jpg,.jpeg,.png";
const FORMAT_CHIPS = [
  { label: "XML", color: "text-primary bg-primary/10 border-primary/25" },
  { label: "PDF", color: "text-red-400 bg-red-500/10 border-red-500/25" },
  { label: "JPG", color: "text-amber-400 bg-amber-500/10 border-amber-500/25" },
  { label: "PNG", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25" },
];

function getCategory(file: File): FileCategory {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png"].includes(ext) || file.type.startsWith("image/")) return "image";
  if (ext === "pdf" || file.type === "application/pdf") return "pdf";
  return "xml";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function compressImage(file: File, maxW = 1200, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(1, maxW / img.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.naturalWidth  * ratio);
      canvas.height = Math.round(img.naturalHeight * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas")); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsText(file, "utf-8");
  });
}

function parseXmlDocument(text: string): ParsedXml | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror")) return null;

    const get = (selector: string) => doc.querySelector(selector)?.textContent?.trim() ?? "";
    const isCte = !!doc.querySelector("CTe, cteProc, infCte");
    const tipo  = isCte ? "CT-e" : "MDF-e";

    const nCT      = get("nCT") || get("nMDF") || get("nNF") || "";
    const cnpjEmit = get("emit CNPJ") || get("emitente CNPJ") || get("CNPJ");
    const xNome    = get("dest xNome") || get("destinatario xNome") || get("xNome");
    const cnpjDest = get("dest CNPJ") || get("destinatario CNPJ") || "";
    const vTPrest  = get("vTPrest") || get("vCarga") || get("vNF") || "0";
    const dhEmi    = get("dhEmi") || get("dEmi") || "";
    const valorFrete = parseFloat(vTPrest.replace(",", ".")) || 0;

    let dataEmissao = dhEmi;
    if (dhEmi) { try { dataEmissao = new Date(dhEmi).toLocaleDateString("pt-BR"); } catch { /* keep raw */ } }
    if (!nCT && !cnpjDest && valorFrete === 0) return null;

    return {
      tipo,
      numeroCte: nCT ? `${tipo.replace("-", "")}-${nCT}` : `${tipo.replace("-", "")}-${Date.now()}`,
      nomeDestinatario: xNome  || "Destinatário não identificado",
      cnpjDestinatario: cnpjDest || "—",
      valorFrete,
      dataEmissao: dataEmissao || new Date().toLocaleDateString("pt-BR"),
      cnpjEmissor: cnpjEmit || "—",
    };
  } catch { return null; }
}

/* ── Ícone por tipo de documento ────────────────────────────────────── */
function DocTypeIcon({ tipo }: { tipo: string }) {
  if (tipo === "comprovante") return <Image className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  if (tipo === "manifesto")   return <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  return <FileCode2 className="w-3.5 h-3.5 text-primary shrink-0" />;
}

/* ── Componente principal ────────────────────────────────────────────── */
export default function Xml() {
  const { data: xmls, isLoading } = useListXmls({ query: { queryKey: ["xmls"] } });
  const queryClient = useQueryClient();
  const { toast }   = useToast();
  const [isDragging, setIsDragging]     = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult]             = useState<UploadResult | null>(null);
  const [parseError, setParseError]     = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useUploadXml({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListXmlsQueryKey() });
        toast({ title: "Documento salvo com sucesso.", description: "Disponível na lista de documentos processados." });
      },
      onError: () => {
        toast({ title: "Erro ao salvar documento.", variant: "destructive" });
      }
    }
  });

  const matchMutation = useMatchXmlCanhoto({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListXmlsQueryKey() });
        if (data.matched) {
          toast({ title: "Conciliação realizada!", description: `CT-e vinculado ao canhoto da viagem ${data.viagemId}` });
        } else {
          toast({ title: "Sem correspondência", description: data.details, variant: "destructive" });
        }
      }
    }
  });

  const processFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setParseError(null);
    setResult(null);

    const category = getCategory(file);

    try {
      /* ── Imagem (JPG / PNG) — OCR via IA ───────────────────────── */
      if (category === "image") {
        const compressed = await compressImage(file);
        const sizeMB = formatBytes(file.size);

        let ocr: OcrExtracted | undefined;
        try {
          const resp = await api.post<{ ocr: OcrExtracted }>("/xmls/ocr", {
            dataUrl: compressed,
            fileName: file.name,
            transportadoraId: 1,
          });
          ocr = resp.ocr;
          queryClient.invalidateQueries({ queryKey: getListXmlsQueryKey() });
        } catch (e) {
          setParseError("Erro ao salvar imagem. Verifique a conexão e tente novamente.");
          setIsProcessing(false);
          return;
        }

        const media: UploadedMedia = { category: "image", name: file.name, sizeMB, dataUrl: compressed, ocr };
        setResult({ kind: "media", data: media });
        setIsProcessing(false);
        return;
      }

      /* ── PDF — salvar sem OCR (GPT-4o não lê PDF diretamente) ─── */
      if (category === "pdf") {
        const sizeMB = formatBytes(file.size);
        uploadMutation.mutate({
          data: {
            transportadoraId: 1,
            tipo: "comprovante" as "cte",
            numeroCte: file.name.replace(/\.pdf$/i, ""),
            nomeDestinatario: "Documento PDF — verificação manual",
            cnpjDestinatario: "—",
            valorFrete: 0,
            cnpjEmissor: "—",
          }
        });
        const media: UploadedMedia = { category: "pdf", name: file.name, sizeMB };
        setResult({ kind: "media", data: media });
        setIsProcessing(false);
        return;
      }

      /* ── XML / TXT ──────────────────────────────────────────────── */
      const text = await readFileAsText(file);
      const parsed = parseXmlDocument(text);
      setIsProcessing(false);

      if (!parsed) {
        setParseError("Não foi possível extrair dados deste XML. Verifique se é um CT-e ou MDF-e válido.");
        return;
      }

      setResult({ kind: "xml", data: parsed });
      uploadMutation.mutate({
        data: {
          transportadoraId: 1,
          tipo: parsed.tipo === "CT-e" ? "cte" : "manifesto",
          xmlContent: text.slice(0, 50000),
          numeroCte: parsed.numeroCte,
          cnpjDestinatario: parsed.cnpjDestinatario,
          nomeDestinatario: parsed.nomeDestinatario,
          valorFrete: parsed.valorFrete,
          cnpjEmissor: parsed.cnpjEmissor,
        }
      });

    } catch {
      setIsProcessing(false);
      setParseError("Erro ao processar o arquivo. Verifique o formato e tente novamente.");
    }
  }, [uploadMutation]);

  const onDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const reset = () => { setResult(null); setParseError(null); };

  const showDropZone = !result;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground tracking-tight">Upload de Documentos</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Importe CT-e e MDF-e fiscais ou fotos de canhotos e notas — todos os formatos em um só lugar.
        </p>
      </div>

      {/* Upload card */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2 flex-wrap">
          <Package className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Importar Documento</h3>
          <div className="ml-auto flex items-center gap-1.5 flex-wrap">
            {FORMAT_CHIPS.map(({ label, color }) => (
              <span key={label} className={`text-[10px] px-2 py-0.5 rounded border font-medium ${color}`}>
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Drop zone */}
          {showDropZone && (
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => !isProcessing && fileRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-10 text-center transition-all duration-200 select-none ${
                isDragging
                  ? "border-primary bg-primary/5 scale-[1.005]"
                  : isProcessing
                    ? "border-border cursor-not-allowed"
                    : "border-border hover:border-primary/40 hover:bg-white/2 cursor-pointer"
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_EXT}
                className="hidden"
                onChange={onFileChange}
              />

              {!isProcessing ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-background flex items-center justify-center border border-border">
                    <UploadCloud className={`w-7 h-7 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Arraste o arquivo aqui ou clique para selecionar</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Documentos fiscais (XML), notas em PDF ou fotos de canhotos (JPG, PNG)
                    </p>
                  </div>
                  {/* Format indicator row */}
                  <div className="flex items-center gap-2 flex-wrap justify-center">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary/5 border border-primary/15">
                      <FileCode2 className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[11px] text-primary font-medium">CT-e / MDF-e</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-500/5 border border-red-500/15">
                      <FileText className="w-3.5 h-3.5 text-red-400" />
                      <span className="text-[11px] text-red-400 font-medium">PDF</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500/5 border border-amber-500/15">
                      <FileImage className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[11px] text-amber-400 font-medium">JPG / PNG</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <p className="text-sm text-foreground font-medium">Processando documento...</p>
                  <p className="text-xs text-muted-foreground">Aguarde um momento</p>
                </div>
              )}
            </div>
          )}

          {/* Erro de parse */}
          {parseError && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-destructive/30 bg-destructive/5">
              <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-destructive flex-1">{parseError}</p>
              <button onClick={reset} className="text-muted-foreground hover:text-foreground transition-colors">
                <XCircle className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Resultado XML extraído */}
          {result?.kind === "xml" && (
            <div className="border border-success/20 rounded-lg bg-success/3 overflow-hidden">
              <div className="px-4 py-3 border-b border-success/15 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <span className="text-sm font-semibold text-foreground">Dados Extraídos — {result.data.tipo}</span>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs border-border text-muted-foreground hover:text-foreground" onClick={reset}>
                  Novo Upload
                </Button>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { icon: Hash,        label: "Número CT-e",      value: result.data.numeroCte },
                  { icon: User,        label: "Destinatário",     value: result.data.nomeDestinatario },
                  { icon: FileCode2,   label: "CNPJ Destinatário",value: result.data.cnpjDestinatario },
                  { icon: DollarSign,  label: "Valor do Frete",   value: formatCurrency(result.data.valorFrete), highlight: true },
                  { icon: Calendar,    label: "Data de Emissão",  value: result.data.dataEmissao },
                  { icon: Hash,        label: "CNPJ Emissor",     value: result.data.cnpjEmissor },
                ].map(({ icon: Icon, label, value, highlight }) => (
                  <div key={label}>
                    <div className="flex items-center gap-1 mb-0.5">
                      <Icon className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
                    </div>
                    <p className={`text-sm font-medium font-mono ${highlight ? "text-success" : "text-foreground"}`}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resultado de imagem ou PDF */}
          {result?.kind === "media" && (
            <div className="border border-success/20 rounded-lg bg-success/3 overflow-hidden">
              <div className="px-4 py-3 border-b border-success/15 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <span className="text-sm font-semibold text-foreground">
                    {result.data.category === "image" ? "Imagem lida e salva" : "PDF salvo"} com sucesso
                  </span>
                  {result.data.category === "image" && result.data.ocr && (
                    <span className="flex items-center gap-1 text-[10px] text-primary bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5">
                      <Brain className="w-3 h-3" /> OCR IA
                    </span>
                  )}
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs border-border text-muted-foreground hover:text-foreground" onClick={reset}>
                  Novo Upload
                </Button>
              </div>

              <div className="p-4 flex items-start gap-4">
                {/* Thumbnail (imagem) ou ícone (PDF) */}
                {result.data.category === "image" && result.data.dataUrl ? (
                  <img
                    src={result.data.dataUrl}
                    alt="Preview do comprovante"
                    className="w-28 h-28 object-cover rounded-lg border border-border shrink-0"
                  />
                ) : (
                  <div className="w-28 h-28 rounded-lg border border-red-500/20 bg-red-500/5 flex items-center justify-center shrink-0">
                    <FileText className="w-10 h-10 text-red-400" />
                  </div>
                )}

                <div className="flex-1 min-w-0 space-y-3">
                  {/* Nome e tamanho */}
                  <div className="flex gap-4 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Arquivo</p>
                      <p className="text-xs font-medium text-foreground truncate font-mono">{result.data.name}</p>
                    </div>
                    <div className="shrink-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Tamanho</p>
                      <p className="text-xs font-medium text-foreground">{result.data.sizeMB}</p>
                    </div>
                  </div>

                  {/* OCR extraído */}
                  {result.data.ocr ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-border/50 pt-3">
                      <div>
                        <div className="flex items-center gap-1 mb-0.5">
                          <Scan className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Tipo detectado</span>
                        </div>
                        <p className="text-xs font-medium text-foreground capitalize">
                          {result.data.ocr.tipoDocumento.replace("_", " ")}
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-0.5">
                          <DollarSign className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Valor total</span>
                        </div>
                        <p className={`text-xs font-medium font-mono ${result.data.ocr.valorTotal ? "text-success" : "text-muted-foreground"}`}>
                          {result.data.ocr.valorTotal != null ? formatCurrency(result.data.ocr.valorTotal) : "Não encontrado"}
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-0.5">
                          <Hash className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">CNPJ</span>
                        </div>
                        <p className={`text-xs font-medium font-mono ${result.data.ocr.cnpj ? "text-foreground" : "text-muted-foreground"}`}>
                          {result.data.ocr.cnpj ?? "Não encontrado"}
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-0.5">
                          <Calendar className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Data</span>
                        </div>
                        <p className={`text-xs font-medium ${result.data.ocr.dataDocumento ? "text-foreground" : "text-muted-foreground"}`}>
                          {result.data.ocr.dataDocumento ?? "Não encontrada"}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <div className="flex items-center gap-1 mb-0.5">
                          <User className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Descrição</span>
                        </div>
                        <p className="text-xs font-medium text-foreground">{result.data.ocr.descricao}</p>
                      </div>
                      {result.data.ocr.enderecoEntrega && (
                        <div className="col-span-2 sm:col-span-3">
                          <div className="flex items-center gap-1 mb-0.5">
                            <MapPin className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Endereço de Entrega</span>
                          </div>
                          <p className="text-xs font-medium text-foreground">{result.data.ocr.enderecoEntrega}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-400/90 bg-amber-500/8 border border-amber-500/20 rounded px-2 py-1">
                      PDF salvo para análise manual — disponível na lista abaixo
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabela de documentos */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Documentos Processados</h3>
          {xmls?.length ? (
            <span className="text-[10px] text-muted-foreground">{xmls.length} registros</span>
          ) : null}
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="text-xs font-medium text-muted-foreground">Documento</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Destinatário / Descrição</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Valor</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Conciliação</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={5} className="py-8 text-center text-xs text-muted-foreground">Carregando...</TableCell>
              </TableRow>
            ) : !xmls?.length ? (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={5} className="py-10 text-center">
                  <AlertCircle className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhum documento processado. Faça o upload acima.</p>
                </TableCell>
              </TableRow>
            ) : (
              xmls.map((x) => {
                const isComprovante = x.tipo === "comprovante";
                return (
                  <TableRow key={x.id} className="border-border hover:bg-white/3 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <DocTypeIcon tipo={x.tipo} />
                        <div>
                          <p className="text-xs font-mono font-medium text-foreground uppercase">
                            {isComprovante ? "COMPROVANTE" : x.tipo.toUpperCase()}{x.numeroCte ? `: ${x.numeroCte}` : ""}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{formatDate(x.createdAt)}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs text-foreground">{x.nomeDestinatario ?? "—"}</p>
                      {!isComprovante && (
                        <p className="text-[10px] font-mono text-muted-foreground">{x.cnpjDestinatario ?? "—"}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-mono font-medium text-foreground">
                      {isComprovante ? (
                        <span className="text-muted-foreground text-[10px]">—</span>
                      ) : (
                        formatCurrency(x.valorFrete)
                      )}
                    </TableCell>
                    <TableCell>
                      {isComprovante ? (
                        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/25">
                          Análise Manual
                        </Badge>
                      ) : x.status === "conciliado" ? (
                        <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/25">
                          <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Conciliado
                        </Badge>
                      ) : x.status === "erro" ? (
                        <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/25">
                          <AlertCircle className="w-2.5 h-2.5 mr-1" /> Divergência
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">Pendente</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {x.status === "pendente" && !isComprovante && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
                          onClick={() => matchMutation.mutate({ id: x.id })}
                          disabled={matchMutation.isPending}
                        >
                          <LinkIcon className="w-3 h-3 mr-1.5" /> Conciliar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
