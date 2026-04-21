import { useListClientes, useCreateCliente, getListClientesQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import { useLocation } from "wouter";
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
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Search, Plus, Building2, MoreHorizontal, Pencil, FileText, Truck, Trash2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, displayEmail, isPlaceholderEmail } from "@/lib/format";
import { api } from "@/lib/api-client";

interface ClienteRow {
  id: number;
  nome: string;
  cnpj: string;
  email?: string | null;
  emailFinanceiro?: string | null;
  telefone?: string | null;
  endereco?: string | null;
}

export default function Clientes() {
  const { data: clientes, isLoading } = useListClientes({
    query: { queryKey: ["clientes"] }
  });
  
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editCliente, setEditCliente] = useState<ClienteRow | null>(null);
  const [deleteCliente, setDeleteCliente] = useState<ClienteRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidateClientes = () =>
    queryClient.invalidateQueries({ queryKey: getListClientesQueryKey() });

  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editCliente) return;
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, string> = {
      nome:             String(fd.get("nome") ?? "").trim(),
      cnpj:             String(fd.get("cnpj") ?? "").trim(),
      email:            String(fd.get("email") ?? "").trim(),
      emailFinanceiro:  String(fd.get("emailFinanceiro") ?? "").trim(),
      telefone:         String(fd.get("telefone") ?? "").trim(),
      endereco:         String(fd.get("endereco") ?? "").trim(),
    };
    try {
      setSubmitting(true);
      await api.patch(`/clientes/${editCliente.id}`, payload);
      invalidateClientes();
      setEditCliente(null);
      toast({ title: "Cliente atualizado" });
    } catch (err: any) {
      toast({ title: "Erro ao atualizar", description: err?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCliente) return;
    try {
      setSubmitting(true);
      await api.delete(`/clientes/${deleteCliente.id}`);
      invalidateClientes();
      setDeleteCliente(null);
      toast({ title: "Empresa excluída" });
    } catch (err: any) {
      const msg = err?.message ?? "Erro ao excluir";
      let parsed: any = null;
      try { parsed = JSON.parse(msg); } catch {}
      const description = parsed?.viagens || parsed?.faturas
        ? `Cliente possui ${parsed.viagens ?? 0} viagem(ns) e ${parsed.faturas ?? 0} fatura(s) vinculadas.`
        : (parsed?.error ?? msg);
      toast({ title: "Não é possível excluir", description, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

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

      {/* Modal de edição do cliente */}
      <Dialog open={!!editCliente} onOpenChange={(open) => !open && setEditCliente(null)}>
        <DialogContent className="bg-card border-border sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-white">Editar Cliente</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Alterações serão aplicadas ao cadastro global do cliente.
            </DialogDescription>
          </DialogHeader>
          {editCliente && (
            <form onSubmit={handleEditSubmit} className="space-y-3 pt-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-white">Razão Social</label>
                <Input name="nome" required defaultValue={editCliente.nome} className="bg-background border-border" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-white">CNPJ</label>
                  <Input name="cnpj" required defaultValue={editCliente.cnpj} className="bg-background border-border font-mono" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-white">Telefone</label>
                  <Input name="telefone" defaultValue={editCliente.telefone ?? ""} className="bg-background border-border" placeholder="(11) 9..." />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-white">E-mail Operacional</label>
                <Input
                  name="email"
                  type="email"
                  defaultValue={isPlaceholderEmail(editCliente.email) ? "" : (editCliente.email ?? "")}
                  className="bg-background border-border"
                  placeholder="contato@empresa.com"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-white">E-mail Financeiro</label>
                <Input
                  name="emailFinanceiro"
                  type="email"
                  defaultValue={editCliente.emailFinanceiro ?? ""}
                  className="bg-background border-border"
                  placeholder="financeiro@empresa.com"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-white">Endereço</label>
                <Input name="endereco" defaultValue={editCliente.endereco ?? ""} className="bg-background border-border" />
              </div>
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setEditCliente(null)} disabled={submitting}>Cancelar</Button>
                <Button type="submit" disabled={submitting} className="bg-primary text-white hover:bg-primary/90">
                  {submitting ? "Salvando..." : "Salvar alterações"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de confirmação de exclusão */}
      <Dialog open={!!deleteCliente} onOpenChange={(open) => !open && setDeleteCliente(null)}>
        <DialogContent className="bg-card border-border sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" /> Excluir empresa?
            </DialogTitle>
            <DialogDescription className="text-muted-foreground pt-2">
              Esta ação não pode ser desfeita. A empresa <strong className="text-white">{deleteCliente?.nome}</strong> será removida permanentemente do cadastro.
              <br /><br />
              <span className="text-amber-400 text-xs">⚠️ Se a empresa tiver viagens ou faturas vinculadas, a exclusão será bloqueada para preservar o histórico fiscal.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setDeleteCliente(null)} disabled={submitting}>Cancelar</Button>
            <Button onClick={handleDelete} disabled={submitting} className="bg-red-500 hover:bg-red-600 text-white">
              {submitting ? "Excluindo..." : "Sim, excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                      <div className="text-sm text-white">
                        {displayEmail(c.email) ?? <span className="text-amber-400 italic">— preencher</span>}
                      </div>
                      {displayEmail(c.emailFinanceiro) && <div className="text-xs text-primary">{c.emailFinanceiro}</div>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{c.totalFaturas || 0}</TableCell>
                    <TableCell className="text-right font-medium text-success">{formatCurrency(c.valorTotal)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 bg-card border-border">
                          <DropdownMenuItem onClick={() => setEditCliente(c as ClienteRow)} className="cursor-pointer">
                            <Pencil className="w-4 h-4 mr-2" /> Editar dados
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/faturas?clienteId=${c.id}`)} className="cursor-pointer">
                            <FileText className="w-4 h-4 mr-2" /> Ver faturas
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/arquivo?clienteId=${c.id}`)} className="cursor-pointer">
                            <Truck className="w-4 h-4 mr-2" /> Ver viagens
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteCliente(c as ClienteRow)}
                            className="cursor-pointer text-red-400 focus:text-red-400 focus:bg-red-500/10"
                          >
                            <Trash2 className="w-4 h-4 mr-2" /> Excluir empresa
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
