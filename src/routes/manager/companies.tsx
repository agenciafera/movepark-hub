import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Building2, UserCog } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { EntityStatusBadge } from "@/components/shared/StatusBadge";
import { useCompanies } from "@/features/companies/api";
import { CompanyForm } from "@/features/companies/CompanyForm";
import { useAuth } from "@/auth/context";
import type { Company } from "@/types/domain";

export default function ManagerCompanies() {
  const { data, isLoading } = useCompanies();
  const { startImpersonation } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<Company | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);

  const filtered = (data ?? []).filter((c) =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.slug.toLowerCase().includes(search.toLowerCase()),
  );

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(c: Company) {
    setEditing(c);
    setFormOpen(true);
  }

  function impersonate(c: Company) {
    startImpersonation(c.id);
    toast.success(`Entrando como operador de ${c.name}`);
    navigate("/operator", { replace: true });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Empresas"
        description="Empresas parceiras da plataforma."
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4" /> Nova empresa
          </Button>
        }
      />

      <Input
        placeholder="Buscar por nome ou slug"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-10 w-10" />}
          title="Nenhuma empresa encontrada"
          description="Crie a primeira empresa para começar."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
          {filtered.map((c) => (
            <Card key={c.id} className="transition-shadow hover:shadow-tier">
              <CardContent className="flex flex-col gap-3 p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-title-md text-ink">{c.name}</span>
                    <span className="text-caption text-muted">/{c.slug}</span>
                  </div>
                  <EntityStatusBadge status={c.status} context="empresa" />
                </div>
                <div className="space-y-0.5 text-body-sm text-muted">
                  {c.legal_name && <div>{c.legal_name}</div>}
                  {c.tax_id && <div>CNPJ {c.tax_id}</div>}
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" onClick={() => impersonate(c)}>
                    <UserCog className="h-4 w-4" />
                    Entrar como operador
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => openEdit(c)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to={`/manager/companies/${c.id}/locations`}>Localizações</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CompanyForm open={formOpen} company={editing} onOpenChange={setFormOpen} />
    </div>
  );
}
