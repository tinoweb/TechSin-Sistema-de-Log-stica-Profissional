import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Camera, Navigation, CheckCircle2, AlertTriangle,
  ChevronRight, X, ShieldCheck, MapPin, Truck, Clock, Package,
  Lightbulb, Send
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { TipoDocumento } from "@/lib/flash-store";

interface Motorista { id: number; nome: string; status: string; }
interface Viagem {
  id: number; numeroNF?: string; origem?: string; destino?: string;
  valorFrete?: number; status: string; clienteId?: number;
  enderecoLat?: number | null; enderecoLon?: number | null;
  _distKm?: number;
}

type ScanTarget = { viagemId: number; nf: string } | null;
type ScanState = "idle" | "camera" | "analyzing" | "success";

const AI_STEPS = [
  "Capturando localização GPS...",
  "Lendo dados do documento...",
  "Classificando tipo de comprovante...",
  "Verificando assinatura e carimbo...",
  "Gerando Selo Digital TechSin...",
];

function haversinKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const OFFLINE_QUEUE_KEY = "techsin_offline_queue";
type OfflineItem = { viagemId: number; nf: string; payload: Record<string, unknown>; ts: number };

// ─── Document classification ──────────────────────────────────────────────────
// Separates blur check (always blocks) from document type detection (never blocks).
// A blurry photo is rejected regardless of document type because the transportadora
// must be able to read whatever text is on the comprovante for manual review.
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

  // ── Blur / darkness checks — always block, any document type ──
  if (br < 0.12)
    return { blurry: true, blurReason: "Imagem muito escura — ilumine o documento e tire outra foto para que o texto fique legível.", tipo: "canhoto_padrao" };
  if (er < 0.008)
    return { blurry: true, blurReason: "Foto desfocada — segure firme e tire outra foto. A transportadora precisa conseguir ler o que está escrito.", tipo: "canhoto_padrao" };
  if (dr < 0.01)
    return { blurry: true, blurReason: "Nenhum texto detectado — aponte a câmera diretamente para o comprovante.", tipo: "canhoto_padrao" };

  // ── Type classification — only when image is sharp enough ──
  // Standard NF canhoto: white paper (br>0.35), dense ink (dr>0.04), rich edge density (er>0.015)
  const tipo: TipoDocumento = (br > 0.35 && dr > 0.04 && er > 0.015)
    ? "canhoto_padrao"
    : "outro_comprovante";

  return { blurry: false, blurReason: "", tipo };
}

