import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { MagnifyingGlass, Ticket } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/auth/context";
import { useVitrinePublica } from "@/features/customer-coupons/api";
import {
  ofertaAmountLabel,
  ofertaCapLabel,
  ofertaCondicoes,
} from "@/features/customer-coupons/publicOffers.logic";
import type { OfertaPublica } from "@/features/customer-coupons/api";

function CartaoOferta({ oferta }: { oferta: OfertaPublica }) {
  const teto = ofertaCapLabel(oferta);
  const condicoes = ofertaCondicoes(oferta);

  return (
    <article className="flex flex-col gap-2 rounded-md border border-hairline bg-canvas p-5">
      <p className="text-display-sm text-success">
        {ofertaAmountLabel(oferta)}
        {teto ? <span className="text-body-sm">, {teto}</span> : null}
      </p>

      {oferta.title ? <p className="text-title-sm text-ink">{oferta.title}</p> : null}

      {condicoes.length > 0 ? (
        <ul className="space-y-0.5">
          {condicoes.map((c) => (
            <li key={c} className="text-caption-sm text-muted">
              {c}
            </li>
          ))}
        </ul>
      ) : null}

      {oferta.terms ? <p className="text-caption-sm text-muted">{oferta.terms}</p> : null}

      <p className="mt-1 font-mono text-caption-sm text-muted">{oferta.code}</p>
    </article>
  );
}

/**
 * `/descontos`: a vitrine pública de campanhas.
 *
 * Existe porque a carteira (`/account/descontos`) exige login, e a campanha de aquisição é
 * justamente para quem ainda não tem conta: quem nunca reservou nunca via que existia desconto
 * na primeira reserva.
 *
 * A página NÃO decide se pode prometer. Quem decide é `public_coupon_offers()`, que devolve lista
 * vazia enquanto nenhuma unidade do Hub puder honrar cupom (ADR-009). Sem isso a página anunciaria
 * 30% num dia em que nenhuma reserva aceita cupom, que é a definição de promessa vazia.
 */
export default function DescontosPage() {
  const vitrine = useVitrinePublica();
  const { session } = useAuth();
  const ofertas = vitrine.data?.offers ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 desktop:py-14">
      <Helmet>
        <title>Cupons de desconto para estacionamento de aeroporto | Movepark</title>
        <meta
          name="description"
          content="Campanhas de desconto da Movepark para estacionamento de aeroporto. Veja as condições de cada cupom e reserve com o desconto aplicado no pagamento."
        />
      </Helmet>

      <header className="mb-8">
        <h1 className="text-display-xl text-ink">Cupons de desconto</h1>
        <p className="mt-2 text-body-md text-body">
          Campanhas da Movepark para estacionamento de aeroporto. O desconto entra na hora de pagar
          a reserva.
        </p>
      </header>

      {vitrine.isError ? (
        <div className="flex flex-col items-start gap-3 rounded-md border border-error bg-badge-cancelled-bg p-4">
          <p className="text-body-sm text-error">Não conseguimos carregar as campanhas agora.</p>
          <Button variant="secondary" size="sm" onClick={() => vitrine.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : vitrine.isLoading ? (
        <div className="grid gap-4 tablet:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-md" />
          ))}
        </div>
      ) : ofertas.length === 0 ? (
        // Vazio aqui é resposta honesta, não erro: ou não há campanha no ar, ou nenhuma unidade
        // pode honrar cupom ainda. Nos dois casos anunciar desconto seria inventar.
        <div className="rounded-md border border-hairline bg-surface-soft p-6">
          <Ticket className="h-8 w-8 text-muted" aria-hidden />
          <p className="mt-3 text-title-md text-ink">Nenhuma campanha ativa agora</p>
          <p className="mt-1 text-body-sm text-muted">
            Quando tiver, ela aparece aqui. Enquanto isso dá para comparar preço e reservar.
          </p>
          <Link to="/search" className="mt-4 inline-block">
            <Button>
              <MagnifyingGlass className="h-4 w-4" />
              Buscar estacionamento
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-4 tablet:grid-cols-2">
            {ofertas.map((o) => (
              <CartaoOferta key={o.code} oferta={o} />
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3 rounded-md border border-hairline bg-surface-soft p-5 tablet:flex-row tablet:items-center tablet:justify-between">
            <p className="text-body-sm text-ink">
              Escolha o estacionamento e o cupom entra no pagamento.
            </p>
            <Link to="/search">
              <Button>
                <MagnifyingGlass className="h-4 w-4" />
                Buscar estacionamento
              </Button>
            </Link>
          </div>
        </>
      )}

      <p className="mt-6 text-caption-sm text-muted">
        {session ? (
          <>
            Seus cupons ficam em{" "}
            <Link to="/account/descontos" className="underline">
              Descontos
            </Link>
            .
          </>
        ) : (
          <>
            Já tem conta?{" "}
            <Link to="/login" className="underline">
              Entre
            </Link>{" "}
            para ver os cupons que são seus.
          </>
        )}
      </p>
    </div>
  );
}
