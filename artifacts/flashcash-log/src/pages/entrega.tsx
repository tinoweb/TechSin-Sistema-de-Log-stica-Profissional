import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "wouter";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import {
  MapPin, Camera, CheckCircle2, AlertCircle, Truck,
  Package, DollarSign, User, Hash, RefreshCw, Navigation,
  ExternalLink, Upload, X,
} from "lucide-react";

interface EntregaData {
  id: number;
  motoristaId?: number;
  motoristaNome?: string;
  clienteNome?: string;
  numeroNF?: string;
  origem?: string;
  destino?: string;
  valorFrete?: number;
  status: string;
}

type PageState = "loading" | "idle" | "sending" | "success" | "error";

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else        { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Entrega() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0");

  const [data, setData] = useState<EntregaData | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) { setPageState("error"); setErrorMsg("Link inválido."); return; }
    api.get<EntregaData>(`/viagens/${id}`)
      .then(d => { setData(d); setPageState("idle"); })
      .catch(() => { setPageState("error"); setErrorMsg("Entrega não encontrada."); });
  }, [id]);

  const handleFile = useCallback(async (file: File) => {
    try {
      const compressed = await compressImage(file);
      setPreview(compressed);
      setSelectedFile(file);
    } catch {
      setErrorMsg("Não foi possível ler a imagem. Tente novamente.");
    }
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const submitCanhoto = async () => {
    if (!data || !preview) return;
    setPageState("sending");
    try {
      await api.post(`/viagens/${id}/canhoto`, {
        fotoUrl: preview,
        numeroNF: data.numeroNF,
        assinaturaDetectada: true,
        capturedAt: new Date().toISOString(),
      });
      setPageState("success");
    } catch (e: any) {
      setPageState("error");
      setErrorMsg(e.message ?? "Erro ao enviar. Tente novamente.");
    }
  };

  const mapsUrl = data?.destino
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.destino)}`
    : null;

  /* ── Loading ── */
  if (pageState === "loading") {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-white/60">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
          <span className="text-sm">Carregando entrega...</span>
        </div>
      </div>
    );
  }

  /* ── Error ── */
  if (pageState === "error" && !data) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-5">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h2 className="text-white font-semibold text-lg">Erro</h2>
          <p className="text-white/50 text-sm mt-1">{errorMsg}</p>
        </div>
      </div>
    );
  }

  /* ── Success ── */
  if (pageState === "success") {
    return (
      <div className="min-h-screen bg-[#0B1120] flex flex-col items-center justify-center p-5">
        {/* Header strip */}
        <div className="w-full max-w-sm mb-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ background: "linear-gradient(135deg, #1D4ED8, #2563EB)" }}>
            TS
          </div>
          <div>
            <p className="text-xs text-white/40 leading-none">TechSin Logística</p>
            <p className="text-sm font-semibold leading-tight text-white">Comprovante de Entrega</p>
          </div>
        </div>

        <div className="text-center max-w-sm w-full">
          {/* Big green badge */}
          <div className="relative mx-auto mb-6 w-28 h-28">
            <div className="absolute inset-0 rounded-full bg-green-500/10 animate-ping" style={{ animationDuration: "2s" }} />
            <div className="relative w-28 h-28 rounded-full bg-green-500/15 border-2 border-green-500/40 flex items-center justify-center">
              <CheckCircle2 className="w-14 h-14 text-green-400" />
            </div>
          </div>

          {/* CONCLUÍDO headline */}
          <div className="mb-2">
            <span className="inline-block px-4 py-1 rounded-full text-xs font-bold tracking-widest uppercase bg-green-500/15 border border-green-500/30 text-green-400">
              CONCLUÍDO
            </span>
          </div>
          <h2 className="text-white font-extrabold text-2xl mt-2">Entrega Confirmada!</h2>
          <p className="text-white/50 text-sm mt-2 leading-relaxed">
            O canhoto foi enviado com sucesso.<br />A transportadora vai verificar e liberar o pagamento.
          </p>

          {/* NF box */}
          {data?.numeroNF && (
            <div className="mt-5 px-5 py-3 bg-white/5 rounded-xl border border-white/10 text-left">
              <span className="text-[10px] uppercase tracking-wider text-white/30">NF / CT-e</span>
              <p className="text-white font-mono font-semibold mt-0.5 break-all">{data.numeroNF}</p>
            </div>
          )}

          {/* Status timeline */}
          <div className="mt-5 space-y-2 text-left">
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-green-500/8 border border-green-500/20">
              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
              <p className="text-xs text-green-300 font-medium">Canhoto enviado ao sistema</p>
            </div>
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-white/4 border border-white/10">
              <RefreshCw className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-xs text-white/50">Aguardando aprovação da transportadora</p>
            </div>
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-white/4 border border-white/10">
              <Package className="w-4 h-4 text-white/25 shrink-0" />
              <p className="text-xs text-white/30">Faturamento e liberação do pagamento</p>
            </div>
          </div>

          <p className="text-xs text-white/20 mt-6">TechSin © 2026 — techsin.com.br</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1120] text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0B1120]/95 backdrop-blur border-b border-white/8 px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white"
          style={{ background: "linear-gradient(135deg, #1D4ED8, #2563EB)" }}>
          TS
        </div>
        <div>
          <p className="text-xs text-white/40 leading-none">TechSin Logística</p>
          <p className="text-sm font-semibold leading-tight">Comprovante de Entrega</p>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-4 pb-8">

        {/* NF badge */}
        <div className="bg-blue-600/10 border border-blue-500/20 rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Hash className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-blue-300/70 uppercase tracking-wider font-medium">Nota / CT-e</span>
          </div>
          <p className="text-2xl font-bold font-mono text-white">{data?.numeroNF ?? `#${id}`}</p>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/4 border border-white/8 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <User className="w-3.5 h-3.5 text-white/40" />
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Cliente</span>
            </div>
            <p className="text-sm font-medium text-white leading-tight">{data?.clienteNome ?? "—"}</p>
          </div>

          <div className="bg-white/4 border border-white/8 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="w-3.5 h-3.5 text-green-400/70" />
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Valor</span>
            </div>
            <p className="text-sm font-semibold text-green-400 leading-tight">
              {data?.valorFrete ? formatCurrency(data.valorFrete) : "—"}
            </p>
          </div>
        </div>

        {/* Origem → Destino */}
        <div className="bg-white/4 border border-white/8 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <Truck className="w-3.5 h-3.5 text-white/40 shrink-0" />
            <div>
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Origem</span>
              <p className="text-sm text-white font-medium leading-tight">{data?.origem ?? "—"}</p>
            </div>
          </div>
          <div className="border-l-2 border-dashed border-white/10 ml-[7px] pl-4 py-0.5">
            <span className="text-[10px] text-white/20">em trânsito</span>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Destino / Entrega</span>
              <p className="text-sm text-white font-medium leading-tight">{data?.destino ?? "—"}</p>
            </div>
          </div>
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
              <Button
                className="w-full h-9 text-xs font-medium gap-2 mt-1"
                style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", color: "#93C5FD" }}
              >
                <Navigation className="w-3.5 h-3.5" />
                Abrir no Google Maps
                <ExternalLink className="w-3 h-3 opacity-60" />
              </Button>
            </a>
          )}
        </div>

        {/* Upload do canhoto */}
        <div className="bg-white/4 border border-white/8 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-white/60" />
            <h3 className="text-sm font-semibold">Foto do Canhoto Assinado</h3>
          </div>
          <p className="text-xs text-white/40 leading-relaxed">
            Após a entrega, tire uma foto do canhoto com a assinatura do destinatário e envie aqui.
          </p>

          {preview ? (
            <div className="relative">
              <img src={preview} alt="Canhoto" className="w-full rounded-lg object-cover max-h-52 border border-white/10" />
              <button
                onClick={() => { setPreview(null); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-28 rounded-lg border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-2 hover:border-blue-500/40 hover:bg-blue-500/5 transition-colors"
            >
              <Camera className="w-7 h-7 text-white/30" />
              <span className="text-xs text-white/40">Toque para tirar foto ou escolher da galeria</span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onFileChange}
            className="hidden"
          />

          {preview && (
            <Button
              onClick={submitCanhoto}
              disabled={pageState === "sending"}
              className="w-full h-11 font-semibold text-sm gap-2"
              style={{ background: "linear-gradient(135deg, #16a34a, #4ADE80)", color: "#000" }}
            >
              {pageState === "sending"
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Enviando...</>
                : <><Upload className="w-4 h-4" /> Confirmar Entrega</>
              }
            </Button>
          )}

          {pageState === "error" && errorMsg && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {errorMsg}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-white/20 pb-2">TechSin © 2026 — techsin.com.br</p>
      </div>
    </div>
  );
}
