import * as React from "react";
import { PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import type { ConversaResumo } from "./api";

type Props = {
  conversas: ConversaResumo[];
  ativaId: string | undefined;
  onNova: () => void;
  onAbrir: (id: string) => void;
  onRenomear: (id: string, titulo: string) => void;
  onApagar: (id: string) => void;
};

const titulo = (c: ConversaResumo) => c.titulo.trim() || "Conversa sem título";

/** A coluna da esquerda da página Assistente de IA: nova, abrir, renomear e apagar. */
export function ListaDeConversas({ conversas, ativaId, onNova, onAbrir, onRenomear, onApagar }: Props) {
  const [editando, setEditando] = React.useState<string | null>(null);
  const [rascunho, setRascunho] = React.useState("");
  const [apagando, setApagando] = React.useState<ConversaResumo | null>(null);
  // Enter e blur chegam juntos quando o campo some; Esc seguido de blur salvaria o título velho.
  // A trava faz cada edição terminar uma vez só.
  const encerrada = React.useRef(false);

  const abrirEdicao = (c: ConversaResumo) => {
    encerrada.current = false;
    setRascunho(c.titulo);
    setEditando(c.id);
  };

  const salvar = (id: string, original: string) => {
    if (encerrada.current) return;
    encerrada.current = true;
    const t = rascunho.trim();
    if (t && t !== original) onRenomear(id, t);
    setEditando(null);
  };

  const cancelar = () => {
    encerrada.current = true;
    setEditando(null);
  };

  return (
    <aside className="flex w-full flex-col gap-2 border-hairline tablet:w-64 tablet:shrink-0 tablet:border-r tablet:pr-3">
      <Button variant="outline" onClick={onNova} className="justify-start gap-2">
        <Plus size={16} /> Nova conversa
      </Button>
      <ul className="flex flex-col gap-1 overflow-y-auto">
        {conversas.map((c) => (
          <li
            key={c.id}
            className={"group rounded-lg px-2 py-1.5 " + (c.id === ativaId ? "bg-surface-strong" : "hover:bg-surface-soft")}
          >
            {editando === c.id ? (
              <Input
                autoFocus
                aria-label="Novo título"
                value={rascunho}
                maxLength={80}
                onChange={(e) => setRascunho(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") salvar(c.id, c.titulo);
                  if (e.key === "Escape") cancelar();
                }}
                onBlur={() => salvar(c.id, c.titulo)}
              />
            ) : (
              <div className="flex items-center gap-1">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onAbrir(c.id)}>
                  <span className="block truncate text-body-sm text-ink">{titulo(c)}</span>
                  <span className="block text-caption-sm text-muted">{formatDateTime(c.atualizada_em)}</span>
                </button>
                <button
                  type="button"
                  aria-label="Renomear"
                  className="rounded p-1 text-muted opacity-0 hover:text-ink focus:opacity-100 group-hover:opacity-100"
                  onClick={() => abrirEdicao(c)}
                >
                  <PencilSimple size={14} />
                </button>
                <button
                  type="button"
                  aria-label="Apagar"
                  className="rounded p-1 text-muted opacity-0 hover:text-error focus:opacity-100 group-hover:opacity-100"
                  onClick={() => setApagando(c)}
                >
                  <Trash size={14} />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={!!apagando} onOpenChange={(aberto) => !aberto && setApagando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-balance">Apagar "{apagando ? titulo(apagando) : ""}"?</DialogTitle>
          </DialogHeader>
          <p className="text-pretty text-body-sm text-body">
            A conversa some da lista e não volta. O que o assistente gravou na Automação continua lá.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setApagando(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (apagando) onApagar(apagando.id);
                setApagando(null);
              }}
            >
              Apagar conversa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
