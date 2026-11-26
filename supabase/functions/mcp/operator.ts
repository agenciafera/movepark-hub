// MCP /operator: handlers impuros do assistente do operador (RPC, embedding, gravação).
//
// A empresa vem SEMPRE do token do assistente (ctx.company_id), nunca de argumento nem do modelo.
// As RPCs `assist_*` recebem a empresa e recusam reserva de outra. Ver
// docs/specs/assistente-do-operador.md.

import { embedQuery } from "../_shared/embedding.ts";
import {
  analisarReserva,
  type Cotacao,
  montarProposta,
  OPERATOR_PARTNER_READS,
  quando,
  reais,
  type Situacao,
  upgradeParaTrocarDatas,
} from "./operator.logic.ts";

export interface OperatorCtx {
  api_key_id: string | null;
  company_id: string;
  profile_id: string;
  papel: string | null;
  scopes: string[];
}

export interface OperatorDeps {
  /** Executa uma leitura de parceiro com a empresa do token (reaproveita o handler do /partner). */
  callPartner: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  geminiKey: string;
  now: () => Date;
}

const texto = (v: unknown, max = 500): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

// deno-lint-ignore no-explicit-any
async function situacao(admin: any, ctx: OperatorCtx, ref: unknown): Promise<Situacao> {
  const booking = texto(ref, 80);
  if (!booking) throw new Error("Informe o código da reserva.");
  const { data, error } = await admin.rpc("assist_booking_situation", { p_company_id: ctx.company_id, p_ref: booking });
  if (error) throw error;
  return data as Situacao;
}

// deno-lint-ignore no-explicit-any
async function cotar(admin: any, s: Situacao, ini: unknown, fim: unknown): Promise<Cotacao> {
  const checkIn = texto(ini, 40);
  const checkOut = texto(fim, 40);
  if (!checkIn || !checkOut || Number.isNaN(Date.parse(checkIn)) || Number.isNaN(Date.parse(checkOut))) {
    throw new Error("Informe check_in_at e check_out_at em ISO 8601 com fuso, por exemplo 2026-11-20T10:00:00-03:00.");
  }
  const { data, error } = await admin.rpc("reprice_booking_dates", {
    p_booking_id: s.id,
    p_check_in: checkIn,
    p_check_out: checkOut,
  });
  if (error) throw error;
  return data as Cotacao;
}

/** O que a IA precisa para escrever a mensagem ao cliente, sem o pagamento cru. */
function reservaLegivel(s: Situacao) {
  return {
    codigo: s.code,
    status: s.status,
    cliente: s.customer_name,
    telefone: s["customer_phone"] ?? null,
    email: s["customer_email"] ?? null,
    unidade: s.location?.name ?? null,
    tipo_de_vaga: s.parking_type,
    veiculo: s.vehicle ? [s.vehicle.plate, s.vehicle.model, s.vehicle.color].filter(Boolean).join(" · ") : null,
    voo: s["flight_number"] ?? null,
    origem: s.origin,
    tolerancia_na_saida_minutos: s.location?.tolerance_minutes ?? null,
  };
}

