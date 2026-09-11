import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { SeloGerador } from "@/features/selo/SeloGerador";
import { siteUrl } from "@/lib/site";

/**
 * Página do selo de parceiro.
 *
 * Não fecha com o `CtaBanner`, que é a exceção consciente ao padrão da skill
 * `harmonizar-paginas`: o banner chama o viajante para buscar vaga, e quem abre esta
 * página é o parceiro mexendo no rodapé do próprio site. O fechamento aqui é o suporte.
 */

const PLATAFORMAS = [
  {
    nome: "Site em HTML",
    passos: "Abra o arquivo do rodapé e cole o código logo antes de </footer> ou </body>.",
  },
  {
    nome: "WordPress",
    passos:
      "Aparência, Widgets (ou Editor do site), área do rodapé. Adicione um bloco HTML personalizado e cole o código.",
  },
  {
    nome: "Elementor",
    passos: "No rodapé, arraste o widget HTML e cole o código dentro dele.",
  },
  {
    nome: "Wix",
    passos:
      "Não use o bloco de incorporar HTML. No rodapé, adicione um texto, escreva a frase do selo, selecione a palavra Movepark e aplique o link. Deixe a opção nofollow desligada.",
  },
  {
    nome: "Squarespace",
    passos: "Edite o rodapé, adicione um bloco de Código e cole o código.",
  },
  {
    nome: "Webflow",
    passos: "No rodapé, adicione um elemento Embed e cole o código.",
  },
  {
    nome: "Shopify",
    passos:
      "Tema, Editar código, sections/footer.liquid. Cole o código antes do fechamento do rodapé.",
  },
  {
    nome: "Google Sites",
    passos:
      "Mesma orientação do Wix: escreva o texto no rodapé e aplique o link nele, em vez de incorporar código.",
  },
];

const REGRAS = [
  {
    titulo: "Um selo por site",
    texto:
      "No rodapé, que aparece em todas as páginas. Repetir o selo em vários pontos da mesma página não soma nada.",
  },
  {
    titulo: "Não troque o texto do link",
    texto:
      "A palavra Movepark precisa estar dentro do link. Trocar por outra frase tira o efeito do link.",
  },
  {
    titulo: "Só diga o que é verdade",
    texto:
      "Use Desenvolvido por ou Feito por apenas se a Movepark tiver feito o seu site. Nos outros casos, fique com Parceiro Movepark.",
  },
  {
    titulo: "Sem nofollow",
    texto:
      "Alguns painéis marcam links externos como nofollow por padrão. Deixe essa opção desligada.",
  },
];

const TITULO = "Selo de parceiro Movepark";
/** Serve de meta description, então precisa da marca. */
const META =
  "Monte o selo de parceiro Movepark e copie o código pronto para colar no rodapé do seu site.";
/** Lead da página. Não repete a marca, que já está no h1 logo acima. */
const LEAD = "Escolha o que o selo diz e copie o código para colar no rodapé do seu site.";

export default function SeloPage() {
  return (
    <>
      <Helmet>
        <title>{`${TITULO} | Movepark`}</title>
        <meta name="description" content={META} />
        <meta property="og:title" content={`${TITULO} | Movepark`} />
        <meta property="og:url" content={siteUrl("/selo")} />
        <link rel="canonical" href={siteUrl("/selo")} />
      </Helmet>

      <div className="mx-auto flex max-w-[1080px] flex-col gap-12 px-4 py-12 desktop:px-8">
        <PageHeader
          variant="content"
          eyebrow="Para parceiros"
          title={TITULO}
          description={LEAD}
          contentClassName="max-w-[56ch]"
        />

        <SeloGerador />

        <section className="flex flex-col gap-6">
          <h2 className="text-balance text-display-sm text-ink">Onde colar no seu site</h2>
          <dl className="grid gap-x-8 gap-y-6 tablet:grid-cols-2">
            {PLATAFORMAS.map((p) => (
              <div key={p.nome} className="flex flex-col gap-1">
                <dt className="text-title-md text-ink">{p.nome}</dt>
                <dd className="text-pretty text-body-md text-body">{p.passos}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="flex flex-col gap-6">
          <h2 className="text-balance text-display-sm text-ink">Quatro regras de uso</h2>
          <dl className="grid gap-x-8 gap-y-6 tablet:grid-cols-2">
            {REGRAS.map((r) => (
              <div key={r.titulo} className="flex flex-col gap-1">
                <dt className="text-title-md text-ink">{r.titulo}</dt>
                <dd className="text-pretty text-body-md text-body">{r.texto}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="flex flex-col gap-3 rounded-sm border border-hairline bg-surface-soft p-6">
          <h2 className="text-balance text-display-sm text-ink">Precisa de ajuda para instalar?</h2>
          <p className="max-w-[68ch] text-pretty text-body-md text-body">
            Mande o endereço do seu site e a gente devolve o código pronto para o seu rodapé. Fale
            pelo{" "}
            <Link to="/contato" className="text-mp-primary underline underline-offset-4">
              canal de contato
            </Link>
            .
          </p>
        </section>
      </div>
    </>
  );
}
