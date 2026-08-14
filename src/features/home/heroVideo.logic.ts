/**
 * Redes em que o vídeo de fundo não compensa.
 *
 * `3g` entra na lista de propósito. O vídeo é enfeite: num aeroporto lotado, a
 * banda que ele consome é a mesma que o usuário precisa para carregar a busca e
 * fechar a reserva, e a foto já conta a mesma história por uma fração do peso.
 */
const REDES_LENTAS = new Set(["slow-2g", "2g", "3g"]);

export type CondicoesDoAmbiente = {
  /** O sistema pediu menos movimento. */
  movimentoReduzido: boolean;
  /** O usuário ligou economia de dados no navegador. */
  economiaDeDados?: boolean;
  /** Estimativa de rede do navegador: `4g`, `3g`, `2g`, `slow-2g`. */
  tipoDeRede?: string;
};

/**
 * Decide se vale baixar o vídeo do banner.
 *
 * A foto é o estado base e nunca sai da página: ela é o LCP da home e continua
 * lá embaixo do vídeo. Esta função responde só se o vídeo entra por cima, então
 * um `false` aqui não deixa buraco nenhum, só mantém o banner parado.
 *
 * Na dúvida (navegador que não expõe `connection`) o vídeo carrega. O contrário
 * tiraria a animação de quase todo Safari, que não implementa a API.
 */
export function deveCarregarVideo(c: CondicoesDoAmbiente): boolean {
  if (c.movimentoReduzido) return false;
  if (c.economiaDeDados) return false;
  if (c.tipoDeRede && REDES_LENTAS.has(c.tipoDeRede)) return false;
  return true;
}

/**
 * A sequência do banner, na ordem da história: ela chega a pé, entra no carro e
 * sai, e passa na cancela.
 */
export const CLIPES = [
  "/images/hero-video.mp4",
  "/images/hero-video-saida.mp4",
  "/images/hero-video-cancela.mp4",
] as const;

/**
 * A mesma história filmada em pé, para a tela do celular.
 *
 * Não é o mesmo arquivo recortado. O quadro deitado é 2,3:1 e a seção do hero no
 * celular fica mais alta que larga, então o `object-cover` deixava 17% da
 * largura e o banner virava um borrão. Reenquadrar melhora a média, mas não cria
 * o que foi cortado: em vertical a cena nasce cabendo na tela.
 */
export const CLIPES_MOBILE = [
  "/images/hero-video-mobile.mp4",
  "/images/hero-video-saida-mobile.mp4",
  "/images/hero-video-cancela-mobile.mp4",
] as const;

/**
 * Qual conjunto tocar.
 *
 * Decidido uma vez, na montagem, e não a cada resize: trocar a fonte no meio da
 * reprodução reiniciaria o clipe e daria um solavanco em quem só girou o
 * aparelho. Quem redimensiona a janela no desktop é caso de desenvolvedor, não
 * de usuário.
 */
export function clipesPara(emDesktop: boolean): readonly string[] {
  return emDesktop ? CLIPES : CLIPES_MOBILE;
}

/** Segundos em que um clipe e o seguinte tocam juntos, um sumindo no outro. */
export const CRUZAMENTO = 0.8;

/** O próximo da fila, voltando ao começo depois do último. */
export function proximoClipe(atual: number, total: number = CLIPES.length): number {
  return (atual + 1) % total;
}

/**
 * Se já é hora de acender o próximo clipe por cima deste.
 *
 * A troca começa antes do fim, não no `ended`: esperar o fim deixaria um quadro
 * congelado entre um clipe e outro, que é exatamente o corte seco que a
 * sobreposição existe para esconder.
 *
 * `duration` é `NaN` enquanto os metadados não chegam, e `NaN` em comparação dá
 * sempre `false`, então a guarda explícita é o que impede a troca de disparar no
 * primeiro `timeupdate` de um vídeo que mal começou a carregar.
 */
export function deveCruzar(
  tempoAtual: number,
  duracao: number,
  cruzamento: number = CRUZAMENTO,
): boolean {
  if (!Number.isFinite(duracao) || duracao <= 0) return false;
  return duracao - tempoAtual <= cruzamento;
}
