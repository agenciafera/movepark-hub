import { cn } from "@/lib/utils";

type Props = {
  /** Aceita nó, e não só string, para o hero destacar um trecho do título (ver `/calculadora-estacionamento-aeroporto`). */
  title: React.ReactNode;
  /** Uma linha abaixo do título, dizendo o que fazer aqui. */
  description?: string;
  /** Entra acima do título, dentro da faixa (ex.: a trilha de navegação em `tom="escuro"`). */
  breadcrumb?: React.ReactNode;
  /** Entra abaixo do lead, ainda dentro da faixa (ex.: um botão). */
  children?: React.ReactNode;
  className?: string;
};

/**
 * Faixa violeta de abertura, sangrando de ponta a ponta.
 *
 * Nasceu na /contato em 17/08/2026, do desenho que o Diego passou, e é o modelo
 * para as outras páginas de conteúdo que forem redesenhadas. Antes cada uma
 * abria com o `PageHeader` sobre fundo branco, e a diferença entre "onde eu
 * estou" e "o que tem aqui" ficava por conta do tamanho da fonte.
 *
 * Fica **fora** do container da página: quem usa põe isto antes do
 * `mx-auto max-w-[...]`, senão a faixa para no meio da tela.
 *
 * A faixa é `mp-navy` desde 17/08/2026: em violeta ela competia com a faixa do
 * rodapé e com os botões, que são os pontos que a marca reserva para ação.
 *
 * O lead é branco puro de propósito. Sobre o navy sobra contraste (14.2:1), mas
 * a regra vale para qualquer fundo que a faixa venha a ter: sobre o violeta o
 * branco dá 4.86:1, e qualquer translucidez cairia para ~3.9:1, reprovando o AA
 * em corpo de 16px.
 */
export function PageHero({ title, description, breadcrumb, children, className }: Props) {
  return (
    <div className={cn("bg-mp-navy", className)}>
      <div className="mx-auto w-full max-w-[1080px] px-4 py-16 desktop:px-8 desktop:py-24">
        {breadcrumb && <div className="mb-5">{breadcrumb}</div>}
        {/* `text-balance` no título e `text-pretty` no lead: nenhum dos dois pode
            terminar com uma palavra sozinha na última linha. Teto em `ch` no
            título está fora, porque é ele que fabrica a viúva. */}
        <h1 className="text-balance text-display-3xl text-white">{title}</h1>
        {description && (
          <p className="mt-4 max-w-[56ch] text-pretty text-body-md text-white">{description}</p>
        )}
        {children}
      </div>
    </div>
  );
}
