import * as React from "react";
import { toast } from "sonner";
import { Copy, WhatsappLogo } from "@phosphor-icons/react";
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
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import {
  useCompanyAccessLinks,
  useCompanyContactEmail,
  useCreateCompanyAccessLink,
  useRevokeCompanyAccessLink,
} from "./api";
import { activeAccessLink, describeAccessLink, shareMessage } from "./accessLink.logic";

type Props = {
  companyId: string;
  companyName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Link de acesso ao Recebimento (23/09/2026, hub_admin). Gera um link que faz o dono cair logado
 * em /operator/recebimento. A URL só aparece aqui, uma vez: a tabela guarda o hash. Gerar de
 * novo revoga o anterior. Spec: docs/specs/link-de-acesso-recebimento.md
 */
export function AccessLinkDialog({ companyId, companyName, open, onOpenChange }: Props) {
  const links = useCompanyAccessLinks(open ? companyId : undefined);
  const contact = useCompanyContactEmail(open ? companyId : undefined);
  const create = useCreateCompanyAccessLink();
  const revoke = useRevokeCompanyAccessLink();
  const [email, setEmail] = React.useState("");
  const [url, setUrl] = React.useState<string | null>(null);
  const vivo = activeAccessLink(links.data);

  React.useEffect(() => {
    if (open) setUrl(null);
  }, [open]);
  React.useEffect(() => {
    if (open && !email && contact.data) setEmail(contact.data);
  }, [open, email, contact.data]);

  async function gerar() {
    try {
      const r = await create.mutateAsync({ company_id: companyId, email: email.trim() });
      setUrl(r.url);
      toast.success("Link gerado. Copie agora: ele não aparece de novo.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar o link.");
    }
  }

  async function revogar() {
    if (!vivo) return;
    try {
      await revoke.mutateAsync(vivo.id);
      setUrl(null);
      toast.success("Link revogado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao revogar.");
    }
  }

  async function copiar(texto: string, aviso: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(aviso);
    } catch {
      toast.error("Não consegui copiar. Selecione o texto e copie à mão.");
    }
  }

  const mensagem = url ? shareMessage(companyName, url) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Link de acesso para {companyName}</DialogTitle>
          <DialogDescription>
            Quem abre o link entra logado como Dono e cai direto no cadastro de recebimento: dados
            bancários, CNPJ e contrato. O link vale até a empresa terminar, ou até você revogar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {vivo && (
            <div className="rounded-md bg-surface-soft p-3 text-body-sm text-body">
              <p>{describeAccessLink(vivo, formatDateTime)}</p>
              <p className="mt-1 text-caption text-muted">
                A URL não fica guardada. Se ele perdeu, gere outro: o anterior deixa de valer.
              </p>
            </div>
          )}

          {url ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="access-url">Link</Label>
                <div className="flex gap-2">
                  <Input id="access-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
                  <Button variant="secondary" onClick={() => copiar(url, "Link copiado.")}>
                    <Copy /> Copiar
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="access-msg">Mensagem pronta para o WhatsApp</Label>
                <Textarea id="access-msg" readOnly rows={5} value={mensagem} />
                <div className="flex justify-end">
                  <Button variant="secondary" onClick={() => copiar(mensagem, "Mensagem copiada.")}>
                    <WhatsappLogo /> Copiar mensagem
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="access-email">E-mail do dono</Label>
              <Input
                id="access-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dono@estacionamento.com.br"
              />
              <p className="text-caption text-muted">
                É com este e-mail que ele entra depois pelo login normal, com código.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2 pt-2">
          <div>
            {vivo && (
              <Button variant="ghost" onClick={revogar} disabled={revoke.isPending}>
                {revoke.isPending ? "Revogando…" : "Revogar link"}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            {!url && (
              <Button onClick={gerar} disabled={create.isPending || !email.trim()}>
                {create.isPending ? "Gerando…" : vivo ? "Gerar outro link" : "Gerar link"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
