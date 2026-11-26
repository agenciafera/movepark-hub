import { CheckCircle, CircleNotch, WarningCircle } from "@phosphor-icons/react";
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
import { NumerosDaCampanha } from "./NumerosDaCampanha";
import { PreviaDaMensagem } from "./PreviaDaMensagem";
import { PreviaDeSegmento } from "./PreviaDeSegmento";
import { TabelaGenerica } from "./TabelaGenerica";

function Linha({ parte }: { parte: ParteDeTool }) {
  const Icone = parte.estado === "rodando" ? CircleNotch : parte.estado === "erro" ? WarningCircle : CheckCircle;
  return (
    <p className={"flex items-center gap-2 text-body-sm " + (parte.estado === "erro" ? "text-error" : "text-muted")}>
      <Icone size={16} className={parte.estado === "rodando" ? "shrink-0 animate-spin" : "shrink-0"} />
      {rotuloDaTool(parte.nome, parte.estado)}
      {parte.erro ? `: ${parte.erro}` : null}
    </p>
  );
}

function Corpo({ parte, propostas }: { parte: ParteDeTool; propostas: Proposta[] }) {
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
    case "gravacao": {
      const link = linkDaGravacao(parte.nome, parte.entrada, s);
      return link ? (
        <Link to={link.href} className="text-body-sm font-medium text-mp-primary underline-offset-2 hover:underline">
          {link.rotulo}
        </Link>
      ) : null;
    }
    case "proposta": {
      const p = propostaDaSaida(s);
      if (!p) return <TabelaGenerica saida={s} />;
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
      return <TabelaGenerica saida={s} />;
  }
}

/** Uma tool dentro da conversa: a linha do que fez e, quando terminou bem, o componente dela. */
export function ParteDaTool({ parte, propostas }: { parte: ParteDeTool; propostas: Proposta[] }) {
  return (
    <div className="space-y-2">
      <Linha parte={parte} />
      {parte.estado === "pronta" ? <Corpo parte={parte} propostas={propostas} /> : null}
    </div>
  );
}
