import * as React from "react";
import {
  ArrowElbowDownRight,
  ChatCircleDots,
  Envelope,
  Flag,
  GitBranch,
  Hourglass,
  Play,
  Trash,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  addNode,
  type CampaignCanvas,
  type CampaignNode,
  type CampaignNodeType,
  connect,
  disconnect,
  moveNode,
  NODE_LABELS,
  NODE_LIBRARY,
  nodeOutlets,
  outgoing,
  reachableNodes,
  removeNode,
  updateNodeData,
  validateCanvas,
} from "./canvas.logic";
import { operatorLabel, operatorsFor, SEGMENT_FIELDS, fieldDef } from "./segmentBuilder.logic";

const NODE_W = 200;
const NODE_H = 84;

const ICONS: Record<CampaignNodeType, React.ComponentType<{ className?: string }>> = {
  trigger: Play,
  email: Envelope,
  whatsapp: ChatCircleDots,
  wait: Hourglass,
  condition: GitBranch,
  exit: Flag,
};

type Props = {
  value: CampaignCanvas;
  onChange: (next: CampaignCanvas) => void;
};

/**
 * Editor de fluxo da campanha: arrasta o passo da paleta para a tela, liga um no outro e configura
 * no painel da direita.
 *
 * Duas mecânicas diferentes de propósito. Soltar da paleta usa drag-and-drop nativo do HTML, que é
 * o gesto certo para "trazer de fora". Mover um nó já colocado usa eventos de ponteiro, porque o
 * drag nativo não dá posição contínua durante o arrasto e o nó andaria aos saltos.
 *
 * Ligar é em dois toques (clica na saída, clica no destino) em vez de arrastar um fio: com fio, o
 * alvo precisa de mira precisa, e a tela é usada em notebook com trackpad.
 */
