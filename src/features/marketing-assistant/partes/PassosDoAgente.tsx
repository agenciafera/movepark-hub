import * as React from "react";
import { CaretDown, CaretRight, CheckCircle, CircleNotch, WarningCircle } from "@phosphor-icons/react";
import { grupoDaTool, ondeMostrar, rotuloDaTool, type ParteDeTool, type Proposta } from "../conversa.logic";
import { VisualDaTool } from "./VisualDaTool";

function Passo({ parte, propostas }: { parte: ParteDeTool; propostas: Proposta[] }) {
  const [aberto, setAberto] = React.useState(false);
  const temVisual = parte.estado === "pronta" && ondeMostrar(grupoDaTool(parte.nome)) === "sob_demanda";
  const Icone = parte.estado === "erro" ? WarningCircle : CheckCircle;
  return (
    <li className="space-y-2">
      <div className={"flex items-center gap-2 text-body-sm " + (parte.estado === "erro" ? "text-error" : "text-muted")}>
        <Icone size={14} className="shrink-0" />
        <span>
          {rotuloDaTool(parte.nome, parte.estado)}
          {parte.erro ? `: ${parte.erro}` : null}
        </span>
        {temVisual ? (
          <button
            type="button"
            className="font-medium text-mp-primary underline-offset-2 hover:underline"
            onClick={() => setAberto((v) => !v)}
          >
            {aberto ? "Esconder" : "Ver"}
          </button>
        ) : null}
      </div>
      {temVisual && aberto ? (
        <div className="rounded-xl border border-hairline bg-surface p-3">
          <VisualDaTool parte={parte} propostas={propostas} />
        </div>
      ) : null}
    </li>
  );
}

/**
 * O trabalho do agente num turno, numa linha só. Enquanto roda, mostra o passo da vez; quando
 * termina, fica recolhido em "Ver os N passos". Gráfico e números de campanha ficam a um clique
 * dentro do passo; consulta de bastidor nunca mostra dado.
 */
export function PassosDoAgente({ passos, propostas }: { passos: ParteDeTool[]; propostas: Proposta[] }) {
  const [aberto, setAberto] = React.useState(false);
  if (passos.length === 0) return null;
  const rodando = passos.find((p) => p.estado === "rodando");
  if (rodando) {
    return (
      <p className="flex items-center gap-2 text-body-sm text-muted">
        <CircleNotch size={14} className="shrink-0 animate-spin" />
        {rotuloDaTool(rodando.nome, "rodando")}
      </p>
    );
  }
  const n = passos.length;
  const Seta = aberto ? CaretDown : CaretRight;
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="flex items-center gap-1.5 text-body-sm text-muted hover:text-ink"
        onClick={() => setAberto((v) => !v)}
      >
        <Seta size={12} />
        {aberto ? (n === 1 ? "Esconder o passo" : "Esconder os passos") : n === 1 ? "Ver o passo" : `Ver os ${n} passos`}
      </button>
      {aberto ? (
        <ul className="space-y-1.5 border-l border-hairline pl-3">
          {passos.map((p, i) => (
            <Passo key={p.id || i} parte={p} propostas={propostas} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
