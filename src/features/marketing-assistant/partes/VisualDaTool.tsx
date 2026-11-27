import { CheckCircle } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { ConversionFunnel } from "@/features/marketing/ConversionFunnel";
import { Discoveries } from "@/features/marketing/Discoveries";
import { ProfileMatrix } from "@/features/marketing/ProfileMatrix";
import { RfmMatrix } from "@/features/marketing/RfmMatrix";
import type {
  MarketingDiscoveries,
  MarketingFunnel,
  MarketingProfileMatrix,
  MarketingRfmOverview,
} from "@/types/domain";
import {
  grupoDaTool,
  linkDaGravacao,
  propostaDaSaida,
  rotuloDaTool,
  type ParteDeTool,
  type Proposta,
} from "../conversa.logic";
import { CartaoDaProposta } from "./CartaoDaProposta";
import { Calendario } from "./Calendario";
import { Distribuicao } from "./Distribuicao";
import { Oportunidades } from "./Oportunidades";
import { ResultadoDaCampanha } from "./ResultadoDaCampanha";
import { Tendencia } from "./Tendencia";
import { NumerosDaCampanha } from "./NumerosDaCampanha";
import { PreviaDaMensagem } from "./PreviaDaMensagem";
import { PreviaDeSegmento } from "./PreviaDeSegmento";

/** O resultado de uma tool desenhado do jeito que serve ao admin. Consulta de bastidor não tem. */
export function VisualDaTool({
  parte,
  propostas,
  onPedir,
}: {
  parte: ParteDeTool;
  propostas: Proposta[];
  onPedir?: (texto: string) => void;
}) {
  const s = parte.saida;
  switch (grupoDaTool(parte.nome)) {
    case "segmento":
      return <PreviaDeSegmento saida={s} />;
    case "funil":
      return <ConversionFunnel data={s as MarketingFunnel} isLoading={false} />;
    case "rfm":
      return <RfmMatrix data={s as MarketingRfmOverview} isLoading={false} />;
    case "perfis":
      return <ProfileMatrix data={s as MarketingProfileMatrix} isLoading={false} />;
    case "descobertas":
      return <Discoveries data={s as MarketingDiscoveries} isLoading={false} />;
    case "campanha":
      return <NumerosDaCampanha saida={s} />;
    case "mensagem":
      return <PreviaDaMensagem saida={s} />;
    case "oportunidades":
      return <Oportunidades saida={s} onPedir={onPedir} />;
    case "distribuicao":
      return <Distribuicao saida={s} />;
    case "tendencia":
      return <Tendencia saida={s} />;
    case "calendario":
      return <Calendario saida={s} />;
    case "resultado":
      return <ResultadoDaCampanha saida={s} />;
    case "gravacao": {
      const link = linkDaGravacao(parte.nome, parte.entrada, s);
      return (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-ink">
          <CheckCircle size={16} weight="fill" className="shrink-0 text-success" />
          {rotuloDaTool(parte.nome, "pronta")}
          {link ? (
            <Link to={link.href} className="font-medium text-mp-primary underline-offset-2 hover:underline">
              {link.rotulo}
            </Link>
          ) : null}
        </p>
      );
    }
    case "proposta": {
      const p = propostaDaSaida(s);
      if (!p) return null;
      return (
        <CartaoDaProposta
          id={p.id}
          tool={p.tool}
          resumo={p.resumo}
          gravada={propostas.find((x) => x.id === p.id) ?? null}
        />
      );
    }
    default:
      return null;
  }
}
