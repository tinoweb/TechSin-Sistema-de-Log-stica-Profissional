import { useListCanhotos, useValidateCanhoto, getListCanhotosQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  XCircle,
  Eye,
  MapPin,
  ShieldCheck,
  PenLine,
  AlertCircle
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";

export default function Canhotos() {
  const { data: canhotos, isLoading } = useListCanhotos({ query: { queryKey: ["canhotos"] } });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedCanhoto, setSelectedCanhoto] = useState<any>(null);

  const validateMutation = useValidateCanhoto({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCanhotosQueryKey() });
        setSelectedCanhoto(null);
        toast({ title: "Status atualizado com sucesso." });
      }
    }
  });

  const handleAction = (id: number, status: "validado" | "rejeitado") => {
    validateMutation.mutate({ id, data: { status } });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-lg font-semibold text-foreground tracking-tight">Fila de Auditoria — Canhotos</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Validação OCR e autenticidade digital por GPS + timestamp. Somente canhotos reais enviados via App Motorista.</p>
      </div>

      {/* Empty state instructions */}
      {!isLoading && !canhotos?.length && (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-2">Nenhum canhoto na fila</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Os canhotos aparecem aqui automaticamente quando um motorista fotografa uma Nota Fiscal pelo App. 
            Gere o link de acesso em <span className="text-primary font-medium">Motoristas → Gerar Link</span> e compartilhe via WhatsApp.
          </p>
        </div>
      )}

      {/* Canhotos table */}
      {(isLoading || (canhotos && canhotos.length > 0)) && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Canhotos Submetidos</h3>
            {canhotos && <span className="text-[10px] text-muted-foreground">{canhotos.length} registro{canhotos.length !== 1 ? "s" : ""}</span>}
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="text-muted-foreground text-xs font-medium w-20">Foto</TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium">Documento</TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium">Selo Digital</TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium">Confiança IA</TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium">Status</TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">Carregando...</TableCell>
                </TableRow>
              ) : (
                canhotos!.map((c) => (
                  <TableRow key={c.id} className="border-border hover:bg-white/3 transition-colors">
                    <TableCell>
                      <div
                        className="w-12 h-12 rounded border border-border bg-background overflow-hidden cursor-pointer hover:border-primary/50 transition-colors flex items-center justify-center"
                        onClick={() => setSelectedCanhoto(c)}
                      >
                        {c.fotoUrl ? (
                          <img src={c.fotoUrl} alt="Canhoto" className="w-full h-full object-cover" />
                        ) : (
                          <Eye className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-mono font-medium text-foreground">NF: {c.numeroNF ?? "N/A"}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Viagem #{c.viagemId}</p>
                      <p className="text-[10px] text-muted-foreground">{formatDate(c.timestamp)}</p>
                    </TableCell>
                    <TableCell>
                      {c.sealId ? (
                        <div>
                          <div className="flex items-center gap-1 text-[10px] font-mono text-primary">
                            <ShieldCheck className="w-3 h-3" />
                            {c.sealId}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                            <MapPin className="w-2.5 h-2.5" />
                            {c.latitude?.toFixed(4)}, {c.longitude?.toFixed(4)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Sem GPS</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className={`text-xs font-mono font-medium ${(c.iaConfidencia ?? 0) > 0.85 ? "text-success" : "text-amber-500"}`}>
                        {c.iaConfidencia ? `${(c.iaConfidencia * 100).toFixed(0)}%` : "—"}
                      </div>
                      <div className={`flex items-center gap-1 text-[10px] mt-0.5 ${c.assinaturaDetectada ? "text-success" : "text-muted-foreground"}`}>
                        <PenLine className="w-2.5 h-2.5" />
                        {c.assinaturaDetectada ? "Assinatura OK" : "Sem assinatura"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {c.status === "pendente" && (
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0 border-destructive/40 text-destructive hover:bg-destructive/10"
                            onClick={() => handleAction(c.id, "rejeitado")}
                            disabled={validateMutation.isPending}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-success text-success-foreground hover:bg-success/90 px-2.5"
                            onClick={() => handleAction(c.id, "validado")}
                            disabled={validateMutation.isPending}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" /> Liberar
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail modal */}
      <Dialog open={!!selectedCanhoto} onOpenChange={() => setSelectedCanhoto(null)}>
        <DialogContent className="bg-card border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" /> Inspeção Detalhada
            </DialogTitle>
          </DialogHeader>
          {selectedCanhoto && (
            <div className="grid grid-cols-2 gap-5 pt-2">
              <div className="bg-background rounded border border-border min-h-52 flex items-center justify-center overflow-hidden">
                {selectedCanhoto.fotoUrl ? (
                  <img src={selectedCanhoto.fotoUrl} alt="Canhoto" className="max-w-full object-contain" />
                ) : (
                  <div className="text-center p-6">
                    <AlertCircle className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                    <span className="text-xs text-muted-foreground">Imagem não disponível</span>
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-primary font-semibold mb-2">Leitura OCR</p>
                  <div className="space-y-1.5 font-mono text-xs border border-border rounded p-3 bg-background">
                    {[
                      ["NF", selectedCanhoto.numeroNF],
                      ["CNPJ", selectedCanhoto.cnpjCliente],
                      ["Confiança", `${selectedCanhoto.iaConfidencia ? (selectedCanhoto.iaConfidencia * 100).toFixed(0) : 0}%`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-muted-foreground">{k}:</span>
                        <span className="text-foreground">{v ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-primary font-semibold mb-2">Metadados GPS</p>
                  <div className="space-y-1.5 font-mono text-xs border border-border rounded p-3 bg-background text-muted-foreground">
                    <div>Data: {formatDate(selectedCanhoto.timestamp)}</div>
                    <div>Lat: {selectedCanhoto.latitude}</div>
                    <div>Lon: {selectedCanhoto.longitude}</div>
                    <div className="break-all">Seal: {selectedCanhoto.sealId}</div>
                  </div>
                </div>
                {selectedCanhoto.status === "pendente" && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="flex-1 h-8 text-xs bg-success text-success-foreground hover:bg-success/90" onClick={() => handleAction(selectedCanhoto.id, "validado")}>
                      Aprovar
                    </Button>
                    <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => handleAction(selectedCanhoto.id, "rejeitado")}>
                      Rejeitar
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    validado: "bg-success/10 text-success border-success/25",
    rejeitado: "bg-destructive/10 text-destructive border-destructive/25",
    pendente: "bg-amber-500/10 text-amber-500 border-amber-500/25",
  };
  const labels: Record<string, string> = { validado: "Validado", rejeitado: "Rejeitado", pendente: "Pendente" };
  return (
    <Badge variant="outline" className={`text-[10px] ${map[status] ?? "border-border text-muted-foreground"}`}>
      {labels[status] ?? status}
    </Badge>
  );
}
