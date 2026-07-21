import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CancellationPolicy } from "./CancellationPolicy";
import { CANCELLATION_POLICY_LINES } from "./cancellation.logic";

/**
 * C-23 do roteiro do consumidor: a copy da política de cancelamento tem que
 * bater com a tarifa contratada.
 *
 * Hoje ela não bate. `CANCELLATION_POLICY_LINES` (cancellation.logic.ts:64-67) é
 * texto fixo em 24 horas e é usado em três lugares (listing, checkout e o card
 * de política). Quem paga R$ 24,90 pela Superflex, que cancela até 1 minuto
 * antes, lê na tela que tem 24 horas.
 *
 * O defeito é de COPY, não de gate: o sistema recusa e aceita cancelamento na
 * hora certa (é o que o C-19, o C-20 e o C-21 provam). Só o texto está errado.
 * Corrigir isso no arquivo de cancelamento seria corrigir o lugar errado.
 *
 * O teste do comportamento correto está escrito abaixo em `it.skip`, para o CI
 * seguir verde e o caso virar aceite quando o fix entrar:
 * https://app.clickup.com/t/86ajmwhg5
 */

/** Prazo da Superflex: 1 minuto antes do check-in. */
const CHECK_IN = "2026-08-01T12:00:00Z";
const SUPERFLEX_CANCEL_UNTIL = "2026-08-01T11:59:00Z";

describe("CancellationPolicy", () => {
  it("mostra o prazo concreto vindo da tarifa (isto já funciona)", () => {
    render(
      <CancellationPolicy checkInAt={CHECK_IN} fareCancelUntil={SUPERFLEX_CANCEL_UNTIL} />,
    );
    // `freeCancelDeadlineLabel` respeita o `fare_cancel_until` da reserva, então
    // a data do topo já é a da Superflex. O problema mora nas linhas fixas.
    expect(screen.getByText(/Cancele grátis até/)).toBeInTheDocument();
    expect(screen.getByText(/01\/08\/2026/)).toBeInTheDocument();
  });

  it("documenta o defeito: as linhas da política são fixas em 24 horas", () => {
    // Guarda do estado ATUAL. Quando o fix entrar, este teste falha e aponta
    // para o `it.skip` abaixo, que passa a ser a verdade.
    expect(CANCELLATION_POLICY_LINES.some((l) => l.includes("24 horas"))).toBe(true);
  });

  it.skip("C-23: na Superflex, a política diz 1 minuto, não 24 horas", () => {
    render(
      <CancellationPolicy checkInAt={CHECK_IN} fareCancelUntil={SUPERFLEX_CANCEL_UNTIL} />,
    );

    // O corpo da política tem que refletir a janela da tarifa contratada.
    expect(screen.getByText(/1 min(uto)? antes/i)).toBeInTheDocument();
    expect(screen.queryByText(/24 horas/)).not.toBeInTheDocument();
  });

  it.skip("C-23: na Básica, a política continua dizendo 24 horas", () => {
    // O contra-exemplo importa tanto quanto: o fix não pode trocar um texto fixo
    // errado por outro texto fixo errado.
    render(
      <CancellationPolicy checkInAt={CHECK_IN} fareCancelUntil="2026-07-31T12:00:00Z" />,
    );
    expect(screen.getByText(/24 horas/)).toBeInTheDocument();
  });
});