// deno-lint-ignore no-explicit-any
export async function callOperator(admin: any, ctx: OperatorCtx, name: string, a: Record<string, unknown>, deps: OperatorDeps): Promise<unknown> {
  if ((OPERATOR_PARTNER_READS as readonly string[]).includes(name)) return deps.callPartner(name, a);
  const now = deps.now();

  switch (name) {
    case "find_booking": {
      const { data, error } = await admin.rpc("assist_find_booking", {
        p_company_id: ctx.company_id,
        p_query: texto(a.query, 120),
        p_limit: 10,
      });
      if (error) throw error;
      const lista = (data ?? []) as Array<Record<string, unknown>>;
      return {
        reservas: lista.map((r) => ({
          codigo: r.code,
          status: r.status,
          cliente: r.customer_name,
          placa: r.plate,
          unidade: r.location_name,
          entrada: quando(r.check_in_at as string),
          saida: quando(r.check_out_at as string),
        })),
        observacao: lista.length
          ? null
          : "Nenhuma reserva do Hub encontrada. Se a reserva foi feita no site do próprio estacionamento (white-label), ela não aparece aqui: confira em Reservas no painel.",
      };
    }

    case "get_booking_situation": {
      const s = await situacao(admin, ctx, a.booking);
      return { reserva: reservaLegivel(s), analise: analisarReserva(s, now), historico: s["modifications"] ?? [] };
    }

    case "quote_date_change": {
      const s = await situacao(admin, ctx, a.booking);
      const analise = analisarReserva(s, now);
      const c = await cotar(admin, s, a.check_in_at, a.check_out_at);
      if (c.delta_cents == null || c.new_total_cents == null) {
        return {
          reserva: s.code,
          disponivel: false,
          motivo_indisponivel: c.reason ?? "A unidade não vende esse período.",
        };
      }
      // Básica pela equipe (26/11/2026): a troca cobra junto o upgrade para o Flex.
      const up = upgradeParaTrocarDatas(s);
      const efeito = s.status === "pending"
        ? `A reserva ainda não foi paga: o novo total passa a ser ${reais(c.new_total_cents)}, sem cobrança agora.`
        : up > 0
          ? c.delta_cents > 0
            ? `O plano Básica não inclui alterar datas. Pelo estacionamento, o cliente paga ${reais(c.delta_cents + up)} num PIX só: ${reais(c.delta_cents)} das diárias e ${reais(up)} do upgrade para o Flex. As datas só mudam quando o PIX for pago.`
            : `O plano Básica não inclui alterar datas. Pelo estacionamento, o cliente paga antes ${reais(up)} do upgrade para o Flex, e a troca vale quando esse PIX entra${c.delta_cents < 0 ? `, com estorno de ${reais(-c.delta_cents)} das diárias` : ""}. Isso se faz no botão Alterar datas da tela da reserva.`
          : c.delta_cents < 0
            ? `Estorno de ${reais(-c.delta_cents)} ao cliente, na mesma forma de pagamento da reserva. Sai só das diárias: a tarifa não volta.`
            : c.delta_cents > 0
              ? `O cliente paga ${reais(c.delta_cents)}: ele mesmo, em Minhas reservas, por PIX ou cartão, ou o estacionamento gera um PIX pela tela da reserva ou pela Mia. As datas só mudam quando o pagamento for aprovado.`
              : "Sem diferença de valor.";
      return {
        reserva: s.code,
        novas_datas: { entrada: quando(texto(a.check_in_at, 40)), saida: quando(texto(a.check_out_at, 40)) },
        diarias: c.days,
        total_atual: reais(c.current_total_cents ?? 0),
        novo_total: reais(c.new_total_cents),
        diferenca: reais(c.delta_cents),
        efeito,
        disponivel: c.available,
        motivo_indisponivel: c.reason,
        quem_pode_fazer: {
          o_proprio_cliente: analise.pode_agora.alterar_datas.pelo_cliente,
          a_equipe_do_estacionamento: analise.pode_agora.alterar_datas.pela_equipe,
          motivo: analise.pode_agora.alterar_datas.motivo,
        },
        observacao: c.price_source === "compra"
          ? "Cotação pela tabela de preço da compra: mudar só o dia não custa nada. O cupom da reserva continua valendo."
          : "Reserva anterior a 17/11/2026: a diferença entre as durações sai da tabela de hoje. Mudar só o dia não custa nada.",
      };
    }

    case "quote_fare_upgrade": {
      const s = await situacao(admin, ctx, a.booking);
      const analise = analisarReserva(s, now);
      return {
        reserva: s.code,
        tarifa_atual: analise.tarifa,
        upgrade: analise.pode_agora.upgrade,
        como_o_cliente_faz:
          "Em movepark.co, Minhas reservas, abre a reserva e toca em \"Fazer upgrade de Tarifa\". Paga a diferença por PIX e a tarifa nova vale assim que o PIX é aprovado. O estacionamento também gera esse PIX pelo cliente: na tela da reserva, em Alterar reserva, botão Fazer upgrade.",
      };
    }

    case "search_operator_knowledge": {
      const query = texto(a.query, 1000);
      if (!query) throw new Error("Informe a pergunta.");
      if (!deps.geminiKey) throw new Error("Busca na base indisponível no momento.");
      const emb = await embedQuery(deps.geminiKey, query);
      const k = Math.max(1, Math.min(Number(a.k ?? 5) || 5, 12));
      const { data, error } = await admin.rpc("match_operator_knowledge", { p_query_embedding: emb, p_k: k });
      if (error) throw error;
      const trechos = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        artigo: r.title,
        categoria: r.category,
        conteudo: r.content,
        relevancia: Math.round(Number(r.similarity) * 100) / 100,
      }));
      return {
        trechos,
        observacao: trechos.length
          ? "Responda só com o que está nos trechos. Se nenhum responder a pergunta, registre com report_knowledge_gap."
          : "A base não tem nada sobre isso. Registre com report_knowledge_gap.",
      };
    }

    case "report_knowledge_gap": {
      const question = texto(a.question, 1000);
      if (!question) throw new Error("Informe a pergunta.");
      const { error } = await admin.from("operator_assistant_gap").insert({
        company_id: ctx.company_id,
        profile_id: ctx.profile_id,
        question,
        context: texto(a.context, 2000) || null,
        booking_code: texto(a.booking, 40) || null,
      });
      if (error) throw error;
      return { registrada: true, mensagem: "Pergunta registrada para a equipe Movepark completar a base." };
    }

    case "propose_booking_action": {
      const s = await situacao(admin, ctx, a.booking);
      const kind = texto(a.kind, 30);
      const cotacao = kind === "change_dates" ? await cotar(admin, s, a.check_in_at, a.check_out_at) : null;
      const p = montarProposta({
        kind,
        s,
        now,
        scopes: ctx.scopes,
        cotacao,
        params: {
          check_in_at: texto(a.check_in_at, 40) || undefined,
          check_out_at: texto(a.check_out_at, 40) || undefined,
          license_plate: texto(a.license_plate, 20) || undefined,
          model: texto(a.model, 80) || undefined,
          color: texto(a.color, 40) || undefined,
          reason: texto(a.reason, 300) || undefined,
        },
      });
      if (!p.ok) throw new Error(p.erro);

      // Uma proposta viva por reserva e tipo: a anterior do mesmo operador vence, para o cartão
      // velho não ser confirmado por engano depois de a conversa ter mudado de ideia.
      await admin
        .from("operator_assistant_action")
        .update({ status: "expired", decided_at: now.toISOString() })
        .eq("profile_id", ctx.profile_id)
        .eq("booking_id", s.id)
        .eq("kind", kind)
        .eq("status", "proposed");

      const { data, error } = await admin
        .from("operator_assistant_action")
        .insert({
          company_id: ctx.company_id,
          profile_id: ctx.profile_id,
          booking_id: s.id,
          kind,
          params: { ...p.params, booking_code: s.code },
          summary: p.summary,
          effect_cents: p.effect_cents,
        })
        .select("id, expires_at")
        .single();
      if (error) throw error;
      return {
        proposta_criada: true,
        action_id: data.id,
        resumo: p.summary,
        efeito: p.effect_cents == null ? "sem dinheiro envolvido" : p.effect_cents < 0 ? `estorno de ${reais(-p.effect_cents)}` : `cobrança de ${reais(p.effect_cents)}`,
        vale_ate: quando(data.expires_at),
        instrucao: "Ainda NÃO foi feito. Diga ao operador para conferir e tocar em Confirmar no cartão abaixo da conversa.",
      };
    }

    default:
      throw new Error(`Tool desconhecida: ${name}`);
  }
}
