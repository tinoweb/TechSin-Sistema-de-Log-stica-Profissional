import { useListViagens, useCreateViagem, getListViagensQueryKey } from "@workspace/api-client-react";
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
import { Input } from "@/components/ui/input";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Search, Plus, MapPin, Map, ArrowRight, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/format";

export default function Viagens() {
  const { data: viagens, isLoading } = useListViagens({
    query: { queryKey: ["viagens"] }
  });
  
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreateViagem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListViagensQueryKey() });
        setIsDialogOpen(false);
        toast({ title: "Viagem iniciada", variant: "default" });
      },
      onError: () => {
        toast({ title: "Erro ao criar", variant: "destructive" });
      }
    }
  });

  const filtered = viagens?.filter(v => 
    v.clienteNome?.toLowerCase().includes(search.toLowerCase()) || 
    v.motoristaNome?.toLowerCase().includes(search.toLowerCase()) ||
    v.numeroNF?.includes(search)
  ) || [];

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      data: {
        transportadoraId: 1, 
        motoristaId: 1, // Mock
        clienteId: 1, // Mock
        numeroNF: formData.get("nf") as string,
        valorFrete: Number(formData.get("valor")),
        origem: formData.get("origem") as string,
        destino: formData.get("destino") as string,
      }
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pendente': return <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Pendente</Badge>;
      case 'em_transito': return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 shadow-[0_0_8px_hsl(var(--primary)/0.2)]"><Truck className="w-3 h-3 mr-1"/> Em Trânsito</Badge>;
      case 'entregue': return <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20">Entregue (S/ Canhoto)</Badge>;
      case 'validado': return <Badge variant="outline" className="bg-success/10 text-success border-success/20 shadow-[0_0_8px_hsl(var(--success)/0.2)]">Validado AI</Badge>;
      case 'faturado': return <Badge variant="outline" className="bg-white/10 text-white border-white/20">Faturado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Controle de Viagens</h2>
          <p className="text-muted-foreground text-sm">Acompanhe rotas e o ciclo de vida do frete.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-white shadow-[0_0_15px_rgba(157,0,255,0.4)]">
              <Plus className="w-4 h-4 mr-2" />
              Nova Viagem
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-white">Despachar Viagem</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">NF-e</label>
                  <Input name="nf" required className="bg-background border-border font-mono" placeholder="000.000" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">Valor Frete</label>
                  <Input name="valor" type="number" step="0.01" required className="bg-background border-border" placeholder="R$" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">Origem</label>
                <Input name="origem" required className="bg-background border-border" placeholder="Cidade/UF" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">Destino</label>
                <Input name="destino" required className="bg-background border-border" placeholder="Cidade/UF" />
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending} className="bg-primary text-white hover:bg-primary/90">
                  {createMutation.isPending ? "Criando..." : "Iniciar Viagem"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-lg overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por NF, motorista ou cliente..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background border-border"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-background/50">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">ID/NF-e</TableHead>
                <TableHead className="text-muted-foreground">Rota</TableHead>
                <TableHead className="text-muted-foreground">Partes</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando viagens...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma viagem encontrada.</TableCell>
                </TableRow>
              ) : (
                filtered.map((v) => (
                  <TableRow key={v.id} className="border-border border-b hover:bg-white/5 transition-colors">
                    <TableCell>
                      <div className="font-mono text-sm text-white">#{v.id}</div>
                      {v.numeroNF && <div className="text-xs text-primary font-mono mt-1">NF: {v.numeroNF}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground truncate max-w-[100px]">{v.origem}</span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        <Map className="w-3 h-3 text-primary" />
                        <span className="text-white truncate max-w-[100px]">{v.destino}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Início: {formatDate(v.dataPartida)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium text-white">{v.clienteNome}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Truck className="w-3 h-3" /> {v.motoristaNome}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(v.status)}</TableCell>
                    <TableCell className="text-right font-mono font-medium text-white">
                      {formatCurrency(v.valorFrete)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
