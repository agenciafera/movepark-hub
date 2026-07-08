import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/auth/context";
import { useDeleteAccount } from "./api";

/**
 * Zona de perigo: exclusão da própria conta com confirmação por digitação do e-mail (spec §9).
 * No sucesso: signOut + volta pra home + toast de despedida. Substitui o `confirm()` nativo como
 * padrão de ação destrutiva no projeto.
 */
export function DeleteAccountDialog() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const del = useDeleteAccount();
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");

  const expected = (session?.email ?? "").trim();
  const matches = expected.length > 0 && email.trim().toLowerCase() === expected.toLowerCase();

  async function handleDelete() {
    if (!matches || del.isPending) return;
    try {
      await del.mutateAsync();
      await signOut();
      toast.success("Sua conta foi excluída. Até logo.");
      navigate("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir a conta");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setEmail("");
      }}
    >
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
        Excluir conta
      </Button>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Excluir sua conta</DialogTitle>
          <DialogDescription>Esta ação é permanente e não pode ser desfeita.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-body-sm text-body">
          <p>Ao excluir, você fica anônimo. Isso significa:</p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>Seus dados pessoais, veículos, endereços e cartões salvos são apagados.</li>
            <li>Reservas em andamento são canceladas (com estorno conforme a política).</li>
            <li>
              O histórico de reservas é <strong>mantido de forma anônima</strong> por exigência
              fiscal, sem seus dados pessoais.
            </li>
          </ul>

          <div className="space-y-1.5 pt-2">
            <label htmlFor="delete-confirm-email" className="text-body-sm text-ink">
              Para confirmar, digite seu e-mail (<span className="font-medium">{expected}</span>):
            </label>
            <Input
              id="delete-confirm-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleDelete}
            disabled={!matches || del.isPending}
          >
            {del.isPending ? "Excluindo…" : "Excluir conta"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
