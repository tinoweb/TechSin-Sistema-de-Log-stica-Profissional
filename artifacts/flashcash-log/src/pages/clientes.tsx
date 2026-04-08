import { useListClientes, useCreateCliente, getListClientesQueryKey } from "@workspace/api-client-react";
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
import { Input } from "@/components/ui/input";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Search, Plus, Building2, MoreHorizontal } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";

export default function Clientes() {
  const { data: clientes, isLoading } = useListClientes({
    query: { queryKey: ["clientes"] }
  });
  
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreateCliente({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClientesQueryKey() });
        setIsDialogOpen(false);
        toast({ title: "Cliente cadastrado", variant: "default" });
      },
      onError: () => {
        toast({ title: "Erro ao cadastrar", variant: "destructive" });
      }
    }
  });

  const filtered = clientes?.filter(c => 
    c.nome.toLowerCase().includes(search.toLowerCase()) || 
    c.cnpj.includes(search)
  ) || [];

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      data: {
        transportadoraId: 1, // Mock
        nome: formData.get("nome") as string,
        cnpj: formData.get("cnpj") as string,
        email: formData.get("email") as string,
        emailFinanceiro: formData.get("emailFinanceiro") as string,
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Clientes Destinatários</h2>
          <p className="text-muted-foreground text-sm">Empresas que recebem as mercadorias.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-white shadow-[0_0_15px_rgba(157,0,255,0.4)]">
              <Plus className="w-4 h-4 mr-2" />
              Novo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-white">Novo Cliente (Destinatário)</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">Razão Social</label>
                <Input name="nome" required className="bg-background border-border" placeholder="Acme Logística Ltda" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">CNPJ</label>
                <Input name="cnpj" required className="bg-background border-border" placeholder="00.000.000/0000-00" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">E-mail Operacional</label>
                <Input name="email" type="email" required className="bg-background border-border" placeholder="contato@acme.com" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">E-mail Financeiro</label>
                <Input name="emailFinanceiro" type="email" className="bg-background border-border" placeholder="nfe@acme.com" />
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending} className="bg-primary text-white hover:bg-primary/90">
                  {createMutation.isPending ? "Salvando..." : "Salvar"}
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
              placeholder="Buscar por nome ou CNPJ..." 
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
                <TableHead className="text-muted-foreground w-[300px]">Empresa</TableHead>
                <TableHead className="text-muted-foreground">Contatos</TableHead>
                <TableHead className="text-muted-foreground text-right">Faturas Emitidas</TableHead>
                <TableHead className="text-muted-foreground text-right">Volume Transacionado</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando clientes...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum cliente encontrado.</TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id} className="border-border border-b hover:bg-white/5 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-md bg-muted/50 flex items-center justify-center border border-border">
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="font-medium text-white">{c.nome}</div>
                          <div className="text-xs font-mono text-muted-foreground">{c.cnpj}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-white">{c.email}</div>
                      {c.emailFinanceiro && <div className="text-xs text-primary">{c.emailFinanceiro}</div>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{c.totalFaturas || 0}</TableCell>
                    <TableCell className="text-right font-medium text-success">{formatCurrency(c.valorTotal)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
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
