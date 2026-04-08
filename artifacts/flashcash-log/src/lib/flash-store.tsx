import React, { createContext, useContext, useState, useCallback } from "react";

export type TipoDocumento = "canhoto_padrao" | "outro_comprovante";

export interface EntregaRecente {
  id: string;
  nf: string;
  cliente: string;
  email: string;
  valor: number;
  status: "aguardando" | "validado_ia" | "analise_manual" | "faturado";
  tipoDocumento: TipoDocumento;
  lat: number;
  lon: number;
  fotoUrl?: string;
  ts: number;
  capturedAt?: string;
}

export interface EnvioLog {
  id: string;
  nf: string;
  clienteEmail: string;
  clienteNome: string;
  valor: number;
  confirmedAt: string;
  ts: number;
}

interface FlashStore {
  entregasRecentes: EntregaRecente[];
  enviosLog: EnvioLog[];
  lastCanhotoNF: string | null;
  addEntrega: (e: EntregaRecente) => void;
  updateEntregaStatus: (id: string, status: EntregaRecente["status"]) => void;
  triggerCanhoto: (nf: string, valor: number, lat: number, lon: number, tipoDocumento: TipoDocumento, fotoUrl?: string) => void;
  dispararFaturamento: (entregaId: string) => void;
}

const FlashContext = createContext<FlashStore>({
  entregasRecentes: [],
  enviosLog: [],
  lastCanhotoNF: null,
  addEntrega: () => {},
  updateEntregaStatus: () => {},
  triggerCanhoto: () => {},
  dispararFaturamento: () => {},
});

export function FlashStoreProvider({ children }: { children: React.ReactNode }) {
  const [entregasRecentes, setEntregas] = useState<EntregaRecente[]>([]);
  const [enviosLog, setEnviosLog] = useState<EnvioLog[]>([]);
  const [lastCanhotoNF, setLastCanhotoNF] = useState<string | null>(null);

  const addEntrega = useCallback((e: EntregaRecente) => {
    setEntregas(prev => [e, ...prev].slice(0, 20));
  }, []);

  const updateEntregaStatus = useCallback((id: string, status: EntregaRecente["status"]) => {
    setEntregas(prev => prev.map(e => e.id === id ? { ...e, status } : e));
  }, []);

  const triggerCanhoto = useCallback((
    nf: string,
    valor: number,
    lat: number,
    lon: number,
    tipoDocumento: TipoDocumento,
    fotoUrl?: string,
  ) => {
    setLastCanhotoNF(nf);
    const newEntrega: EntregaRecente = {
      id: `e-${Date.now()}`,
      nf,
      cliente: "Entrega via App Motorista",
      email: "",
      valor,
      status: tipoDocumento === "canhoto_padrao" ? "validado_ia" : "analise_manual",
      tipoDocumento,
      lat,
      lon,
      fotoUrl,
      ts: Date.now(),
    };
    setEntregas(prev => [newEntrega, ...prev].slice(0, 20));
  }, []);

  const dispararFaturamento = useCallback((entregaId: string) => {
    setEntregas(prev => {
      const entrega = prev.find(e => e.id === entregaId);
      if (!entrega) return prev;
      const confirmedAt = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const envio: EnvioLog = {
        id: `ev-${Date.now()}`,
        nf: entrega.nf,
        clienteEmail: entrega.email,
        clienteNome: entrega.cliente,
        valor: entrega.valor,
        confirmedAt,
        ts: Date.now(),
      };
      setEnviosLog(p => [envio, ...p].slice(0, 20));
      return prev.map(e => e.id === entregaId ? { ...e, status: "faturado" } : e);
    });
  }, []);

  return (
    <FlashContext.Provider value={{ entregasRecentes, enviosLog, lastCanhotoNF, addEntrega, updateEntregaStatus, triggerCanhoto, dispararFaturamento }}>
      {children}
    </FlashContext.Provider>
  );
}

export function useFlashStore() {
  return useContext(FlashContext);
}
