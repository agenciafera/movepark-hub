import * as React from "react";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/auth/context";
import type { CompanyMember, CompanyRole } from "@/types/domain";
import { useCompanyMembers, useRemoveMember, useSetMemberRole } from "@/features/team/api";
import { canModifyMember, COMPANY_ROLE_HINT, COMPANY_ROLE_LABEL } from "@/features/team/team.logic";

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
          <Select
            value={m.role}
            onValueChange={(v) => changeRole(v as CompanyRole)}
            disabled={setRole.isPending || (!modifiable && m.role === "owner")}
          >
            <SelectTrigger className="w-[150px]" aria-label="Papel do usuário">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="owner">{COMPANY_ROLE_LABEL.owner}</SelectItem>
              <SelectItem value="operator">{COMPANY_ROLE_LABEL.operator}</SelectItem>
            </SelectContent>
          </Select>
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
  const { effectiveCompanyIds, isCompanyOwner, session } = useAuth();
  const companyId = effectiveCompanyIds[0];
  const { data, isLoading } = useCompanyMembers(companyId);
  const members = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Usuários da empresa"
        description={
          isCompanyOwner
            ? "Gerencie quem acessa o painel da sua empresa. Donos têm acesso total; operacionais cuidam do dia a dia."
            : "Quem acessa o painel da sua empresa. Só o dono pode alterar papéis."
        }
      />

      {!companyId ? (
        <EmptyState title="Sem empresa vinculada" />
      ) : isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : members.length === 0 ? (
        <EmptyState icon={<Users className="h-10 w-10" />} title="Nenhum usuário" />
      ) : (
        <div className="flex flex-col gap-3">
          {isCompanyOwner && (
            <p className="text-caption text-muted">
              <strong>Dono:</strong> {COMPANY_ROLE_HINT.owner} <strong className="ml-2">Operacional:</strong>{" "}
              {COMPANY_ROLE_HINT.operator}
            </p>
          )}
          {members.map((m) => (
            <MemberRow
              key={m.profile_id}
              m={m}
              members={members}
              companyId={companyId}
              canManage={isCompanyOwner}
              isSelf={m.profile_id === session?.userId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
