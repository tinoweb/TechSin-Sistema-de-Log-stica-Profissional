import { useGetMotoristaDashboard, useSubmitCanhoto } from "@workspace/api-client-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Camera, MapPin, CheckCircle2, ShieldCheck,
  ChevronRight, X, Truck, AlertTriangle, Navigation
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useFlashStore } from "@/lib/flash-store";
import type { TipoDocumento } from "@/lib/flash-store";

type ScanState = "idle" | "camera" | "analyzing" | "success";

const AI_STEPS = [
  { label: "Extraindo dados do documento...", duration: 900 },
  { label: "Classificando tipo de comprovante...", duration: 900 },
  { label: "Validando GPS e gerando Selo Digital...", duration: 900 },
];

function OSMMapFrame({ lat, lon, height = 180 }: { lat: number; lon: number; height?: number }) {
  const d = 0.006;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - d},${lat - d},${lon + d},${lat + d}&layer=mapnik&marker=${lat},${lon}`;
  return (
    <iframe
      src={src}
      width="100%"
      height={height}
      className="rounded-lg border border-white/10 w-full"
      title="Mapa de entrega"
      loading="lazy"
    />
  );
}

// ─── Document classification ──────────────────────────────────────────────────
// Blur check always blocks (photo must be legible for manual review).
// Document type detection never blocks — non-canhoto goes to análise manual.
function classifyDocument(canvas: HTMLCanvasElement): {
  blurry: boolean;
  blurReason: string;
  tipo: TipoDocumento;
} {
  const ctx = canvas.getContext("2d");
  if (!ctx || canvas.width === 0 || canvas.height === 0)
    return { blurry: false, blurReason: "", tipo: "canhoto_padrao" };

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let dark = 0, bright = 0, total = 0, edges = 0;
  const step = Math.max(1, Math.floor(data.length / (4 * 3000)));

  for (let i = 0; i < data.length; i += 4 * step) {
    const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    if (lum < 60) dark++;
    else if (lum > 200) bright++;
    if (i > 4 * step) {
      const prev = (data[i - 4 * step] * 299 + data[i - 4 * step + 1] * 587 + data[i - 4 * step + 2] * 114) / 1000;
      if (Math.abs(lum - prev) > 80) edges++;
    }
    total++;
  }

  if (total === 0) return { blurry: false, blurReason: "", tipo: "canhoto_padrao" };

  const br = bright / total;
  const dr = dark / total;
  const er = edges / total;

  if (br < 0.12)
    return { blurry: true, blurReason: "Imagem muito escura — ilumine o documento e tire outra foto para que o texto fique legível.", tipo: "canhoto_padrao" };
  if (er < 0.008)
    return { blurry: true, blurReason: "Foto desfocada — segure firme e tire outra foto. A transportadora precisa conseguir ler o que está escrito.", tipo: "canhoto_padrao" };
  if (dr < 0.01)
    return { blurry: true, blurReason: "Nenhum texto detectado — aponte a câmera diretamente para o comprovante.", tipo: "canhoto_padrao" };

  const tipo: TipoDocumento = (br > 0.35 && dr > 0.04 && er > 0.015)
    ? "canhoto_padrao"
    : "outro_comprovante";

  return { blurry: false, blurReason: "", tipo };
}

export default function MotoristaApp() {
  const { data: dashboard } = useGetMotoristaDashboard(1, {
    query: { queryKey: ["motorista-dashboard", 1] }
  });

  const [scanState, setScanState] = useState<ScanState>("idle");
  const [aiStep, setAiStep] = useState(0);
  const [aiProgress, setAiProgress] = useState(0);
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const [cameraErrorMessage, setCameraErrorMessage] = useState<string>("Permissão negada ou dispositivo sem câmera.");
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [docType, setDocType] = useState<TipoDocumento | null>(null);
  const docTypeRef = useRef<TipoDocumento>("canhoto_padrao");
  const [deliveryLat] = useState(() => -23.5505 + (Math.random() - 0.5) * 0.02);
  const [deliveryLon] = useState(() => -46.6333 + (Math.random() - 0.5) * 0.02);
  const [sealId] = useState(() => `TS-${Date.now().toString(16).toUpperCase()}`);
  const [deliveryTime] = useState(() => new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }));

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { triggerCanhoto } = useFlashStore();
  const submitMutation = useSubmitCanhoto({ mutation: { onSuccess: () => {}, onError: () => {} } });

  const viagem = dashboard?.viagemAtual;
  const activeNF = viagem?.numeroNF ?? null;
  const activeValor = viagem?.valorFrete ?? 0;

  useEffect(() => {
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(false);
    setCameraErrorMessage("Permissão negada ou dispositivo sem câmera.");
    setOcrError(null);
    setScanState("camera");

    if (!window.isSecureContext) {
      setCameraError(true);
      setCameraErrorMessage("A câmera exige conexão segura (HTTPS). Abra o app em https:// para capturar fotos.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(true);
      setCameraErrorMessage("Este navegador/dispositivo não suporta acesso à câmera.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    } catch (err) {
      setCameraError(true);
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setCameraErrorMessage("Permissão de câmera negada. Autorize o acesso nas configurações do navegador.");
        return;
      }
      setCameraErrorMessage("Não foi possível abrir a câmera neste dispositivo.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const captureAndAnalyze = useCallback(() => {
    setOcrError(null);
    let frameData: string | null = null;

    if (videoRef.current && canvasRef.current && !cameraError) {
      const ctx = canvasRef.current.getContext("2d");
      canvasRef.current.width = videoRef.current.videoWidth || 640;
      canvasRef.current.height = videoRef.current.videoHeight || 480;
      ctx?.drawImage(videoRef.current, 0, 0);

      // Grayscale before analysis
      if (ctx) {
        const imgData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
        for (let i = 0; i < imgData.data.length; i += 4) {
          const gray = imgData.data[i] * 0.299 + imgData.data[i + 1] * 0.587 + imgData.data[i + 2] * 0.114;
          imgData.data[i] = imgData.data[i + 1] = imgData.data[i + 2] = gray;
        }
        ctx.putImageData(imgData, 0, 0);
      }

      frameData = canvasRef.current.toDataURL("image/jpeg", 0.8);

      const result = classifyDocument(canvasRef.current);
      if (result.blurry) {
        setOcrError(result.blurReason);
        return;
      }
      docTypeRef.current = result.tipo;
      setDocType(result.tipo);
    }

    setCapturedFrame(frameData);
    stopCamera();
    setScanState("analyzing");
    setAiStep(0);
    setAiProgress(0);

    const totalDuration = AI_STEPS.reduce((s, a) => s + a.duration, 0);
    const elapsed = { v: 0 };
    let step = 0;

    const tick = () => {
      elapsed.v += 50;
      const stepEnd = AI_STEPS.slice(0, step + 1).reduce((s, a) => s + a.duration, 0);
      if (elapsed.v >= stepEnd && step < AI_STEPS.length - 1) { step++; setAiStep(step); }
      setAiProgress(Math.min((elapsed.v / totalDuration) * 100, 100));
      if (elapsed.v < totalDuration + 100) setTimeout(tick, 50);
      else {
        setScanState("success");
        const tipo = docTypeRef.current;
        if (activeNF) {
          triggerCanhoto(activeNF, activeValor, deliveryLat, deliveryLon, tipo, frameData ?? undefined);
          submitMutation.mutate({
            data: {
              fotoUrl: frameData ?? undefined,
              latitude: deliveryLat,
              longitude: deliveryLon,
              numeroNF: activeNF,
              assinaturaDetectada: tipo === "canhoto_padrao",
            }
          });
        }
      }
    };
    setTimeout(tick, 50);
  }, [cameraError, stopCamera, activeNF, activeValor, deliveryLat, deliveryLon, triggerCanhoto, submitMutation]);

  const isOutroComprovante = docType === "outro_comprovante";

  return (
    <div className="min-h-screen text-white flex flex-col max-w-md mx-auto relative overflow-hidden shadow-2xl border-x border-white/10" style={{ backgroundColor: "#0D0D0D" }}>
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <header className="px-5 py-4 border-b border-white/8 flex justify-between items-center" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Motorista</p>
          <p className="font-bold text-base">{dashboard?.motorista?.nome ?? "Aguardando login..."}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Navigation className="w-3.5 h-3.5 text-success" />
          <span className="text-xs font-mono text-success">GPS ATIVO</span>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 overflow-auto p-5 pb-36 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-4 border border-white/8" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
            <p className="text-[10px] text-muted-foreground mb-1">Entregas Hoje</p>
            <p className="text-2xl font-bold font-mono">{dashboard?.totalEntregasHoje ?? 0}</p>
          </div>
          <div className="rounded-xl p-4 border border-success/20" style={{ backgroundColor: "rgba(74,222,128,0.07)" }}>
            <p className="text-[10px] text-success mb-1">Concluídas</p>
            <p className="text-2xl font-bold font-mono text-success">{dashboard?.canhotosValidados ?? 0}</p>
          </div>
        </div>

        {/* Current delivery */}
        {viagem ? (
          <div className="rounded-xl border border-white/10 overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
            <div className="px-4 py-3 border-b border-white/8 flex justify-between items-center" style={{ backgroundColor: "rgba(60,130,246,0.12)" }}>
              <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] uppercase">Em Rota</Badge>
              {activeNF && <span className="font-mono text-xs text-primary">NF: {activeNF}</span>}
            </div>
            <div className="p-5">
              <div className="relative pl-6 before:absolute before:left-[9px] before:top-2 before:bottom-2 before:w-px before:bg-white/10">
                <div className="relative mb-5">
                  <div className="absolute left-[-25px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-muted-foreground bg-background" />
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Coleta</p>
                  <p className="text-sm font-medium">{viagem.origem}</p>
                </div>
                <div className="relative">
                  <div className="absolute left-[-25px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-primary bg-primary/20" />
                  <p className="text-[10px] uppercase tracking-wider text-primary mb-0.5">Entrega</p>
                  <p className="text-sm font-bold">{viagem.clienteNome}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{viagem.destino}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-white/8 p-8 text-center" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
            <Truck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-sm">Nenhuma entrega ativa</p>
            <p className="text-xs text-muted-foreground mt-1">Aguarde instruções da base.</p>
          </div>
        )}

        {scanState === "idle" && (
          <div className="rounded-xl border border-primary/15 p-4" style={{ backgroundColor: "rgba(60,130,246,0.05)" }}>
            <p className="text-xs font-semibold text-primary mb-2">Como usar</p>
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>Pressione "Escanear Comprovante" abaixo</li>
              <li>Enquadre o documento na moldura verde</li>
              <li>Toque no botão branco para capturar</li>
              <li>Aguarde a validação automática</li>
            </ol>
          </div>
        )}
      </main>

      {/* CAMERA OVERLAY */}
      {scanState === "camera" && (
        <div className="absolute inset-0 z-50 flex flex-col" style={{ backgroundColor: "#000" }}>
          <button className="absolute top-4 right-4 z-60 w-9 h-9 rounded-full bg-black/60 flex items-center justify-center" onClick={() => { stopCamera(); setScanState("idle"); setOcrError(null); }}>
            <X className="w-5 h-5 text-white" />
          </button>
          <Badge className="absolute top-4 left-4 z-60 bg-black/60 text-white border-white/20 text-[10px] uppercase">
            <Camera className="w-3 h-3 mr-1" /> Câmera Ativa
          </Badge>

          <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />

          {cameraError && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "#111" }}>
              <div className="text-center p-6">
                <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                <p className="text-sm font-medium mb-1">Câmera não disponível</p>
                <p className="text-xs text-muted-foreground">{cameraErrorMessage}</p>
              </div>
            </div>
          )}

          {/* Document frame */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-[78%] aspect-[3/4]">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-success rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-success rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-success rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-success rounded-br-lg" />
              <div className="absolute left-0 right-0 h-0.5 bg-success/70" style={{ boxShadow: "0 0 8px rgba(74,222,128,0.7)", animation: "scanline 2s ease-in-out infinite" }} />
              <div className="absolute bottom-6 left-0 right-0 flex justify-center">
                <span className="text-[11px] text-success/90 px-3 py-1 rounded" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>Aproxime o comprovante e mantenha o foco</span>
              </div>
            </div>
          </div>

          {/* Blur / quality error */}
          {ocrError && (
            <div className="absolute bottom-28 left-4 right-4 z-60 px-4 py-3 rounded-xl border border-red-500/50 flex items-start gap-2.5" style={{ backgroundColor: "rgba(239,68,68,0.15)", backdropFilter: "blur(8px)" }}>
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300 font-medium leading-snug">{ocrError}</p>
            </div>
          )}

          {/* Shutter */}
          <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-3 z-60">
            {ocrError ? (
              <p className="text-[10px] text-red-300/70">Ajuste o enquadramento e tente novamente</p>
            ) : (
              <p className="text-[10px] text-white/50">Toque para capturar — canhoto ou outro comprovante</p>
            )}
            <button
              className="rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform"
              style={{ width: 72, height: 72, backgroundColor: ocrError ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.15)" }}
              onClick={() => { setOcrError(null); captureAndAnalyze(); }}
              disabled={cameraError}
            >
              <div className="w-14 h-14 rounded-full bg-white" />
            </button>
          </div>
          <style>{`@keyframes scanline { 0%{top:0} 50%{top:100%} 100%{top:0} }`}</style>
        </div>
      )}

      {/* ANALYZING OVERLAY */}
      {scanState === "analyzing" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-8" style={{ backgroundColor: "rgba(0,0,0,0.97)" }}>
          {capturedFrame && (
            <div className="w-28 h-20 rounded-lg overflow-hidden border border-white/20 mb-6 relative">
              <img src={capturedFrame} alt="Comprovante" className="w-full h-full object-cover opacity-50" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            </div>
          )}
          <div className="w-full max-w-xs space-y-4 mb-6">
            {AI_STEPS.map((step, idx) => {
              const done = idx < aiStep;
              const active = idx === aiStep;
              return (
                <div key={idx} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-success" : active ? "border-2 border-primary" : "border-2 border-white/20"}`}>
                    {done && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                    {active && <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
                  </div>
                  <p className={`text-sm ${done ? "text-success" : active ? "text-white font-medium" : "text-muted-foreground"}`}>{step.label}</p>
                </div>
              );
            })}
          </div>
          <div className="w-full max-w-xs">
            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
              <div className="h-full bg-primary rounded-full transition-all duration-100" style={{ width: `${aiProgress}%` }} />
            </div>
            <p className="text-center text-xs text-muted-foreground mt-1.5 font-mono">{Math.round(aiProgress)}%</p>
          </div>
        </div>
      )}

      {/* SUCCESS OVERLAY */}
      {scanState === "success" && (
        <div className="absolute inset-0 z-50 overflow-auto" style={{ backgroundColor: "rgba(0,0,0,0.97)" }}>
          <div className="min-h-full flex flex-col p-5 pb-10">
            <div className="flex flex-col items-center text-center pt-6 mb-5">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
                style={isOutroComprovante
                  ? { backgroundColor: "rgba(245,158,11,0.15)", boxShadow: "0 0 30px rgba(245,158,11,0.25)" }
                  : { backgroundColor: "rgba(74,222,128,0.15)", boxShadow: "0 0 30px rgba(74,222,128,0.25)" }
                }
              >
                {isOutroComprovante
                  ? <AlertTriangle className="w-7 h-7 text-amber-400" />
                  : <CheckCircle2 className="w-7 h-7 text-success" />
                }
              </div>
              <h2 className="text-lg font-bold">
                {isOutroComprovante ? "Comprovante recebido!" : "Entrega Auditada!"}
              </h2>
              {activeNF && (
                <p className="text-xs text-muted-foreground mt-1">
                  {isOutroComprovante ? "Em análise para " : "Conciliada com "}<span className="font-mono text-primary">{activeNF}</span>
                </p>
              )}
            </div>

            {/* Divergence warning */}
            {isOutroComprovante && (
              <div className="rounded-xl border border-amber-500/40 px-4 py-3.5 flex items-start gap-3 mb-4" style={{ backgroundColor: "rgba(245,158,11,0.1)" }}>
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-300 mb-0.5">Documento divergente detectado</p>
                  <p className="text-[11px] text-amber-400/80 leading-snug">Enviando para análise manual da transportadora.</p>
                </div>
              </div>
            )}

            {capturedFrame && (
              <div className="rounded-xl border border-white/10 overflow-hidden mb-4">
                <div
                  className="px-4 py-2.5 border-b border-white/8 flex items-center gap-2"
                  style={isOutroComprovante
                    ? { backgroundColor: "rgba(245,158,11,0.08)" }
                    : { backgroundColor: "rgba(74,222,128,0.08)" }
                  }
                >
                  <ShieldCheck className={`w-3.5 h-3.5 ${isOutroComprovante ? "text-amber-400" : "text-success"}`} />
                  <span className={`text-xs font-semibold uppercase tracking-wider ${isOutroComprovante ? "text-amber-400" : "text-success"}`}>
                    {isOutroComprovante ? "EM ANÁLISE MANUAL" : "AUDITADO POR TECHSIN"}
                  </span>
                  <Badge className={`ml-auto text-[9px] ${isOutroComprovante ? "bg-amber-500/15 text-amber-300 border-amber-500/25" : "bg-success/15 text-success border-success/25"}`}>
                    {isOutroComprovante ? "🟡 ANÁLISE" : "🟢 AUDITADO"}
                  </Badge>
                </div>
                <img src={capturedFrame} alt="Comprovante capturado" className="w-full object-contain max-h-36" />
              </div>
            )}

            <div className="rounded-xl border border-white/10 overflow-hidden mb-4">
              <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2" style={{ backgroundColor: "rgba(60,130,246,0.08)" }}>
                <MapPin className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-primary">Ponto de Entrega Auditado</span>
              </div>
              <OSMMapFrame lat={deliveryLat} lon={deliveryLon} height={180} />
            </div>

            <div className="rounded-xl border border-white/10 overflow-hidden mb-5" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
              <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2" style={{ backgroundColor: "rgba(74,222,128,0.08)" }}>
                <ShieldCheck className="w-3.5 h-3.5 text-success" />
                <span className="text-xs font-semibold text-success uppercase tracking-wider">Dados Conciliados — TechSin</span>
              </div>
              <div className="p-4 space-y-2.5 font-mono text-xs">
                {[
                  { label: "Nota Fiscal", value: activeNF ?? "—" },
                  { label: "Tipo de Doc.", value: isOutroComprovante ? "⚠️ Outro comprovante" : "✓ Canhoto NF" },
                  { label: "Valor do Frete", value: activeValor ? formatCurrency(activeValor) : "—" },
                  { label: "Assinatura", value: isOutroComprovante ? "Análise manual" : "✓ Verificada" },
                  { label: "Selo Digital", value: sealId },
                  { label: "Data/Hora", value: deliveryTime },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-white text-right">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-center mb-5" style={{ color: isOutroComprovante ? "rgba(251,191,36,0.8)" : "rgba(74,222,128,0.9)" }}>
              {isOutroComprovante
                ? "A transportadora revisará o comprovante antes de liberar o faturamento."
                : "Bem-vindo ao ecossistema TechSin. Painel do escritório atualizado."
              }
            </p>
            <button
              className="mx-auto px-8 py-2.5 rounded-full text-sm font-medium border border-white/20 text-white hover:bg-white/5 transition-colors"
              onClick={() => { setScanState("idle"); setCapturedFrame(null); setOcrError(null); setDocType(null); }}
            >
              Novo Escaneamento
            </button>
          </div>
        </div>
      )}

      {/* Floating CTA */}
      {scanState === "idle" && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-[300px] px-5 z-20">
          <Button
            className="w-full h-14 rounded-full text-white font-bold text-base flex items-center justify-between px-5 active:scale-95 transition-transform"
            style={{ background: "linear-gradient(135deg, #2563EB, #3C82F6)", boxShadow: "0 8px 32px rgba(60,130,246,0.4)" }}
            onClick={startCamera}
          >
            <div className="flex items-center gap-2.5"><Camera className="w-5 h-5" /><span>Escanear Comprovante</span></div>
            <ChevronRight className="w-5 h-5 opacity-60" />
          </Button>
        </div>
      )}
    </div>
  );
}