export default function DriveApp() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [motorista, setMotorista] = useState<Motorista | null>(null);
  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [driverPos, setDriverPos] = useState<{ lat: number; lon: number } | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState<OfflineItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) ?? "[]"); } catch { return []; }
  });

  const [scanTarget, setScanTarget] = useState<ScanTarget>(null);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [aiStep, setAiStep] = useState(0);
  const [aiProgress, setAiProgress] = useState(0);
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const [cameraErrorMessage, setCameraErrorMessage] = useState<string>("Permissão negada ou dispositivo sem câmera.");
  const [sealId, setSealId] = useState("");
  const [completedNFs, setCompletedNFs] = useState<Set<number>>(new Set());
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [scanGps, setScanGps] = useState<{ lat: number; lon: number } | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  // docType drives success screen UI; ref ensures finishScan (called via setTimeout) sees the current value
  const [docType, setDocType] = useState<TipoDocumento | null>(null);
  const docTypeRef = useRef<TipoDocumento>("canhoto_padrao");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const onOnline = () => { setIsOnline(true); replayOfflineQueue(); };
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        setDriverPos({ lat, lon });
        setViagens(prev => {
          const sorted = prev.map(v => ({
            ...v,
            _distKm: v.enderecoLat && v.enderecoLon
              ? haversinKm(lat, lon, v.enderecoLat, v.enderecoLon)
              : Infinity,
          })).sort((a, b) => (a._distKm ?? Infinity) - (b._distKm ?? Infinity));
          return sorted;
        });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [motorista]);

  const replayOfflineQueue = useCallback(async () => {
    const queue: OfflineItem[] = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) ?? "[]");
    if (queue.length === 0) return;
    const remaining: OfflineItem[] = [];
    for (const item of queue) {
      try {
        await api.post(`/viagens/${item.viagemId}/canhoto`, item.payload);
        setCompletedNFs(prev => { const s = new Set(prev); s.add(item.viagemId); return s; });
      } catch {
        remaining.push(item);
      }
    }
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
    setOfflineQueue(remaining);
  }, []);

  useEffect(() => {
    api.get<{ motorista: Motorista; viagens: Viagem[] }>(`/motoristas/by-token/${token}`)
      .then(d => { setMotorista(d.motorista); setViagens(d.viagens); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  const openCamera = useCallback(async (viagem: Viagem) => {
    setScanTarget({ viagemId: viagem.id, nf: viagem.numeroNF ?? "—" });
    setCameraError(false);
    setCameraErrorMessage("Permissão negada ou dispositivo sem câmera.");
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
    setTorchOn(false);
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch { /* device does not support torch */ }
  }, [torchOn]);

  const captureAndAnalyze = useCallback(() => {
    setOcrError(null);
    const captureTs = new Date().toISOString();
    setCapturedAt(captureTs);

    let frameData: string | null = null;

    if (videoRef.current && canvasRef.current && !cameraError) {
      const ctx = canvasRef.current.getContext("2d");
      canvasRef.current.width = videoRef.current.videoWidth || 640;
      canvasRef.current.height = videoRef.current.videoHeight || 480;
      ctx?.drawImage(videoRef.current, 0, 0);

      // Grayscale conversion before analysis — reduces shadow/reflection noise
      if (ctx) {
        const imgData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
        for (let i = 0; i < imgData.data.length; i += 4) {
          const gray = imgData.data[i] * 0.299 + imgData.data[i + 1] * 0.587 + imgData.data[i + 2] * 0.114;
          imgData.data[i] = imgData.data[i + 1] = imgData.data[i + 2] = gray;
        }
        ctx.putImageData(imgData, 0, 0);
      }

      frameData = canvasRef.current.toDataURL("image/jpeg", 0.85);

      // ── Classify document ──
      // Blur → block (must retake photo regardless of document type).
      // Non-canhoto → allow, but flag for manual review by transportadora.
      const result = classifyDocument(canvasRef.current);
      if (result.blurry) {
        setOcrError(result.blurReason);
        setCapturedAt(null);
        return;
      }
      // Store via ref so finishScan (called via setTimeout) sees the current value
      docTypeRef.current = result.tipo;
      setDocType(result.tipo);
    }

    setCapturedFrame(frameData);
    stopCamera();
    setScanState("analyzing");
    setAiStep(0);
    setAiProgress(0);

    const totalMs = AI_STEPS.length * 800;
    const elapsed = { v: 0 };
    const tick = () => {
      elapsed.v += 60;
      setAiStep(Math.min(Math.floor(elapsed.v / 800), AI_STEPS.length - 1));
      setAiProgress(Math.min((elapsed.v / totalMs) * 100, 100));
      if (elapsed.v < totalMs + 100) setTimeout(tick, 60);
      else finishScan();
    };
    setTimeout(tick, 60);
  }, [cameraError, stopCamera]);

  const finishScan = useCallback(() => {
    if (!scanTarget) return;
    const seal = `TS-${Date.now().toString(16).toUpperCase()}`;
    setSealId(seal);
    setScanState("success");
    setCompletedNFs(prev => new Set([...prev, scanTarget.viagemId]));

    const getGPS = (): Promise<{ lat: number; lon: number }> => new Promise((resolve) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
          () => resolve(driverPos ?? { lat: -23.5505, lon: -46.6333 }),
          { timeout: 5000 }
        );
      } else {
        resolve(driverPos ?? { lat: -23.5505, lon: -46.6333 });
      }
    });

    getGPS().then(({ lat, lon }) => {
      setScanGps({ lat, lon });
      const payload = {
        fotoUrl: capturedFrame ?? undefined,
        latitude: lat,
        longitude: lon,
        numeroNF: scanTarget.nf,
        assinaturaDetectada: true,
        capturedAt: capturedAt ?? new Date().toISOString(),
        tipoDocumento: docTypeRef.current,
      };

      if (!navigator.onLine) {
        const item: OfflineItem = { viagemId: scanTarget.viagemId, nf: scanTarget.nf, payload, ts: Date.now() };
        const queue: OfflineItem[] = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) ?? "[]");
        queue.push(item);
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
        setOfflineQueue(queue);
      } else {
        api.post(`/viagens/${scanTarget.viagemId}/canhoto`, payload).catch(() => {});
      }
    });
  }, [scanTarget, capturedFrame, capturedAt, driverPos]);

  const resetScan = useCallback(() => {
    setScanState("idle");
    setScanTarget(null);
    setCapturedFrame(null);
    setCameraError(false);
    setDocType(null);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0D0D0D" }}>
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Verificando seu link...</p>
        </div>
      </div>
    );
  }

  if (error || !motorista) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "#0D0D0D" }}>
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-base font-bold text-foreground mb-2">Link Inválido</h2>
          <p className="text-sm text-muted-foreground">{error ?? "Este link de motorista não existe."}</p>
        </div>
      </div>
    );
  }

  const pendentes = viagens.filter(v => !completedNFs.has(v.id) && ["pendente", "em_transito", "entregue"].includes(v.status));
  const concluidas = viagens.filter(v => completedNFs.has(v.id));
  const isOutroComprovante = docType === "outro_comprovante";

  return (
    <div className="min-h-screen text-white flex flex-col max-w-md mx-auto relative overflow-hidden border-x border-white/8" style={{ backgroundColor: "#0D0D0D" }}>
      <canvas ref={canvasRef} className="hidden" />

      {/* PWA-style header */}
      <header className="px-5 py-4 border-b border-white/8 flex items-center justify-between sticky top-0 z-10" style={{ backgroundColor: "rgba(13,13,13,0.95)", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
            <Truck className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold">{motorista.nome}</p>
            <div className="flex items-center gap-2">
              {driverPos ? (
                <span className="flex items-center gap-1 text-[10px] text-success">
                  <Navigation className="w-2.5 h-2.5" /> GPS ATIVO
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Navigation className="w-2.5 h-2.5" /> Localiz...
                </span>
              )}
              {!isOnline && (
                <span className="flex items-center gap-1 text-[10px] text-amber-400 font-semibold">
                  · OFFLINE
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">{new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}</p>
          <p className="text-xs font-mono text-foreground">{new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 p-4 space-y-4 pb-20 overflow-auto">
        {/* Progress summary */}
        <div className="rounded-xl border border-white/8 p-4" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-foreground">Progresso do Dia</p>
            <p className="text-xs text-success font-mono">{concluidas.length}/{viagens.length} entregas</p>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
            <div className="h-full bg-success rounded-full transition-all duration-500" style={{ width: `${viagens.length ? (concluidas.length / viagens.length) * 100 : 0}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
            <span>{concluidas.length} concluídas</span>
            <span>{pendentes.length} pendentes</span>
          </div>
        </div>

        {/* Offline queue notice */}
        {offlineQueue.length > 0 && isOnline && (
          <div className="rounded-xl border border-amber-500/30 px-4 py-3 flex items-center gap-3" style={{ backgroundColor: "rgba(245,158,11,0.08)" }}>
            <span className="text-amber-400 text-lg">⚠️</span>
            <div className="flex-1">
              <p className="text-xs font-semibold text-amber-300">{offlineQueue.length} envio{offlineQueue.length > 1 ? "s" : ""} pendente{offlineQueue.length > 1 ? "s" : ""} offline</p>
              <p className="text-[10px] text-amber-400/70 mt-0.5">Sincronizando com o servidor...</p>
            </div>
          </div>
        )}
        {!isOnline && (
          <div className="rounded-xl border border-amber-500/30 px-4 py-3 flex items-center gap-3" style={{ backgroundColor: "rgba(245,158,11,0.08)" }}>
            <span className="text-amber-400 text-lg">📶</span>
            <div>
              <p className="text-xs font-semibold text-amber-300">Sem conexão</p>
              <p className="text-[10px] text-amber-400/70 mt-0.5">Os dados são salvos e enviados quando a internet retornar.</p>
            </div>
          </div>
        )}

        {/* Pending deliveries */}
        {pendentes.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Entregas Pendentes</p>
              {driverPos && <p className="text-[10px] text-primary">📍 Ordenado por proximidade</p>}
            </div>
            {pendentes.map(v => (
              <div key={v.id} className="rounded-xl border border-white/10 overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                <div className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Package className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="text-xs font-mono font-bold text-primary">{v.numeroNF ?? `Viagem #${v.id}`}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{v.destino ?? "Destino não definido"}</p>
                      {v.valorFrete && <p className="text-xs font-semibold text-success mt-1">{formatCurrency(v.valorFrete)}</p>}
                    </div>
                    <Badge className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/25 shrink-0">
                      <Clock className="w-2.5 h-2.5 mr-1" /> Pendente
                    </Badge>
                  </div>
                  {v.origem && v.destino && (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-3">
                      <MapPin className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{v.origem} → {v.destino}</span>
                    </div>
                  )}
                  <Button
                    className="w-full h-10 text-sm font-semibold rounded-lg flex items-center justify-between px-4"
                    style={{ background: "linear-gradient(135deg, #2563EB, #3C82F6)" }}
                    onClick={() => openCamera(v)}
                  >
                    <div className="flex items-center gap-2"><Camera className="w-4 h-4" /> Escanear Comprovante</div>
                    <ChevronRight className="w-4 h-4 opacity-60" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Completed */}
        {concluidas.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">Concluídas Hoje</p>
            {concluidas.map(v => (
              <div key={v.id} className="rounded-xl border border-success/15 px-4 py-3 flex items-center gap-3" style={{ backgroundColor: "rgba(74,222,128,0.05)" }}>
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono font-medium text-success">{v.numeroNF ?? `Viagem #${v.id}`}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{v.destino ?? "—"}</p>
                </div>
                <Badge className="text-[9px] bg-success/10 text-success border-success/25">Enviado</Badge>
              </div>
            ))}
          </div>
        )}

        {viagens.length === 0 && (
          <div className="text-center py-12">
            <Truck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">Nenhuma entrega para hoje</p>
            <p className="text-xs text-muted-foreground mt-1">Aguarde instruções da base.</p>
          </div>
        )}
      </main>

      {/* CAMERA OVERLAY */}
      {scanState === "camera" && (
        <div className="absolute inset-0 z-50" style={{ backgroundColor: "#000" }}>
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-60 flex items-center justify-between px-4 pt-4 pb-2" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)" }}>
            <Badge className="bg-black/60 text-white border-white/20 text-[10px]">
              <Camera className="w-3 h-3 mr-1" /> NF: {scanTarget?.nf}
            </Badge>
            <div className="flex items-center gap-2">
              <button
                className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                style={{ backgroundColor: torchOn ? "rgba(253,224,71,0.3)" : "rgba(0,0,0,0.5)", border: torchOn ? "1.5px solid #FDE047" : "1.5px solid rgba(255,255,255,0.2)" }}
                onClick={toggleTorch}
                title="Lanterna"
              >
                <Lightbulb className="w-4 h-4" style={{ color: torchOn ? "#FDE047" : "white" }} />
              </button>
              <button className="w-9 h-9 rounded-full bg-black/50 border border-white/20 flex items-center justify-center" onClick={() => { stopCamera(); setScanState("idle"); setOcrError(null); }}>
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>

          <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />

          {cameraError && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "#111" }}>
              <div className="text-center p-6">
                <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                <p className="text-sm font-medium">Câmera não disponível</p>
                <p className="text-xs text-muted-foreground mt-1">{cameraErrorMessage}</p>
              </div>
            </div>
          )}

          {/* Document guide frame */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-[80%] aspect-[3/4]">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-success rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-success rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-success rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-success rounded-br-lg" />
              <div className="absolute left-0 right-0 h-0.5 bg-success/70" style={{ boxShadow: "0 0 8px rgba(74,222,128,0.7)", animation: "scanline 2s ease-in-out infinite" }} />
              <div className="absolute -top-7 left-0 right-0 flex justify-center">
                <span className="text-[11px] text-success/90 px-3 py-1 rounded font-medium" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
                  Aproxime o comprovante e mantenha o foco
                </span>
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

          <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-3 z-60">
            <p className="text-[10px] text-white/50">
              {ocrError ? "Ajuste o enquadramento e tente novamente" : "Toque para capturar o comprovante"}
            </p>
            <button
              className="rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform"
              style={{ width: 72, height: 72, backgroundColor: ocrError ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.15)" }}
              onClick={() => { setOcrError(null); captureAndAnalyze(); }}
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
                  <p className={`text-sm ${done ? "text-success" : active ? "text-white font-medium" : "text-muted-foreground"}`}>{step}</p>
                </div>
              );
            })}
          </div>
          <div className="w-full max-w-xs">
            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
              <div className="h-full bg-primary rounded-full transition-all duration-100" style={{ width: `${aiProgress}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS OVERLAY */}
      {scanState === "success" && scanTarget && (
        <div className="absolute inset-0 z-50 overflow-auto" style={{ backgroundColor: "rgba(0,0,0,0.97)" }}>
          <div className="min-h-full flex flex-col items-center p-6 pt-10">

            {/* Icon — green for canhoto padrão, amber for outro comprovante */}
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
              style={isOutroComprovante
                ? { backgroundColor: "rgba(245,158,11,0.12)", boxShadow: "0 0 40px rgba(245,158,11,0.3)" }
                : { backgroundColor: "rgba(74,222,128,0.12)", boxShadow: "0 0 40px rgba(74,222,128,0.3)" }
              }
            >
              {isOutroComprovante
                ? <AlertTriangle className="w-10 h-10 text-amber-400" />
                : <CheckCircle2 className="w-10 h-10 text-success" />
              }
            </div>

            {/* Title */}
            <h2 className="text-xl font-bold mb-2 text-center leading-tight">
              {isOutroComprovante
                ? <>Comprovante recebido<br />pela TechSin</>
                : <>Documento enviado com<br />sucesso para a TechSin!</>
              }
            </h2>

            <div className="flex items-center gap-1.5 mb-5">
              <Send className="w-3 h-3 text-primary" />
              <p className="text-xs text-primary font-mono">NF {scanTarget.nf}</p>
              {!isOnline && <Badge className="text-[9px] bg-amber-500/20 text-amber-300 border-amber-500/30 ml-1">Enviará quando online</Badge>}
            </div>

            {/* Divergence alert — only for outro_comprovante */}
            {isOutroComprovante && (
              <div className="w-full max-w-xs rounded-xl border border-amber-500/40 px-4 py-3.5 flex items-start gap-3 mb-5" style={{ backgroundColor: "rgba(245,158,11,0.1)" }}>
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-300 mb-0.5">Documento divergente detectado</p>
                  <p className="text-[11px] text-amber-400/80 leading-snug">Enviando para análise manual da transportadora.</p>
                </div>
              </div>
            )}

            {/* Photo with dynamic header badge */}
            {capturedFrame && (
              <div className="w-full max-w-xs rounded-xl border border-white/10 overflow-hidden mb-4">
                <div
                  className="px-4 py-2.5 border-b border-white/8 flex items-center gap-2"
                  style={isOutroComprovante
                    ? { backgroundColor: "rgba(245,158,11,0.08)" }
                    : { backgroundColor: "rgba(74,222,128,0.08)" }
                  }
                >
                  <ShieldCheck className={`w-3.5 h-3.5 ${isOutroComprovante ? "text-amber-400" : "text-success"}`} />
                  <span className={`text-xs font-semibold uppercase tracking-wide ${isOutroComprovante ? "text-amber-400" : "text-success"}`}>
                    {isOutroComprovante ? "Em Análise Manual" : "Auditado por TechSin"}
                  </span>
                  <Badge className={`ml-auto text-[9px] ${isOutroComprovante ? "bg-amber-500/15 text-amber-300 border-amber-500/25" : "bg-success/15 text-success border-success/25"}`}>
                    {isOutroComprovante ? "ANÁLISE" : "AUDITADO"}
                  </Badge>
                </div>
                <img src={capturedFrame} alt="Comprovante" className="w-full object-contain max-h-40" />
              </div>
            )}

            {/* Audit card */}
            <div className="w-full max-w-xs rounded-xl border border-white/10 overflow-hidden mb-6" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
              <div className="px-4 py-2.5 border-b border-white/8 flex items-center gap-2" style={{ backgroundColor: "rgba(60,130,246,0.08)" }}>
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-primary">Comprovante de Auditoria</span>
              </div>
              <div className="p-4 space-y-2.5 text-xs font-mono">
                {[
                  { k: "Nota Fiscal", v: scanTarget.nf },
                  { k: "Tipo", v: isOutroComprovante ? "⚠️ Outro comprovante" : "✓ Canhoto NF" },
                  { k: "Assinatura", v: isOutroComprovante ? "Análise manual" : "✓ Verificada" },
                  { k: "GPS", v: scanGps ? `${scanGps.lat.toFixed(4)}, ${scanGps.lon.toFixed(4)}` : "Aguardando..." },
                  { k: "Captura", v: capturedAt ? new Date(capturedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—" },
                  { k: "Selo Digital", v: sealId },
                ].map(({ k, v }) => (
                  <div key={k} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="text-white text-right text-[11px]">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-center mb-6 leading-relaxed" style={{ color: isOutroComprovante ? "rgba(251,191,36,0.8)" : "rgba(74,222,128,0.8)" }}>
              {isOutroComprovante
                ? "A transportadora revisará o comprovante\nantes de liberar o faturamento."
                : "Painel do escritório atualizado.\nO faturamento será gerado pelo gestor."
              }
            </p>

            <button
              className="px-8 py-2.5 rounded-full border border-white/20 text-sm font-medium hover:bg-white/5 transition-colors active:scale-95"
              onClick={resetScan}
            >
              Voltar às Entregas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
