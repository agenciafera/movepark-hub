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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateCompany, useUpdateCompany } from "./api";
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

  React.useEffect(() => {
    if (open) {
      setName(company?.name ?? "");
      setSlug(company?.slug ?? "");
      setLegalName(company?.legal_name ?? "");
      setTaxId(company?.tax_id ?? "");
      setStatus(company?.status ?? "active");
    }
  }, [open, company]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name,
      slug: slug || slugify(name),
      legal_name: legalName || null,
      tax_id: taxId || null,
      status,
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
            <Input id="tax" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
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
