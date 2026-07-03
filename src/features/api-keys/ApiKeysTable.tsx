import * as React from "react";
import { toast } from "sonner";
import { Plus, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { useCompanyApiKeys, useRevokeApiKey, useRotateApiKey } from "./api";
import { ApiKeyCreateDialog } from "./ApiKeyCreateDialog";
import { lastUsedLabel, statusLabel, type ApiKeyView } from "./api-keys.logic";

export function ApiKeysTable({ companyId }: { companyId: string }) {
  const { data: keys, isLoading } = useCompanyApiKeys(companyId);
  const revoke = useRevokeApiKey(companyId);
  const rotate = useRotateApiKey(companyId);
  const [createOpen, setCreateOpen] = React.useState(false);

  async function onRevoke(k: ApiKeyView) {
    if (!confirm(`Revogar a chave "${k.name}"? Sistemas que a usam vão parar de funcionar.`)) return;
    try {
      await revoke.mutateAsync(k.id);
      toast.success("Chave revogada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao revogar");
    }
  }

  async function onRotate(k: ApiKeyView) {
    if (!confirm(`Rotacionar "${k.name}"? Uma nova chave será gerada e a atual será revogada.`)) return;
    try {
      const res = await rotate.mutateAsync(k.id);
      await navigator.clipboard.writeText(res.key).catch(() => undefined);
      toast.success("Nova chave gerada e copiada. Guarde o segredo agora.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao rotacionar");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Nova chave
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !keys || keys.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="h-10 w-10" />}
          title="Nenhuma chave de API"
          description="Crie uma chave para integrar seus sistemas (ex.: WPS) à API do Movepark."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Nova chave
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Prefixo</TableHead>
              <TableHead>Ambiente</TableHead>
              <TableHead>Escopos</TableHead>
              <TableHead>Último uso</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell>
                  <code className="text-[12px]">{k.key_prefix}…</code>
                </TableCell>
                <TableCell>
                  <Badge tone={k.environment === "live" ? "active" : "neutral"}>{k.environment}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {k.scopes.slice(0, 3).map((s) => (
                      <Badge key={s} tone="neutral" className="text-[10px]">
                        {s}
                      </Badge>
                    ))}
                    {k.scopes.length > 3 && (
                      <Badge tone="neutral" className="text-[10px]">
                        +{k.scopes.length - 3}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted">{lastUsedLabel(k.last_used_at)}</TableCell>
                <TableCell>
                  <Badge tone={k.status === "active" ? "active" : k.status === "revoked" ? "cancelled" : "pending"}>
                    {statusLabel(k.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {k.status === "active" && (
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => onRotate(k)} title="Rotacionar">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onRevoke(k)} title="Revogar">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ApiKeyCreateDialog companyId={companyId} open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
