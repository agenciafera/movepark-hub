import * as React from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  useUsers,
  useUpdateUserRole,
  useLinkUserCompany,
  useUnlinkUserCompany,
  type UserListItem,
} from "@/features/users/api";
import { useCompanies } from "@/features/companies/api";
import { formatDate } from "@/lib/format";
import type { CompanyRole, UserRole } from "@/types/domain";
import { ASSIGNABLE_ROLES, COMPANY_ROLE_LABEL } from "@/features/team/team.logic";

export default function ManagerUsers() {
  const users = useUsers();
  const companies = useCompanies();
  const updateRole = useUpdateUserRole();
  const linkCompany = useLinkUserCompany();
  const unlinkCompany = useUnlinkUserCompany();
  const [search, setSearch] = React.useState("");
  const [linkingUser, setLinkingUser] = React.useState<UserListItem | null>(null);
  const [selectedCompany, setSelectedCompany] = React.useState<string>("");
  const [selectedRole, setSelectedRole] = React.useState<CompanyRole>("owner");

  const filtered = (users.data ?? []).filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(q) || u.id.toLowerCase().includes(q)
    );
  });

  async function handleRoleChange(id: string, role: UserRole) {
    try {
      await updateRole.mutateAsync({ id, role });
      toast.success("Papel atualizado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function handleLink() {
    if (!linkingUser || !selectedCompany) return;
    try {
      await linkCompany.mutateAsync({
        profileId: linkingUser.id,
        companyId: selectedCompany,
        role: selectedRole,
      });
      toast.success("Empresa vinculada");
      setLinkingUser(null);
      setSelectedCompany("");
      setSelectedRole("owner");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function handleUnlink(profileId: string, companyId: string) {
    try {
      await unlinkCompany.mutateAsync({ profileId, companyId });
      toast.success("Vínculo removido");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Usuários"
        description="Gerencie papéis e vínculos com empresas."
      />

      <Card>
        <CardContent className="p-6">
          <Input
            placeholder="Buscar por nome ou ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
        </CardContent>
      </Card>

      {users.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhum usuário" description="Convide usuários via Supabase Auth." />
      ) : (
        <div className="overflow-hidden rounded-md border border-hairline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Empresas</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-ink">{u.full_name ?? "—"}</span>
                      <span className="text-caption-sm text-muted-soft">{u.id.slice(0, 8)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="w-48">
                    <Select
                      value={u.role}
                      onValueChange={(v) => handleRoleChange(u.id, v as UserRole)}
                    >
                      <SelectTrigger className="h-9 w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hub_admin">Admin Hub</SelectItem>
                        <SelectItem value="company_operator">Operador</SelectItem>
                        <SelectItem value="customer">Cliente</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {u.companies.length === 0 ? (
                      <span className="text-caption text-muted-soft">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {u.companies.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => handleUnlink(u.id, c.id)}
                            title="Remover vínculo"
                            className="inline-flex"
                          >
                            <Badge tone="neutral">{c.name} ×</Badge>
                          </button>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted">{formatDate(u.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setLinkingUser(u);
                        setSelectedCompany("");
                      }}
                    >
                      Vincular empresa
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!linkingUser} onOpenChange={(open) => !open && setLinkingUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular {linkingUser?.full_name ?? "usuário"} a uma empresa</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Label>Empresa</Label>
            <Select value={selectedCompany} onValueChange={setSelectedCompany}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {companies.data?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label>Papel na empresa</Label>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as CompanyRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {COMPANY_ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => setLinkingUser(null)}
                disabled={linkCompany.isPending}
              >
                Cancelar
              </Button>
              <Button onClick={handleLink} disabled={!selectedCompany || linkCompany.isPending}>
                {linkCompany.isPending ? "Vinculando…" : "Vincular"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
