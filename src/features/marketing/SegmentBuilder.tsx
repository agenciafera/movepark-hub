import { Plus, Trash, TreeStructure } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  emptyRule,
  fieldDef,
  isGroup,
  operatorLabel,
  operatorNeedsValue,
  operatorsFor,
  type RuleOperator,
  SEGMENT_FIELDS,
  type SegmentGroup,
  type SegmentRule,
} from "./segmentBuilder.logic";

type Props = {
  value: SegmentGroup;
  onChange: (next: SegmentGroup) => void;
  /** Profundidade, só para o recuo visual do grupo aninhado. */
  depth?: number;
};

/**
 * Construtor visual de segmento: regras encadeadas com "e"/"ou" e grupos aninhados.
 *
 * A árvore inteira é imutável: cada mexida devolve um objeto novo pelo `onChange`. É o que deixa a
 * prévia do público (que roda no banco) recalcular sozinha sem o componente guardar estado próprio
 * que possa divergir do que vai ser salvo.
 */
export function SegmentBuilder({ value, onChange, depth = 0 }: Props) {
  function trocarRegra(index: number, patch: Partial<SegmentRule>) {
    const rules = [...value.rules];
    const atual = rules[index] as SegmentRule;
    rules[index] = { ...atual, ...patch };
    onChange({ ...value, rules });
  }

  function removerNo(index: number) {
    onChange({ ...value, rules: value.rules.filter((_, i) => i !== index) });
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-md border p-3",
        depth > 0 ? "border-hairline bg-surface-soft" : "border-hairline bg-canvas",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-body-sm text-muted">Casar com</span>
        <Select
          value={value.match}
          onValueChange={(v) => onChange({ ...value, match: v as "all" | "any" })}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">todas as regras</SelectItem>
            <SelectItem value="any">qualquer regra</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {value.rules.length === 0 && (
        <p className="rounded-md border border-dashed border-hairline px-3 py-4 text-center text-body-sm text-muted">
          Sem regra nenhuma, o segmento pega a base inteira.
        </p>
      )}

      {value.rules.map((no, index) => {
        if (isGroup(no)) {
          return (
            <div key={index} className="flex items-start gap-2">
              <div className="flex-1">
                <SegmentBuilder
                  value={no}
                  depth={depth + 1}
                  onChange={(next) => {
                    const rules = [...value.rules];
                    rules[index] = next;
                    onChange({ ...value, rules });
                  }}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remover grupo"
                onClick={() => removerNo(index)}
              >
                <Trash className="size-4" />
              </Button>
            </div>
          );
        }

        const def = fieldDef(no.field);
        const ops = operatorsFor(def?.kind ?? "text");

        return (
          <div key={index} className="flex flex-wrap items-start gap-2">
            <Select
              value={no.field}
              onValueChange={(campo) => {
                // Trocar de campo pode invalidar o operador (número → booleano). Reseta os dois
                // para o primeiro operador válido, senão o segmento salva com combinação impossível.
                const novoDef = fieldDef(campo);
                const novosOps = operatorsFor(novoDef?.kind ?? "text");
                trocarRegra(index, {
                  field: campo,
                  op: novosOps.includes(no.op) ? no.op : novosOps[0],
                  value: undefined,
                });
              }}
            >
              <SelectTrigger className="w-[230px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {agruparCampos().map(([grupo, campos]) => (
                  <SelectGroup key={grupo}>
                    <SelectLabel>{grupo}</SelectLabel>
                    {campos.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={no.op}
              onValueChange={(op) =>
                trocarRegra(index, {
                  op: op as RuleOperator,
                  value: operatorNeedsValue(op as RuleOperator) ? no.value : undefined,
                })
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ops.map((op) => (
                  <SelectItem key={op} value={op}>
                    {operatorLabel(op)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {operatorNeedsValue(no.op) && (
              <CampoValor rule={no} onChange={(v) => trocarRegra(index, { value: v })} />
            )}

            {def?.hint && <p className="w-full text-caption-sm text-muted">{def.hint}</p>}

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remover regra"
              onClick={() => removerNo(index)}
            >
              <Trash className="size-4" />
            </Button>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...value, rules: [...value.rules, emptyRule()] })}
        >
          <Plus className="mr-2 size-4" />
          Regra
        </Button>
        {depth < 2 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({
                ...value,
                rules: [...value.rules, { match: "any", rules: [emptyRule()] }],
              })
            }
          >
            <TreeStructure className="mr-2 size-4" />
            Grupo
          </Button>
        )}
      </div>
    </div>
  );
}

function CampoValor({ rule, onChange }: { rule: SegmentRule; onChange: (value: unknown) => void }) {
  const def = fieldDef(rule.field);

  if (rule.op === "between") {
    const par = Array.isArray(rule.value) ? rule.value : ["", ""];
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number"
          className="w-[100px]"
          aria-label="Valor mínimo"
          value={String(par[0] ?? "")}
          onChange={(e) => onChange([numeroOuVazio(e.target.value), par[1] ?? ""])}
        />
        <span className="text-body-sm text-muted">e</span>
        <Input
          type="number"
          className="w-[100px]"
          aria-label="Valor máximo"
          value={String(par[1] ?? "")}
          onChange={(e) => onChange([par[0] ?? "", numeroOuVazio(e.target.value)])}
        />
      </div>
    );
  }

  if (def?.kind === "enum" && (rule.op === "in" || rule.op === "not_in")) {
    const escolhidos = Array.isArray(rule.value) ? rule.value.map(String) : [];
    return (
      <div className="flex flex-wrap gap-1">
        {(def.options ?? []).map((opt) => {
          const marcado = escolhidos.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={marcado}
              onClick={() =>
                onChange(
                  marcado ? escolhidos.filter((v) => v !== opt.value) : [...escolhidos, opt.value],
                )
              }
              className={cn(
                "rounded-full border px-2 py-1 text-caption-sm transition-colors",
                marcado
                  ? "border-primary bg-primary text-white"
                  : "border-hairline bg-canvas text-muted hover:border-primary",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (def?.kind === "enum") {
    return (
      <Select value={String(rule.value ?? "")} onValueChange={onChange}>
        <SelectTrigger className="w-[190px]">
          <SelectValue placeholder="Escolha" />
        </SelectTrigger>
        <SelectContent>
          {(def.options ?? []).map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const numerico = def?.kind === "number" || def?.kind === "money";
  return (
    <Input
      type={numerico ? "number" : "text"}
      className="w-[190px]"
      aria-label={`Valor de ${def?.label ?? rule.field}`}
      value={String(rule.value ?? "")}
      onChange={(e) => onChange(numerico ? numeroOuVazio(e.target.value) : e.target.value)}
    />
  );
}

/** Campo numérico vazio vira "" e não 0: 0 é um filtro legítimo e não pode ser confundido. */
function numeroOuVazio(bruto: string): number | string {
  if (bruto.trim() === "") return "";
  const n = Number(bruto);
  return Number.isNaN(n) ? "" : n;
}

function agruparCampos(): Array<[string, typeof SEGMENT_FIELDS]> {
  const mapa = new Map<string, typeof SEGMENT_FIELDS>();
  for (const campo of SEGMENT_FIELDS) {
    const atual = mapa.get(campo.group) ?? [];
    atual.push(campo);
    mapa.set(campo.group, atual);
  }
  return [...mapa.entries()];
}
