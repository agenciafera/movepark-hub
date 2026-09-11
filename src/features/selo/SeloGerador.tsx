import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { BotaoCopiar } from "./BotaoCopiar";
import { PassoAPassoWix } from "./PassoAPassoWix";
import { FRASES, gerarSnippet, type Estilo, type FraseId, type Fundo } from "./selo.logic";

const ESTILOS: { id: Estilo; label: string }[] = [
  { id: "caixa", label: "Com moldura" },
  { id: "simples", label: "Sem moldura" },
  { id: "texto", label: "Só o texto" },
];

const FUNDOS: { id: Fundo; label: string }[] = [
  { id: "claro", label: "Rodapé claro" },
  { id: "escuro", label: "Rodapé escuro" },
];

/**
 * Um grupo de escolha única. Não é `<Select>` de propósito: são no máximo cinco
 * opções e todas precisam estar visíveis enquanto a pessoa olha a prévia ao lado.
 */
function Segmento<T extends string>({
  legenda,
  opcoes,
  valor,
  onChange,
}: {
  legenda: string;
  opcoes: { id: T; label: string }[];
  valor: T;
  onChange: (id: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-body-sm font-medium text-ink">{legenda}</legend>
      <div className="flex flex-wrap gap-2">
        {opcoes.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={valor === o.id}
            onClick={() => onChange(o.id)}
            className={cn(
              "h-9 rounded-sm border px-3 text-button-sm transition-colors",
              valor === o.id
                ? "border-mp-primary bg-mp-primary/5 text-mp-primary"
                : "border-hairline text-body hover:border-ink",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function SeloGerador() {
  const [frase, setFrase] = useState<FraseId>("parceiro");
  const [estilo, setEstilo] = useState<Estilo>("caixa");
  const [fundo, setFundo] = useState<Fundo>("claro");
  const [parceiro, setParceiro] = useState("");

  const snippet = useMemo(
    () => gerarSnippet({ frase, estilo, fundo, parceiro }),
    [frase, estilo, fundo, parceiro],
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-8 tablet:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Controles */}
        <div className="flex flex-col gap-6">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-body-sm font-medium text-ink">O que o selo diz</legend>
            <div className="flex flex-col gap-2">
              {FRASES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={frase === f.id}
                  onClick={() => setFrase(f.id)}
                  className={cn(
                    "flex flex-col gap-1 rounded-sm border px-4 py-3 text-left transition-colors",
                    frase === f.id
                      ? "border-mp-primary bg-mp-primary/5"
                      : "border-hairline hover:border-ink",
                  )}
                >
                  <span
                    className={cn("text-title-md", frase === f.id ? "text-mp-primary" : "text-ink")}
                  >
                    {f.prefixo} Movepark
                  </span>
                  <span className="text-pretty text-body-sm text-muted">{f.quando}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <Segmento legenda="Formato" opcoes={ESTILOS} valor={estilo} onChange={setEstilo} />
          <Segmento
            legenda="Cor do rodapé do site"
            opcoes={FUNDOS}
            valor={fundo}
            onChange={setFundo}
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor="selo-parceiro">Nome do estacionamento (opcional)</Label>
            <Input
              id="selo-parceiro"
              value={parceiro}
              onChange={(e) => setParceiro(e.target.value)}
              placeholder="Vira Park"
              autoComplete="off"
            />
            <p className="text-pretty text-body-sm text-muted">
              Entra no link para a Movepark saber quantas visitas vieram do seu site.
            </p>
          </div>
        </div>

        {/* Prévia e código */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-body-sm font-medium text-ink">Prévia</span>
            <div
              className={cn(
                "flex min-h-[104px] items-center justify-center rounded-sm border border-hairline p-6",
                fundo === "escuro" ? "bg-mp-navy" : "bg-white",
              )}
            >
              {/* O HTML da prévia é o mesmo que entra na área de transferência: se os
                  dois fossem escritos separados, a prévia mentiria na primeira divergência. */}
              <div dangerouslySetInnerHTML={{ __html: snippet }} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <span className="text-body-sm font-medium text-ink">Código para colar</span>
              <BotaoCopiar valor={snippet} />
            </div>
            <pre className="overflow-x-auto rounded-sm border border-hairline bg-surface-soft p-4 text-body-sm text-body">
              <code>{snippet}</code>
            </pre>
          </div>
        </div>
      </div>

      <PassoAPassoWix frase={frase} fundo={fundo} />
    </div>
  );
}
