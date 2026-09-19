import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { LockSimple, MagnifyingGlass, Ticket } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/auth/context";
import { useVitrinePublica } from "@/features/customer-coupons/api";
import { OfertaTicket } from "@/features/customer-coupons/OfertaTicket";
import { ResgatarCodigo } from "@/features/customer-coupons/ResgatarCodigo";
import { agruparPorMomento } from "@/features/customer-coupons/publicOffers.logic";
import { storeCoupon } from "@/lib/coupon";

/**
 * `/descontos`: a vitrine de campanhas da Movepark.
 *
 * **Ainda não é linkada para o cliente.** Ela não está no rodapé, no menu do celular nem no
 * sitemap, e isso é deliberado: cupom só vale onde a reserva fecha no Hub, e hoje nenhuma unidade
 * vendável é `checkout_mode = 'hub'`. Enquanto `honored_by_units` for zero, anunciar estes
 * descontos para o cliente seria promessa que nenhuma unidade cumpre (ADR-009). Ao religar os
 * links, confira esse número primeiro.
 *
 * A página agrupa por MOMENTO do cliente, e não por "disponível/indisponível": cada título
 * responde "de quem é este cupom", e a ordem dos grupos mostra que sempre existe um próximo.
 */
export default function DescontosPage() {
  const vitrine = useVitrinePublica();
  const { session } = useAuth();
  const navigate = useNavigate();
  const ofertas = vitrine.data?.offers ?? [];
  const grupos = agruparPorMomento(ofertas);

  /**
   * Usar um cupom aqui é guardar o código e seguir para a busca. O código sobrevive ao round-trip
   * de login (é o mesmo canal do link de campanha, `?cupom=`), e a página da unidade o passa ao
   * criar a reserva. Quem confere validade é o servidor, no pagamento.
   */
  function usar(code: string) {
    storeCoupon(code);
    toast.success("Cupom guardado. Escolha o estacionamento e ele entra no pagamento.");
    navigate("/search");
  }

  return (
    // `bg-surface-soft` não é escolha de gosto: os furos laterais do ticket são pintados com esta
    // cor. Trocar o fundo sem trocar o `OfertaTicket` faz os furos virarem bolinhas visíveis.
    <div className="bg-surface-soft">
      <Helmet>
        <title>Cupons de desconto para estacionamento de aeroporto | Movepark</title>
        <meta
          name="description"
          content="Campanhas de desconto da Movepark para estacionamento de aeroporto. Veja as condições de cada cupom e reserve com o desconto aplicado no pagamento."
        />
      </Helmet>

      <div className="mx-auto w-full max-w-5xl px-4 py-10 desktop:py-14">
        <header className="mb-6 max-w-2xl">
          <h1 className="text-display-xl text-ink">Cupons de desconto</h1>
          <p className="mt-2 text-body-md text-body">
            Os cupons mudam conforme você usa a Movepark. Começa com o desconto de primeira
            reserva, e cada vez que você volta libera o próximo.
          </p>
        </header>

        <ResgatarCodigo />

        {vitrine.isError ? (
          <div className="flex flex-col items-start gap-3 rounded-md border border-error bg-badge-cancelled-bg p-4">
            <p className="text-body-sm text-error">Não conseguimos carregar as campanhas agora.</p>
            <Button variant="secondary" size="sm" onClick={() => vitrine.refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : vitrine.isLoading ? (
          <div className="grid gap-4 tablet:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-md" />
            ))}
          </div>
        ) : ofertas.length === 0 ? (
          <div className="rounded-md border border-hairline bg-canvas p-6">
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
            {grupos.map((g) => (
              <section key={g.id} className="mb-10">
                <div className="mb-4 flex items-baseline gap-2">
                  <h2 className="text-title-md text-ink">{g.titulo}</h2>
                  {!g.liberado ? (
                    <span className="flex items-center gap-1 text-caption-sm text-muted">
                      <LockSimple className="h-3.5 w-3.5" aria-hidden />
                      ainda bloqueado
                    </span>
                  ) : null}
                </div>
                <p className="-mt-3 mb-4 text-body-sm text-muted">{g.descricao}</p>
                <div className="grid gap-4 tablet:grid-cols-2">
                  {g.ofertas.map((o) => (
                    <OfertaTicket
                      key={o.code}
                      oferta={o}
                      onUsar={g.liberado ? usar : undefined}
                    />
                  ))}
                </div>
              </section>
            ))}

            <div className="flex flex-col gap-3 rounded-md border border-hairline bg-canvas p-5 tablet:flex-row tablet:items-center tablet:justify-between">
              <div>
                <p className="text-title-sm text-ink">Como o desconto entra</p>
                <p className="mt-1 text-body-sm text-muted">
                  Escolha o estacionamento e as datas. O cupom que vale para você aparece no
                  pagamento, já com o valor abatido.
                </p>
              </div>
              <Link to="/search" className="shrink-0">
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
    </div>
  );
}
