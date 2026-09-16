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
import { CaretLeft, CaretRight, EnvelopeSimple, GoogleLogo, WhatsappLogo } from "@phosphor-icons/react";
import { formatPhoneBR, LOGIN_CHANNEL_LABEL, pageInfo } from "./users.logic";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  useUsers,
  useUpdateUserRole,
  useLinkUserCompany,
  useUnlinkUserCompany,
  useSetTester,
  type LoginChannel,
  type UserListItem,
} from "@/features/users/api";
import { useCompanies } from "@/features/companies/api";
import { formatDate, formatDateTime } from "@/lib/format";
import type { CompanyRole, UserRole } from "@/types/domain";
import { ASSIGNABLE_ROLES, COMPANY_ROLE_LABEL } from "@/features/team/team.logic";

const PAGE_SIZE = 25;

const CHANNEL_ICON: Record<LoginChannel, typeof EnvelopeSimple> = {
  email: EnvelopeSimple,
  whatsapp: WhatsappLogo,
  google: GoogleLogo,
};

/** Espera a pessoa parar de digitar antes de ir ao servidor. */
function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function ManagerUsers() {
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const busca = useDebounced(search, 300);
  // Nova busca sempre começa da primeira página.
  React.useEffect(() => setPage(1), [busca]);
  const users = useUsers({ search: busca, page, pageSize: PAGE_SIZE });
  const companies = useCompanies();
  const updateRole = useUpdateUserRole();
  const linkCompany = useLinkUserCompany();
  const unlinkCompany = useUnlinkUserCompany();
  const setTester = useSetTester();
  const [linkingUser, setLinkingUser] = React.useState<UserListItem | null>(null);
  const [selectedCompany, setSelectedCompany] = React.useState<string>("");
  const [selectedRole, setSelectedRole] = React.useState<CompanyRole>("owner");

  const total = users.data?.total ?? 0;
  const rows = users.data?.rows ?? [];
  const info = pageInfo(total, page, PAGE_SIZE);

  async function handleRoleChange(id: string, role: UserRole) {
    try {
      await updateRole.mutateAsync({ id, role });
      toast.success("Papel atualizado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function handleTester(id: string, enabled: boolean) {
    try {
      await setTester.mutateAsync({ id, enabled });
      toast.success(enabled ? "Agora é testador: vê rascunho no site" : "Deixou de ser testador");
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
        description="Papéis, vínculos com empresas e quem testa rascunho no site."
      />

      <Card>
        <CardContent className="p-6">
          <Input
            placeholder="Buscar por nome, e-mail, telefone ou ID"
            aria-label="Buscar usuário"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
        </CardContent>
      </Card>

      {users.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : users.isError ? (
        <EmptyState
          title="Não deu pra carregar os usuários"
          description={users.error instanceof Error ? users.error.message : "Tente de novo."}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhum usuário"
          description={busca ? "Nada com esse nome, e-mail, telefone ou ID." : "Ainda não há contas."}
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-hairline bg-canvas">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pessoa</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Empresas</TableHead>
                <TableHead>Testador</TableHead>
                <TableHead>Último login</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => {
                const ChannelIcon = u.last_login_channel ? CHANNEL_ICON[u.last_login_channel] : null;
                const phone = formatPhoneBR(u.phone);
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      {/* Nome, e-mail e telefone juntos: é assim que a equipe reconhece uma conta.
                          O id fica por último, curto, para colar em consulta. */}
                      <div className="flex flex-col">
                        <span className="text-ink">{u.full_name ?? "Sem nome"}</span>
                        {u.email && <span className="text-caption text-muted">{u.email}</span>}
                        {phone && <span className="text-caption text-muted">{phone}</span>}
                        <span className="text-caption-sm text-muted-soft">{u.id.slice(0, 8)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="w-48">
                      <Select
                        value={u.role}
                        onValueChange={(v) => handleRoleChange(u.id, v as UserRole)}
                      >
                        <SelectTrigger className="h-9 w-44" aria-label={`Papel de ${u.full_name ?? u.id.slice(0, 8)}`}>
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
                        <span className="text-caption text-muted-soft">-</span>
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
                    <TableCell>
                      {/* Testador vê unidade em Rascunho no site e compra como cliente. hub_admin
                          já é testador por definição, então o interruptor não se aplica. */}
                      {u.role === "hub_admin" ? (
                        <span className="text-caption text-muted">sempre</span>
                      ) : (
                        <Switch
                          aria-label={`Testador: ${u.full_name ?? u.id.slice(0, 8)}`}
                          checked={u.is_tester}
                          onCheckedChange={(v) => handleTester(u.id, v)}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {/* Canal: registrado pelo front a cada login; para logins anteriores a
                          16/09/2026 é o palpite do banco (Google é certo, OTP pode ficar em branco). */}
                      {u.last_login_at ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted">{formatDateTime(u.last_login_at)}</span>
                          {u.last_login_channel && ChannelIcon ? (
                            <span
                              className="inline-flex items-center gap-1 text-caption text-ink"
                              data-testid={`login-channel-${u.id}`}
                            >
                              <ChannelIcon size={14} />
                              {LOGIN_CHANNEL_LABEL[u.last_login_channel]}
                            </span>
                          ) : (
                            <span className="text-caption text-muted-soft">canal não registrado</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-caption text-muted-soft">nunca entrou</span>
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
                );
              })}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3">
            <span className="text-caption text-muted">
              {info.from} a {info.to} de {total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={!info.hasPrev || users.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Página anterior"
              >
                <CaretLeft size={16} />
                Anterior
              </Button>
              <span className="text-caption text-muted">
                {info.current} / {info.pages}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={!info.hasNext || users.isFetching}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Próxima página"
              >
                Próxima
                <CaretRight size={16} />
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!linkingUser} onOpenChange={(open) => !open && setLinkingUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular {linkingUser?.full_name ?? "usuário"} a uma empresa</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Label htmlFor="user-company">Empresa</Label>
            <Select value={selectedCompany} onValueChange={setSelectedCompany}>
              <SelectTrigger id="user-company">
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
            <Label htmlFor="user-role">Papel na empresa</Label>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as CompanyRole)}>
              <SelectTrigger id="user-role">
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
