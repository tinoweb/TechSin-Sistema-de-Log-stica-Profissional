import { useListFaturas, useEnviarFatura, useAnteciparFatura, getListFaturasQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Send, Zap, FileText, CheckCircle2, Clock, AlertCircle, TrendingUp, Mail
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/format";

export default function Faturas() {
  const { data: faturas, isLoading } = useListFaturas({ query: { queryKey: ["faturas"] } });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const anteciparMutation = useAnteciparFatura({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFaturasQueryKey() });
        toast({ title: "Faturamento Expresso disparado!", description: "Comprovante auditado enviado ao cliente." });
      }
    }
  });

  const enviarMutation = useEnviarFatura({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFaturasQueryKey() });
        toast({ title: "Kit de faturamento enviado ao cliente." });
      }
    }
  });

  const totalPendente = faturas?.filter(f => f.status === "pendente").reduce((s, f) => s + f.valor, 0) ?? 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-lg font-semibold text-foreground tracking-tight">Faturamento & Recebiveis</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Dispare o faturamento expresso — comprovante auditado enviado diretamente ao cliente.</p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg px-4 py-3.5">
          <p className="text-[11px] text-muted-foreground mb-1">Envio Automatizado</p>
          <p className="text-xl font-semibold text-foreground">E-mail Expresso</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">PDF auditado + instrucoes de pagamento</p>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-3.5">
          <p className="text-[11px] text-muted-foreground mb-1">Pendente de Emissao</p>
          <p className="text-xl font-semibold text-foreground tabular-nums">{formatCurrency(totalPendente)}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <TrendingUp className="w-3 h-3 text-success" />
            <p className="text-[10px] text-success">Pronto para faturar</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-3.5">
          <p className="text-[11px] text-muted-foreground mb-1">Total Faturado</p>
          <p className="text-xl font-semibold text-foreground tabular-nums">
            {formatCurrency(faturas?.filter(f => ["antecipado", "pago"].includes(f.status)).reduce((s, f) => s + f.valor, 0) ?? 0)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Notas já faturadas no período</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Relacao de Faturas</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="text-xs font-medium text-muted-foreground">Fatura / Cliente</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Valor</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Vencimento</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground text-right">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={5} className="py-8 text-center text-xs text-muted-foreground">Carregando...</TableCell>
              </TableRow>
            ) : !faturas?.length ? (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={5} className="py-10 text-center">
                  <AlertCircle className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhuma fatura encontrada.</p>
                </TableCell>
              </TableRow>
            ) : (
              faturas.map((f) => (
                <TableRow key={f.id} className="border-border hover:bg-white/3 transition-colors">
                  <TableCell>
                    <p className="text-xs font-medium text-foreground">{f.clienteNome ?? "Cliente"}</p>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5 font-mono">
                      <FileText className="w-2.5 h-2.5" />
                      FAT-{f.id.toString().padStart(5, "0")} &middot; Viagem #{f.viagemId}
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-xs font-mono font-semibold text-foreground">{formatCurrency(f.valor)}</p>
                    {f.status === "antecipado" && f.valorAntecipado && (
                      <p className="text-[10px] text-success mt-0.5">Creditado: {formatCurrency(f.valorAntecipado)}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {f.dataVencimento ? formatDate(f.dataVencimento).split(" ")[0] : "—"}
                  </TableCell>
                  <TableCell><StatusBadge status={f.status} /></TableCell>
                  <TableCell className="text-right">
                    {f.status === "pendente" && (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-border text-muted-foreground hover:text-foreground hover:bg-white/5"
                          onClick={() => enviarMutation.mutate({ id: f.id })}
                          disabled={enviarMutation.isPending}
                        >
                          <Send className="w-3 h-3 mr-1.5" /> Kit Fat.
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs font-semibold"
                          style={{ background: "linear-gradient(135deg, #2563EB, #3C82F6)" }}
                          onClick={() => anteciparMutation.mutate({ id: f.id })}
                          disabled={anteciparMutation.isPending}
                        >
                          <Zap className="w-3 h-3 mr-1" /> Fat. Expresso
                        </Button>
                      </div>
                    )}
                    {f.status === "enviado" && <span className="text-[10px] text-blue-400 font-medium">Kit enviado</span>}
                    {f.status === "antecipado" && <span className="text-[10px] text-success font-medium">Faturado</span>}
                    {f.status === "pago" && <span className="text-[10px] text-muted-foreground">Liquidado</span>}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; icon: any }> = {
    pendente: { label: "Aguardando", className: "bg-amber-500/10 text-amber-500 border-amber-500/25", icon: Clock },
    enviado: { label: "Kit Enviado", className: "bg-blue-500/10 text-blue-400 border-blue-500/25", icon: Send },
    antecipado: { label: "Faturado", className: "bg-primary/10 text-primary border-primary/25", icon: Zap },
    pago: { label: "Liquidado", className: "bg-success/10 text-success border-success/25", icon: CheckCircle2 },
  };
  const cfg = config[status] ?? { label: status, className: "border-border text-muted-foreground", icon: Clock };
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`text-[10px] ${cfg.className}`}>
      <Icon className="w-2.5 h-2.5 mr-1" /> {cfg.label}
    </Badge>
  );
}
