import * as React from "react";
import { toast } from "sonner";
import { Users, UserPlus } from "@/lib/icons";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/auth/context";
import type { CompanyMember, CompanyRole } from "@/types/domain";
import {
  useCompanyMembers,
  useInviteMember,
  useRemoveMember,
  useSetMemberRole,
} from "@/features/team/api";
import {
  ASSIGNABLE_ROLES,
  canModifyMember,
  COMPANY_ROLE_HINT,
  COMPANY_ROLE_LABEL,
} from "@/features/team/team.logic";

function RoleSelect({
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: CompanyRole;
  onChange: (v: CompanyRole) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as CompanyRole)} disabled={disabled}>
      <SelectTrigger className="w-[150px]" aria-label={ariaLabel}>
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
  );
}

function InviteDialog({ companyId }: { companyId: string }) {
  const invite = useInviteMember(companyId);
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<CompanyRole>("operator");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await invite.mutateAsync({ email: email.trim(), role });
      toast.success("Convite enviado");
      setOpen(false);
      setEmail("");
      setRole("operator");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao convidar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="h-4 w-4" />
          Convidar usuário
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar usuário</DialogTitle>
          <DialogDescription>
            Enviamos um link de acesso por e-mail. O papel define o que a pessoa vê no painel.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">E-mail</Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="pessoa@empresa.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-role">Papel</Label>
            <RoleSelect value={role} onChange={setRole} ariaLabel="Papel do convidado" />
            <p className="text-caption text-muted">{COMPANY_ROLE_HINT[role]}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={invite.isPending || !email.trim()}>
              {invite.isPending ? "Enviando…" : "Enviar convite"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MemberRow({
  m,
  members,
  companyId,
  canManage,
  isSelf,
}: {
  m: CompanyMember;
  members: CompanyMember[];
  companyId: string;
  canManage: boolean;
  isSelf: boolean;
}) {
  const setRole = useSetMemberRole(companyId);
  const remove = useRemoveMember(companyId);
  const [confirming, setConfirming] = React.useState(false);
  const modifiable = canModifyMember(members, m.profile_id);

  async function changeRole(role: CompanyRole) {
    if (role === m.role) return;
    try {
      await setRole.mutateAsync({ profileId: m.profile_id, role });
      toast.success("Papel atualizado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar papel");
    }
  }

  async function doRemove() {
    try {
      await remove.mutateAsync(m.profile_id);
      toast.success("Usuário removido da empresa");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-hairline bg-canvas p-4">
      <div className="min-w-0">
        <p className="truncate text-body-sm font-medium text-ink">
          {m.full_name ?? m.email ?? "Usuário"}
          {isSelf && <span className="ml-2 text-caption text-muted">(você)</span>}
        </p>
        {m.email && <p className="truncate text-caption text-muted">{m.email}</p>}
      </div>

      <div className="flex items-center gap-2">
        {canManage ? (
          <RoleSelect
            value={m.role}
            onChange={changeRole}
            disabled={setRole.isPending || (!modifiable && m.role === "owner")}
            ariaLabel="Papel do usuário"
          />
        ) : (
          <Badge tone={m.role === "owner" ? "confirmed" : "neutral"}>
            {COMPANY_ROLE_LABEL[m.role]}
          </Badge>
        )}

        {canManage &&
          (confirming ? (
            <span className="flex items-center gap-1">
              <Button variant="danger" size="sm" onClick={doRemove} disabled={remove.isPending}>
                Confirmar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </span>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirming(true)}
              disabled={!modifiable}
              title={!modifiable ? "A empresa precisa de ao menos um dono" : undefined}
            >
              Remover
            </Button>
          ))}
      </div>
    </div>
  );
}

export default function OperatorUsers() {
  const { effectiveCompanyIds, hasScope, session } = useAuth();
  const companyId = effectiveCompanyIds[0];
  const canManage = hasScope("team:write");
  const { data, isLoading } = useCompanyMembers(companyId);
  const members = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Usuários da empresa"
        description={
          canManage
            ? "Convide e gerencie quem acessa o painel. O papel define o que cada pessoa vê e pode fazer."
            : "Quem acessa o painel da sua empresa. Só o dono pode convidar e alterar papéis."
        }
        actions={canManage && companyId ? <InviteDialog companyId={companyId} /> : undefined}
      />

      {!companyId ? (
        <EmptyState title="Sem empresa vinculada" />
      ) : isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : members.length === 0 ? (
        <EmptyState icon={<Users className="h-10 w-10" />} title="Nenhum usuário" />
      ) : (
        <div className="flex flex-col gap-3">
          {canManage && (
            <div className="flex flex-col gap-1 text-caption text-muted">
              {ASSIGNABLE_ROLES.map((r) => (
                <p key={r}>
                  <strong>{COMPANY_ROLE_LABEL[r]}:</strong> {COMPANY_ROLE_HINT[r]}
                </p>
              ))}
            </div>
          )}
          {members.map((m) => (
            <MemberRow
              key={m.profile_id}
              m={m}
              members={members}
              companyId={companyId}
              canManage={canManage}
              isSelf={m.profile_id === session?.userId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
