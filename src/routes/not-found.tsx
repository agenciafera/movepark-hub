import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { MagnifyingGlass } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";

/**
 * Página de 404, servida pela borda com status 404 de verdade.
 *
 * Ela é a metade cliente da regra: o worker devolve este HTML com status 404, e o catch-all
 * do React Router renderiza o mesmo componente na navegação interna. Sem as duas metades, a
 * borda diz uma coisa e o app diz outra, e o visitante nunca vê o 404.
 *
 * NÃO imprime o caminho pedido, e isso é restrição técnica, não preferência de texto: o
 * corpo servido é sempre o HTML de `/404`, enquanto a URL do navegador é a que a pessoa
 * pediu. Escrever o caminho aqui faria o HTML do servidor divergir da árvore hidratada e o
 * React reclamar de mismatch. Também fica melhor de ler sem o caminho.
 *
 * O `noindex` é próprio da página e independe do host: quando o Hub assumir o apex, a regra
 * de host do worker desliga e uma página de erro indexável seria soft 404 nosso.
 * Ver docs/specs/borda-cloudflare.md.
 */
export default function NotFoundPage() {
  return (
    <>
      <Helmet>
        <title>Página não encontrada | Movepark</title>
        <meta name="robots" content="noindex, follow" />
      </Helmet>

      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-4 py-20 text-center">
        <span className="text-badge uppercase text-muted-steel">Erro 404</span>
        <h1 className="text-balance text-display-xl text-ink">Essa página não existe</h1>
        <p className="text-pretty text-body-md text-muted">
          O link pode estar errado, ou a página saiu do ar.
        </p>
        <div className="mt-2 flex flex-col gap-3 tablet:flex-row">
          <Button asChild>
            <Link to="/search">
              <MagnifyingGlass className="h-4 w-4" />
              Buscar estacionamento
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Ir para o início</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
