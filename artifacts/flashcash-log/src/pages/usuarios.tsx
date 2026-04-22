import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Edit, Key, Trash2, Shield, ShieldCheck, User, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Usuario {
  id: number;
  email: string;
  nome: string;
  role: "superadmin" | "admin" | "operador" | "financeiro";
  transportadoraId: number | null;
  transportadoraNome?: string | null;
  ativo: boolean;
  createdAt: string;
  ultimoLoginAt: string | null;
}

export default function Usuarios() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSenhaOpen, setIsSenhaOpen] = useState(false);
  const [selectedUsuario, setSelectedUsuario] = useState<Usuario | null>(null);

  const loadUsuarios = async () => {
    try {
      setLoading(true);
      const data = await api.get<Usuario[]>("/usuarios");
      setUsuarios(data);
    } catch (err: any) {
      toast({ title: "Erro ao carregar usuarios", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useState(() => {
    loadUsuarios();
  });

  const filteredUsuarios = usuarios.filter(u =>
    u.nome.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await api.post("/usuarios", {
        email: formData.get("email"),
        senha: formData.get("senha"),
        nome: formData.get("nome"),
        role: formData.get("role"),
        transportadoraId: formData.get("transportadoraId") ? Number(formData.get("transportadoraId")) : null,
      });
      setIsCreateOpen(false);
      loadUsuarios();
      toast({ title: "Usuario criado com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro ao criar usuario", description: err.message, variant: "destructive" });
    }
  };

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedUsuario) return;
    const formData = new FormData(e.currentTarget);
    try {
      await api.patch(`/usuarios/${selectedUsuario.id}`, {
        nome: formData.get("nome"),
        role: formData.get("role"),
        transportadoraId: formData.get("transportadoraId") ? Number(formData.get("transportadoraId")) : null,
        ativo: formData.get("ativo") === "true",
      });
      setIsEditOpen(false);
      loadUsuarios();
      toast({ title: "Usuario atualizado com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro ao atualizar usuario", description: err.message, variant: "destructive" });
    }
  };

  const handleAlterarSenha = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedUsuario) return;
    const formData = new FormData(e.currentTarget);
    try {
      const payload: any = { senha: formData.get("senha") };
      // Se for o proprio usuario, precisa da senha atual
      if (selectedUsuario.id === user?.id) {
        payload.senhaAtual = formData.get("senhaAtual");
      }
      await api.patch(`/usuarios/${selectedUsuario.id}/senha`, payload);
      setIsSenhaOpen(false);
      toast({ title: "Senha alterada com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro ao alterar senha", description: err.message, variant: "destructive" });
    }
  };

  const handleToggleAtivo = async (usuario: Usuario) => {
    try {
      await api.patch(`/usuarios/${usuario.id}`, { ativo: !usuario.ativo });
      loadUsuarios();
      toast({ title: `Usuario ${usuario.ativo ? "desativado" : "ativado"}` });
    } catch (err: any) {
      toast({ title: "Erro ao alterar status", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (usuario: Usuario) => {
    if (!confirm(`Tem certeza que deseja remover o usuario ${usuario.nome}?`)) return;
    try {
      await api.delete(`/usuarios/${usuario.id}`);
      loadUsuarios();
      toast({ title: "Usuario removido com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro ao remover usuario", description: err.message, variant: "destructive" });
    }
  };

  const getRoleBadge = (role: string) => {
    const badges: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      superadmin: { label: "Superadmin", variant: "destructive" },
      admin: { label: "Admin", variant: "default" },
      operador: { label: "Operador", variant: "secondary" },
      financeiro: { label: "Financeiro", variant: "outline" },
    };
    const b = badges[role] || { label: role, variant: "outline" };
    return <Badge variant={b.variant}>{b.label}</Badge>;
  };

  const isSuperadmin = user?.role === "superadmin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Usuários
          </h1>
          <p className="text-muted-foreground">
            {isSuperadmin ? "Gerencie todos os usuários do sistema" : "Gerencie usuários da sua transportadora"}
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Usuário
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Role</TableHead>
                {isSuperadmin && <TableHead>Transportadora</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead>Último Acesso</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsuarios.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isSuperadmin ? 7 : 6} className="text-center text-muted-foreground">
                    Nenhum usuário encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsuarios.map((usuario) => (
                  <TableRow key={usuario.id}>
                    <TableCell className="font-medium">{usuario.nome}</TableCell>
                    <TableCell>{usuario.email}</TableCell>
                    <TableCell>{getRoleBadge(usuario.role)}</TableCell>
                    {isSuperadmin && (
                      <TableCell>{usuario.transportadoraNome ?? "Global"}</TableCell>
                    )}
                    <TableCell>
                      <Badge variant={usuario.ativo ? "default" : "secondary"}>
                        {usuario.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {usuario.ultimoLoginAt
                        ? new Date(usuario.ultimoLoginAt).toLocaleDateString("pt-BR")
                        : "Nunca"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedUsuario(usuario);
                            setIsEditOpen(true);
                          }}
                          title="Editar"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedUsuario(usuario);
                            setIsSenhaOpen(true);
                          }}
                          title="Alterar senha"
                        >
                          <Key className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleAtivo(usuario)}
                          title={usuario.ativo ? "Desativar" : "Ativar"}
                        >
                          {usuario.ativo ? <ShieldCheck className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(usuario)}
                          title="Remover"
                          disabled={usuario.id === user?.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog Criar Usuario */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" name="nome" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <Input id="senha" name="senha" type="password" required minLength={6} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select name="role" defaultValue="operador">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {isSuperadmin && <SelectItem value="superadmin">Superadmin</SelectItem>}
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="operador">Operador</SelectItem>
                  <SelectItem value="financeiro">Financeiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isSuperadmin && (
              <div className="space-y-2">
                <Label htmlFor="transportadoraId">Transportadora (opcional para superadmin)</Label>
                <Input
                  id="transportadoraId"
                  name="transportadoraId"
                  type="number"
                  placeholder="ID da transportadora"
                />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Criar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Editar Usuario */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
          </DialogHeader>
          {selectedUsuario && (
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-nome">Nome</Label>
                <Input id="edit-nome" name="nome" defaultValue={selectedUsuario.nome} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-role">Role</Label>
                <Select name="role" defaultValue={selectedUsuario.role}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {isSuperadmin && <SelectItem value="superadmin">Superadmin</SelectItem>}
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="operador">Operador</SelectItem>
                    <SelectItem value="financeiro">Financeiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isSuperadmin && (
                <div className="space-y-2">
                  <Label htmlFor="edit-transportadoraId">Transportadora</Label>
                  <Input
                    id="edit-transportadoraId"
                    name="transportadoraId"
                    type="number"
                    defaultValue={selectedUsuario.transportadoraId ?? ""}
                    placeholder="ID da transportadora (vazio = global)"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="edit-ativo">Status</Label>
                <Select name="ativo" defaultValue={selectedUsuario.ativo ? "true" : "false"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Ativo</SelectItem>
                    <SelectItem value="false">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Salvar</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Alterar Senha */}
      <Dialog open={isSenhaOpen} onOpenChange={setIsSenhaOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar Senha</DialogTitle>
          </DialogHeader>
          {selectedUsuario && (
            <form onSubmit={handleAlterarSenha} className="space-y-4">
              {selectedUsuario.id === user?.id && (
                <div className="space-y-2">
                  <Label htmlFor="senhaAtual">Senha Atual</Label>
                  <Input id="senhaAtual" name="senhaAtual" type="password" required />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="senha">Nova Senha</Label>
                <Input id="senha" name="senha" type="password" required minLength={6} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsSenhaOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Alterar</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
