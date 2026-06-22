import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateCompany, useUpdateCompany } from "./api";
import { normalizeWlDomain, wlApiBaseUrl } from "./wl";
import { cnpjMask } from "@/lib/masks";
import type { Company, EntityStatus } from "@/types/domain";

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type Props = {
  open: boolean;
  company: Company | null;
  onOpenChange: (open: boolean) => void;
};

export function CompanyForm({ open, company, onOpenChange }: Props) {
  const create = useCreateCompany();
  const update = useUpdateCompany();
  const isEdit = !!company;

  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [legalName, setLegalName] = React.useState("");
  const [taxId, setTaxId] = React.useState("");
  const [status, setStatus] = React.useState<EntityStatus>("active");
  const [wlDomain, setWlDomain] = React.useState("");
  const [wlTenantKey, setWlTenantKey] = React.useState("");
  const [wlSyncEnabled, setWlSyncEnabled] = React.useState(false);
  const [wpsUrl, setWpsUrl] = React.useState("");
  const [wpsSecret, setWpsSecret] = React.useState("");
  const [wpsEnabled, setWpsEnabled] = React.useState(false);
  // Segredo é write-only: não exibimos o valor; só sabemos se já existe um.
  const hasWpsSecret = !!company?.wps_webhook_secret;

  React.useEffect(() => {
    if (open) {
      setName(company?.name ?? "");
      setSlug(company?.slug ?? "");
      setLegalName(company?.legal_name ?? "");
      setTaxId(cnpjMask(company?.tax_id ?? ""));
      setStatus(company?.status ?? "active");
      setWlDomain(company?.wl_domain ?? "");
      setWlTenantKey(company?.wl_tenant_key ?? "");
      setWlSyncEnabled(company?.wl_sync_enabled ?? false);
      setWpsUrl(company?.wps_webhook_url ?? "");
      setWpsSecret("");
      setWpsEnabled(company?.wps_webhook_enabled ?? false);
    }
  }, [open, company]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const wlHost = normalizeWlDomain(wlDomain);
    const wlTenant = wlTenantKey.trim() || null;
    if (wlSyncEnabled && (!wlHost || !wlTenant)) {
      toast.error("Para ligar a sincronização, preencha o domínio e o tenant (X-Tenant) do white-label.");
      return;
    }
    const wpsUrlTrim = wpsUrl.trim() || null;
    const wpsSecretTrim = wpsSecret.trim();
    if (wpsEnabled && (!wpsUrlTrim || (!hasWpsSecret && !wpsSecretTrim))) {
      toast.error("Para ligar o webhook do pátio (WPS), preencha a URL e o segredo.");
      return;
    }
    const payload = {
      name,
      slug: slug || slugify(name),
      legal_name: legalName || null,
      tax_id: taxId.replace(/\D/g, "") || null,
      status,
      wl_domain: wlHost,
      wl_tenant_key: wlTenant,
      wl_sync_enabled: wlSyncEnabled,
      wps_webhook_url: wpsUrlTrim,
      wps_webhook_enabled: wpsEnabled,
      // só grava o segredo quando o usuário digita um novo (write-only)
      ...(wpsSecretTrim ? { wps_webhook_secret: wpsSecretTrim } : {}),
    };
    try {
      if (isEdit && company) {
        await update.mutateAsync({ id: company.id, patch: payload });
        toast.success("Empresa atualizada");
      } else {
        await create.mutateAsync(payload);
        toast.success("Empresa criada");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  const submitting = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar empresa" : "Nova empresa"}</DialogTitle>
        </DialogHeader>
        <form className="grid grid-cols-1 gap-4 tablet:grid-cols-2" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5 tablet:col-span-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!isEdit) setSlug(slugify(e.target.value));
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              required
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="legal">Razão social</Label>
            <Input id="legal" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tax">CNPJ</Label>
            <Input
              id="tax"
              value={taxId}
              onChange={(e) => setTaxId(cnpjMask(e.target.value))}
              placeholder="00.000.000/0000-00"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as EntityStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativa</SelectItem>
                <SelectItem value="inactive">Inativa</SelectItem>
                <SelectItem value="suspended">Suspensa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Integração com o white-label legado (E2.5.1 — sincronização de disponibilidade) */}
          <div className="mt-2 flex flex-col gap-4 rounded-md border border-hairline p-4 tablet:col-span-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-body-sm font-medium text-ink">Integração White-label</p>
                <p className="text-caption text-muted">
                  Liga a sincronização de disponibilidade com o sistema legado desta empresa. O token é
                  global (secret do servidor); aqui você diz <strong>onde</strong> e <strong>qual tenant</strong>.
                </p>
              </div>
              <Switch checked={wlSyncEnabled} onCheckedChange={setWlSyncEnabled} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wl-domain">Domínio do backend WL</Label>
              <Input
                id="wl-domain"
                value={wlDomain}
                onChange={(e) => setWlDomain(e.target.value)}
                placeholder="ferapark.movepark.com.br"
              />
              {normalizeWlDomain(wlDomain) && (
                <p className="text-caption text-muted">
                  API: <code>{wlApiBaseUrl(wlDomain)}</code>
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wl-tenant">Tenant (header X-Tenant / whitelabel key)</Label>
              <Input
                id="wl-tenant"
                value={wlTenantKey}
                onChange={(e) => setWlTenantKey(e.target.value)}
                placeholder="ex: ferapark"
              />
            </div>
          </div>

          {/* Integração de pátio (WPS) — webhook outbound (E2.6.1) */}
          <div className="mt-2 flex flex-col gap-4 rounded-md border border-hairline p-4 tablet:col-span-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-body-sm font-medium text-ink">Integração de pátio (WPS)</p>
                <p className="text-caption text-muted">
                  O Hub notifica o sistema de pátio quando uma reserva é confirmada/cancelada (assinado por
                  HMAC). O check-in/out real vem pelo Public API (escopo <code>wps:write</code>).
                </p>
              </div>
              <Switch checked={wpsEnabled} onCheckedChange={setWpsEnabled} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wps-url">URL do webhook do pátio</Label>
              <Input
                id="wps-url"
                type="url"
                value={wpsUrl}
                onChange={(e) => setWpsUrl(e.target.value)}
                placeholder="https://wps.parceiro.com/webhooks/movepark"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wps-secret">Segredo (HMAC)</Label>
              <Input
                id="wps-secret"
                type="password"
                value={wpsSecret}
                onChange={(e) => setWpsSecret(e.target.value)}
                placeholder={hasWpsSecret ? "•••••• (já definido — preencha para trocar)" : "defina um segredo"}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 tablet:col-span-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
