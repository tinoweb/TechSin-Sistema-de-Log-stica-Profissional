import { useListMotoristas, useCreateMotorista, getListMotoristasQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from "@/components/ui/dialog";
import { Search, Plus, Truck, CheckCircle2, XCircle, Link2, Copy, ExternalLink, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function getMagicLink(token: string | null | undefined): string {
  if (!token) return "";
  const base = window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/drive/${token}`;
}

export default function Motoristas() {
  const { data: motoristas, isLoading } = useListMotoristas({
    query: { queryKey: ["motoristas"] }
  });
  
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [linkModal, setLinkModal] = useState<{ nome: string; link: string } | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreateMotorista({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMotoristasQueryKey() });
        setIsDialogOpen(false);
        toast({ title: "Motorista cadastrado com sucesso" });
      },
      onError: () => {
        toast({ title: "Erro ao cadastrar motorista", variant: "destructive" });
      }
    }
  });

  const filteredMotoristas = motoristas?.filter(m => 
    m.nome.toLowerCase().includes(search.toLowerCase()) || 
    m.cpf.includes(search)
  ) || [];

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      data: {
        transportadoraId: 1,
        nome: formData.get("nome") as string,
        cpf: formData.get("cpf") as string,
        telefone: formData.get("telefone") as string,
        cnh: formData.get("cnh") as string,
      }
    });
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link).then(() => {
      toast({ title: "Link copiado!", description: "Envie pelo WhatsApp para o motorista." });
    }).catch(() => {
      toast({ title: "Copie manualmente", description: link });
    });
  };

  const openLink = async (motorista: any) => {
    let token = (motorista as any).magicToken;
    
    // Se não tem token, gerar um novo
    if (!token) {
      try {
        const response = await fetch(`/api/motoristas/${motorista.id}/generate-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
          const data = await response.json();
          token = data.magicToken;
          // Atualizar cache local
          queryClient.invalidateQueries({ queryKey: getListMotoristasQueryKey() });
          toast({ title: "Link gerado!", description: `Token criado para ${motorista.nome}` });
        } else {
          toast({ title: "Erro ao gerar link", description: "Tente novamente.", variant: "destructive" });
          return;
        }
      } catch (error) {
        toast({ title: "Erro de conexão", description: "Verifique sua internet.", variant: "destructive" });
        return;
      }
    }
    
    const link = getMagicLink(token);
    setLinkModal({ nome: motorista.nome, link });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ativo':
        return <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1"/> Disponível</Badge>;
      case 'em_rota':
        return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]"><Truck className="w-3 h-3 mr-1"/> Em Rota</Badge>;
      case 'inativo':
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]"><XCircle className="w-3 h-3 mr-1"/> Inativo</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Frota / Motoristas</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Gerencie o time de campo, status de rotas e links de acesso.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="h-9 text-sm font-semibold" style={{ background: "linear-gradient(135deg, #2563EB, #3C82F6)" }}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Motorista
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-foreground">Novo Motorista</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-4">
              {[
                { name: "nome", label: "Nome Completo", placeholder: "João da Silva" },
                { name: "cpf", label: "CPF", placeholder: "000.000.000-00" },
                { name: "cnh", label: "CNH", placeholder: "Número da CNH" },
                { name: "telefone", label: "Telefone (WhatsApp)", placeholder: "(00) 00000-0000" },
              ].map(f => (
                <div key={f.name} className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                  <Input name={f.name} required={f.name === "nome" || f.name === "cpf"} className="h-9 bg-background border-border text-sm" placeholder={f.placeholder} />
                </div>
              ))}
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" className="border-border" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending} style={{ background: "linear-gradient(135deg, #2563EB, #3C82F6)" }}>
                  {createMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou CPF..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-8 text-xs bg-background border-border"
            />
          </div>
          <p className="text-[10px] text-muted-foreground ml-auto">
            <Link2 className="w-3 h-3 inline mr-1 text-primary" />
            Clique em "Gerar Link" para enviar acesso ao motorista
          </p>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-background/50">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground text-xs">Nome</TableHead>
                <TableHead className="text-muted-foreground text-xs">Documentos</TableHead>
                <TableHead className="text-muted-foreground text-xs">Status</TableHead>
                <TableHead className="text-muted-foreground text-xs text-right">Entregas</TableHead>
                <TableHead className="text-muted-foreground text-xs text-center">Link de Acesso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-xs">Carregando frota...</TableCell>
                </TableRow>
              ) : filteredMotoristas.length === 0 ? (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-xs">Nenhum motorista encontrado.</TableCell>
                </TableRow>
              ) : (
                filteredMotoristas.map((motorista) => (
                  <TableRow key={motorista.id} className="border-border border-b hover:bg-white/5 transition-colors">
                    <TableCell>
                      <div className="font-medium text-sm text-foreground">{motorista.nome}</div>
                      <div className="text-[10px] text-muted-foreground">{motorista.telefone || "Sem telefone"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-mono text-muted-foreground">CPF: {motorista.cpf}</div>
                      {motorista.cnh && <div className="text-[10px] text-muted-foreground">CNH: {motorista.cnh}</div>}
                    </TableCell>
                    <TableCell>{getStatusBadge(motorista.status)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-foreground">{(motorista as any).totalEntregas || 0}</TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] border-primary/30 text-primary hover:bg-primary/8 px-2.5 gap-1"
                        onClick={() => openLink(motorista)}
                      >
                        <Link2 className="w-3 h-3" />
                        {(motorista as any).magicToken ? "Enviar Link" : "Gerar Link"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Link modal */}
      {linkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2 mb-0.5">
                <Link2 className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Link de Acesso do Motorista</h3>
              </div>
              <p className="text-xs text-muted-foreground">Envie este link pelo WhatsApp. Não é necessário login ou senha.</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Motorista</p>
                <p className="text-sm font-semibold text-foreground">{linkModal.nome}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">URL de Acesso Direto</p>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-background border border-border">
                  <p className="text-xs font-mono text-primary flex-1 truncate">{linkModal.link}</p>
                </div>
              </div>
              <div className="flex items-start gap-2 px-3 py-2 rounded bg-primary/5 border border-primary/15">
                <p className="text-[10px] text-primary/80 leading-relaxed">
                  Este link dá acesso direto às entregas do motorista, sem login. Compartilhe pelo WhatsApp ou copie e cole no navegador do celular.
                </p>
              </div>
            </div>
            <div className="px-6 pb-5 flex flex-col gap-2">
              {/* WhatsApp primary action */}
              <Button
                className="w-full h-10 text-sm font-semibold gap-2"
                style={{ background: "linear-gradient(135deg, #16a34a, #22c55e)" }}
                onClick={() => {
                  const msg = encodeURIComponent(
                    `Olá ${linkModal.nome}! Aqui está seu link de acesso às entregas de hoje na TechSin:\n\n${linkModal.link}\n\nClique para ver suas rotas e registrar as entregas. Qualquer dúvida, me chame aqui. ✅`
                  );
                  window.open(`https://wa.me/?text=${msg}`, "_blank");
                }}
              >
                <MessageCircle className="w-4 h-4" /> Compartilhar via WhatsApp
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 h-9 text-sm border-border" onClick={() => setLinkModal(null)}>Fechar</Button>
                <Button
                  variant="outline"
                  className="flex-1 h-9 text-sm border-border"
                  onClick={() => window.open(linkModal.link, "_blank")}
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Abrir
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 h-9 text-sm border-border"
                  onClick={() => copyLink(linkModal.link)}
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
