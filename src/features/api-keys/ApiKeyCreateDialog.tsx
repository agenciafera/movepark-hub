import * as React from "react";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApiScopes, useCreateApiKey } from "./api";
import {
  buildApiKeyCreateArgs,
  EMPTY_API_KEY_FORM,
  groupScopesByModule,
  validateApiKeyForm,
  type ApiKeyFormValues,
  type ApiKeySecret,
} from "./api-keys.logic";

export function ApiKeyCreateDialog({
  companyId,
  open,
  onOpenChange,
}: {
  companyId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [f, setF] = React.useState<ApiKeyFormValues>(EMPTY_API_KEY_FORM);
  const [secret, setSecret] = React.useState<ApiKeySecret | null>(null);
  const [copied, setCopied] = React.useState(false);
  const { data: scopes = [] } = useApiScopes();
  const create = useCreateApiKey(companyId);

  React.useEffect(() => {
    if (open) {
      setF(EMPTY_API_KEY_FORM);
      setSecret(null);
      setCopied(false);
    }
  }, [open]);

  const grouped = React.useMemo(() => groupScopesByModule(scopes), [scopes]);

  function toggleScope(scope: string, checked: boolean) {
    setF((p) => ({
      ...p,
      scopes: checked ? [...p.scopes, scope] : p.scopes.filter((s) => s !== scope),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateApiKeyForm(f);
    if (err) {
      toast.error(err);
      return;
    }
    try {
      const res = await create.mutateAsync(buildApiKeyCreateArgs(companyId, f));
      setSecret(res);
      toast.success("Chave criada. Copie o segredo agora.");
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Erro ao criar a chave");
    }
  }

  async function copySecret() {
    if (!secret) return;
    await navigator.clipboard.writeText(secret.key);
    setCopied(true);
    toast.success("Segredo copiado");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {secret ? (
          <>
            <DialogHeader>
              <DialogTitle>Chave criada</DialogTitle>
              <DialogDescription>
                Copie e guarde agora. Por segurança, o segredo <strong>não será exibido novamente</strong>.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-sm border border-hairline bg-surface-soft p-3">
              <code className="flex-1 break-all text-body-sm">{secret.key}</code>
              <Button type="button" variant="secondary" size="sm" onClick={copySecret}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex justify-end pt-2">
              <Button type="button" onClick={() => onOpenChange(false)}>
                Concluir
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Nova chave de API</DialogTitle>
              <DialogDescription>
                Conceda apenas os escopos necessários (princípio do menor privilégio).
              </DialogDescription>
            </DialogHeader>
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ak-name">Nome</Label>
                  <Input
                    id="ak-name"
                    placeholder="Integração WPS"
                    value={f.name}
                    onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ak-env">Ambiente</Label>
                  <Select
                    value={f.environment}
                    onValueChange={(v) => setF((p) => ({ ...p, environment: v as ApiKeyFormValues["environment"] }))}
                  >
                    <SelectTrigger id="ak-env">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="live">Produção (live)</SelectItem>
                      <SelectItem value="test">Sandbox (test)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ak-exp">Expiração (opcional)</Label>
                <Input
                  id="ak-exp"
                  type="date"
                  value={f.expires_at}
                  onChange={(e) => setF((p) => ({ ...p, expires_at: e.target.value }))}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>Escopos</Label>
                <div className="flex flex-col gap-4 rounded-sm border border-hairline p-3">
                  {Object.entries(grouped).map(([module, items]) => (
                    <div key={module} className="flex flex-col gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-steel">
                        {module}
                      </span>
                      {items.map((s) => (
                        <label key={s.scope} className="flex items-start gap-2 text-body-sm">
                          <Checkbox
                            checked={f.scopes.includes(s.scope)}
                            onCheckedChange={(c) => toggleScope(s.scope, c === true)}
                          />
                          <span>
                            <code className="text-[12px]">{s.scope}</code>
                            <span className="text-muted">: {s.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "Criando…" : "Criar chave"}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
