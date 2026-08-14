import * as React from "react";

/**
 * `useLayoutEffect` no cliente, `useEffect` no servidor.
 *
 * A contagem precisa zerar antes da primeira pintura: o HTML do SSG já traz o
 * número final, e com `useEffect` o navegador pintaria esse número e só depois
 * voltaria para zero, o que aparece como um piscar. No servidor o
 * `useLayoutEffect` não roda e o React avisa, daí a troca.
 */
const useEfeitoDeLayout = typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

/** Quanto tempo a contagem leva para chegar ao número, em ms. */
export const DURACAO_DA_CONTAGEM = 1600;

/**
 * Desaceleração da contagem (easeOutExpo).
 *
 * Sobe rápido e freia longo, que é o que faz o número parecer assentar num
 * valor em vez de parar de repente. Linear daria a sensação de contador de
 * posto de gasolina.
 *
 * O progresso é grampeado em [0, 1] porque o relógio do quadro pode estourar o
 * fim quando a aba volta do segundo plano.
 */
export function suavizarContagem(t: number): number {
  const p = Math.min(1, Math.max(0, t));
  return p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
}

/** Onde a contagem está num dado ponto do percurso. */
export function valorNaContagem(alvo: number, progresso: number): number {
  return Math.round(alvo * suavizarContagem(progresso));
}

/**
 * Conta de zero até `alvo` na montagem.
 *
 * Começa no `alvo`, e não em zero, porque é esse valor que o SSG grava no HTML:
 * quem chega sem JavaScript, e quem lê a página como texto, vê o número certo.
 * A volta para zero acontece antes da pintura, no efeito de layout.
 *
 * Quem pediu menos movimento fica com o número parado. Aqui isso é feito lendo
 * o `matchMedia` direto, e não pelo `usePrefersReducedMotion`: o hook começa em
 * `false` para casar com o SSG, então na primeira passada a contagem já teria
 * zerado o número antes de o estado virar.
 */
export function useContagemAnimada(alvo: number, duracao = DURACAO_DA_CONTAGEM): number {
  const [valor, setValor] = React.useState(alvo);

  useEfeitoDeLayout(() => {
    /* Sem animação o valor ainda precisa ser escrito: o alvo chega do servidor
       depois da primeira renderização, e sem esta linha o número ficaria preso
       no padrão para quem pediu menos movimento. */
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || alvo <= 0) {
      setValor(alvo);
      return;
    }

    let frame = 0;
    const inicio = performance.now();
    setValor(0);

    const quadro = (agora: number) => {
      const progresso = (agora - inicio) / duracao;
      if (progresso >= 1) {
        setValor(alvo);
        return;
      }
      setValor(valorNaContagem(alvo, progresso));
      frame = requestAnimationFrame(quadro);
    };
    frame = requestAnimationFrame(quadro);

    return () => cancelAnimationFrame(frame);
  }, [alvo, duracao]);

  return valor;
}