export function CampaignCanvasEditor({ value, onChange }: Props) {
  const areaRef = React.useRef<HTMLDivElement>(null);
  const [selecionado, setSelecionado] = React.useState<string | null>(null);
  const [ligando, setLigando] = React.useState<{ from: string; branch?: "yes" | "no" } | null>(null);
  const arrasto = React.useRef<{ id: string; dx: number; dy: number } | null>(null);

  const problemas = validateCanvas(value);
  const alcancaveis = reachableNodes(value);
  const noSelecionado = value.nodes.find((n) => n.id === selecionado) ?? null;

  function posicaoNaArea(clientX: number, clientY: number) {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clientX - rect.left + (areaRef.current?.scrollLeft ?? 0),
      y: clientY - rect.top + (areaRef.current?.scrollTop ?? 0),
    };
  }

  function aoMoverPonteiro(e: React.PointerEvent) {
    if (!arrasto.current) return;
    const { x, y } = posicaoNaArea(e.clientX, e.clientY);
    onChange(
      moveNode(value, arrasto.current.id, {
        x: x - arrasto.current.dx,
        y: y - arrasto.current.dy,
      }),
    );
  }

  function aoClicarNo(node: CampaignNode) {
    if (ligando) {
      // Segundo toque do gesto de ligar: fecha a aresta e sai do modo.
      if (ligando.from !== node.id) {
        const proximo = connect(value, ligando.from, node.id, ligando.branch);
        if (proximo === value) {
          // `connect` devolve o mesmo objeto quando recusa (ciclo). Sai do modo mesmo assim,
          // senão o usuário fica preso clicando sem entender por que nada acontece.
          setLigando(null);
          return;
        }
        onChange(proximo);
      }
      setLigando(null);
      return;
    }
    setSelecionado(node.id);
  }

  return (
    <div className="grid gap-4 desktop:grid-cols-[220px_1fr_300px]">
      {/* Paleta */}
      <aside className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-ink">Passos</h3>
        <p className="text-xs text-muted">Arraste para a tela.</p>
        {NODE_LIBRARY.map((item) => {
          const Icone = ICONS[item.type];
          return (
            <div
              key={item.type}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", `novo:${item.type}`)}
              className="cursor-grab rounded-md border border-hairline bg-canvas p-2 active:cursor-grabbing"
            >
              <div className="flex items-center gap-2">
                <Icone className="size-4 text-primary" />
                <span className="text-sm font-medium text-ink">{item.label}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted">{item.hint}</p>
            </div>
          );
        })}

        {problemas.length > 0 && (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2">
            <p className="text-xs font-medium text-amber-800">
              {problemas.length} ponto(s) a resolver
            </p>
            <ul className="mt-1 flex flex-col gap-1 text-xs text-amber-800">
              {problemas.slice(0, 6).map((p, i) => (
                <li key={i}>{p.message}</li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      {/* Tela */}
      <div
        ref={areaRef}
        className="relative h-[560px] overflow-auto rounded-md border border-hairline bg-surface-soft"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(0,0,0,0.08) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const dado = e.dataTransfer.getData("text/plain");
          if (!dado.startsWith("novo:")) return;
          const tipo = dado.slice(5) as CampaignNodeType;
          const { x, y } = posicaoNaArea(e.clientX, e.clientY);
          onChange(addNode(value, tipo, { x: x - NODE_W / 2, y: y - NODE_H / 2 }));
        }}
        onPointerMove={aoMoverPonteiro}
        onPointerUp={() => (arrasto.current = null)}
        onPointerLeave={() => (arrasto.current = null)}
      >
        <svg className="pointer-events-none absolute inset-0 size-full overflow-visible">
          {value.edges.map((edge, i) => {
            const de = value.nodes.find((n) => n.id === edge.from);
            const para = value.nodes.find((n) => n.id === edge.to);
            if (!de || !para) return null;
            const x1 = de.x + NODE_W;
            const y1 = de.y + NODE_H / 2 + (edge.branch === "yes" ? -14 : edge.branch === "no" ? 14 : 0);
            const x2 = para.x;
            const y2 = para.y + NODE_H / 2;
            const meio = (x1 + x2) / 2;
            return (
              <g key={i}>
                <path
                  d={`M ${x1} ${y1} C ${meio} ${y1}, ${meio} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={edge.branch === "no" ? "#DA455E" : "#5D5FEF"}
                  strokeWidth={2}
                />
                <circle cx={x2} cy={y2} r={3} fill={edge.branch === "no" ? "#DA455E" : "#5D5FEF"} />
              </g>
            );
          })}
        </svg>

        {value.nodes.map((node) => {
          const Icone = ICONS[node.type];
          const solto = !alcancaveis.has(node.id);
          const temProblema = problemas.some((p) => p.nodeId === node.id);
          return (
            <div
              key={node.id}
              role="button"
              tabIndex={0}
              onClick={() => aoClicarNo(node)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  aoClicarNo(node);
                }
              }}
              onPointerDown={(e) => {
                if (ligando) return;
                const { x, y } = posicaoNaArea(e.clientX, e.clientY);
                arrasto.current = { id: node.id, dx: x - node.x, dy: y - node.y };
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              }}
              className={cn(
                "absolute flex cursor-grab select-none flex-col gap-1 rounded-md border-2 bg-canvas p-2 shadow-sm active:cursor-grabbing",
                selecionado === node.id ? "border-primary" : "border-hairline",
                temProblema && "border-amber-400",
                solto && "opacity-50",
                ligando && ligando.from !== node.id && "ring-2 ring-primary/40",
              )}
              style={{ left: node.x, top: node.y, width: NODE_W, minHeight: NODE_H }}
            >
              <div className="flex items-center gap-2">
                <Icone className="size-4 shrink-0 text-primary" />
                <span className="text-sm font-medium text-ink">{NODE_LABELS[node.type]}</span>
              </div>
              <p className="line-clamp-2 text-xs text-muted">{resumoDoNo(node)}</p>

              {/* Saídas */}
              <div className="mt-auto flex flex-wrap gap-1 pt-1">
                {nodeOutlets(node.type).map((saida) => {
                  const branch = saida === "next" ? undefined : saida;
                  const jaLigada = outgoing(value, node.id, branch);
                  const ativa = ligando?.from === node.id && ligando.branch === branch;
                  return (
                    <button
                      key={saida}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLigando(ativa ? null : { from: node.id, branch });
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className={cn(
                        "rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                        ativa
                          ? "border-primary bg-primary text-white"
                          : jaLigada
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-hairline text-muted",
                      )}
                    >
                      {saida === "next" ? "seguir" : saida === "yes" ? "sim" : "não"}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {ligando && (
          <p className="sticky bottom-2 left-2 z-10 ml-2 w-fit rounded-md bg-ink px-2 py-1 text-xs text-white">
            Clique no passo de destino. Esc cancela.
          </p>
        )}
      </div>

      {/* Inspetor */}
      <aside className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-ink">Configuração</h3>
        {!noSelecionado ? (
          <p className="rounded-md border border-dashed border-hairline p-3 text-xs text-muted">
            Clique num passo para configurar.
          </p>
        ) : (
          <Inspetor
            node={noSelecionado}
            canvas={value}
            onChange={onChange}
            onRemove={() => {
              onChange(removeNode(value, noSelecionado.id));
              setSelecionado(null);
            }}
          />
        )}
      </aside>
    </div>
  );
}

function resumoDoNo(node: CampaignNode): string {
  switch (node.type) {
    case "trigger":
      return "Quem entra no segmento da campanha";
    case "email":
      return String(node.data?.subject || "Sem assunto");
    case "whatsapp":
      return String(node.data?.template || "Sem template");
    case "wait":
      return `Espera ${node.data?.hours ?? 24}h`;
    case "condition": {
      const d = fieldDef(String(node.data?.field ?? ""));
      return `${d?.label ?? node.data?.field} ${operatorLabel(
        (node.data?.op ?? "eq") as never,
      )} ${node.data?.value ?? ""}`;
    }
    case "exit":
      return "Fim da jornada";
    default:
      return "";
  }
}

function Inspetor({
  node,
  canvas,
  onChange,
  onRemove,
}: {
  node: CampaignNode;
  canvas: CampaignCanvas;
  onChange: (next: CampaignCanvas) => void;
  onRemove: () => void;
}) {
  const set = (patch: Record<string, unknown>) => onChange(updateNodeData(canvas, node.id, patch));

  return (
    <div className="flex flex-col gap-3 rounded-md border border-hairline bg-canvas p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">{NODE_LABELS[node.type]}</span>
        {node.type !== "trigger" && (
          <Button variant="ghost" size="icon" aria-label="Remover passo" onClick={onRemove}>
            <Trash className="size-4" />
          </Button>
        )}
      </div>

      {node.type === "email" && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="no-assunto">Assunto</Label>
            <Input
              id="no-assunto"
              value={String(node.data?.subject ?? "")}
              onChange={(e) => set({ subject: e.target.value })}
              placeholder="Sua vaga no Confins, {{nome}}"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="no-corpo">Mensagem</Label>
            <Textarea
              id="no-corpo"
              rows={8}
              value={String(node.data?.body ?? "")}
              onChange={(e) => set({ body: e.target.value })}
              placeholder="Oi {{nome}}, faz {{dias_sem_comprar}} dias que você não viaja com a gente."
            />
          </div>
          <p className="text-xs text-muted">
            Marcações: {"{{nome}}"}, {"{{reservas}}"}, {"{{ticket_medio}}"}, {"{{total_gasto}}"},{" "}
            {"{{dias_sem_comprar}}"}, {"{{carro}}"}. O link de descadastro entra sozinho no rodapé.
          </p>
        </>
      )}

      {node.type === "whatsapp" && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="no-template">Template aprovado</Label>
            <Input
              id="no-template"
              value={String(node.data?.template ?? "")}
              onChange={(e) => set({ template: e.target.value })}
              placeholder="nome_do_template"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="no-params">Parâmetros do corpo (um por linha)</Label>
            <Textarea
              id="no-params"
              rows={4}
              value={(Array.isArray(node.data?.params) ? node.data.params : []).join("\n")}
              onChange={(e) =>
                set({ params: e.target.value.split("\n").filter((l) => l.trim() !== "") })
              }
              placeholder="{{nome}}"
            />
          </div>
          <p className="text-xs text-muted">
            A Meta só entrega template aprovado, e só para quem deu opt-in de WhatsApp.
          </p>
        </>
      )}

      {node.type === "wait" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="no-horas">Esperar (horas)</Label>
          <Input
            id="no-horas"
            type="number"
            min={1}
            value={String(node.data?.hours ?? 24)}
            onChange={(e) => set({ hours: Number(e.target.value) })}
          />
        </div>
      )}

      {node.type === "condition" && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label>Campo</Label>
            <Select
              value={String(node.data?.field ?? "bookings_count")}
              onValueChange={(v) => set({ field: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEGMENT_FIELDS.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Operador</Label>
            <Select
              value={String(node.data?.op ?? "gte")}
              onValueChange={(v) => set({ op: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {operatorsFor(fieldDef(String(node.data?.field ?? ""))?.kind ?? "number").map(
                  (op) => (
                    <SelectItem key={op} value={op}>
                      {operatorLabel(op)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="no-valor">Valor</Label>
            <Input
              id="no-valor"
              value={String(node.data?.value ?? "")}
              onChange={(e) => {
                const bruto = e.target.value;
                const n = Number(bruto);
                set({ value: bruto !== "" && !Number.isNaN(n) ? n : bruto });
              }}
            />
          </div>
        </>
      )}

      {/* Ligações que saem daqui */}
      <div className="flex flex-col gap-1 border-t border-hairline pt-2">
        <span className="text-xs font-medium text-muted">Saídas</span>
        {nodeOutlets(node.type).length === 0 && (
          <span className="text-xs text-muted">Este passo encerra o fluxo.</span>
        )}
        {nodeOutlets(node.type).map((saida) => {
          const branch = saida === "next" ? undefined : saida;
          const aresta = outgoing(canvas, node.id, branch);
          const destino = canvas.nodes.find((n) => n.id === aresta?.to);
          return (
            <div key={saida} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1 text-muted">
                <ArrowElbowDownRight className="size-3" />
                {saida === "next" ? "seguir" : saida === "yes" ? "sim" : "não"}
              </span>
              {destino ? (
                <span className="flex items-center gap-1">
                  <span className="text-ink">{NODE_LABELS[destino.type]}</span>
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => onChange(disconnect(canvas, node.id, branch))}
                  >
                    desligar
                  </button>
                </span>
              ) : (
                <span className="text-muted">sem destino</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
