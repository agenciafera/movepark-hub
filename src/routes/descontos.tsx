import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { MagnifyingGlass, Ticket } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/auth/context";
import { useVitrinePublica } from "@/features/customer-coupons/api";
import { OfertaTicket } from "@/features/customer-coupons/OfertaTicket";
import { separarPorEstagio } from "@/features/customer-coupons/publicOffers.logic";

/**
 * `/descontos`: a vitrine de campanhas da Movepark.
 *
 * **Ainda não é linkada para o cliente.** Ela não está no rodapé, no menu do celular nem no
 * sitemap, e isso é deliberado: cupom só vale onde a reserva fecha no Hub, e hoje nenhuma unidade
 * vendável é `checkout_mode = 'hub'`. Enquanto `honored_by_units` for zero, anunciar estes
 * descontos para o cliente seria promessa que nenhuma unidade cumpre (ADR-009). Ao religar os
 * links, confira esse número primeiro.
 *
 * A página é dividida em DOIS estágios porque mostrar tudo junto desperdiça o melhor argumento:
 * o cupom que a pessoa ainda não pode usar é o motivo de ela voltar. Esconder o bloqueado faria
 * a segunda reserva parecer não ter prêmio nenhum.
 */
export default function DescontosPage() {
  const vitrine = useVitrinePublica();
  const { session } = useAuth();
  const ofertas = vitrine.data?.offers ?? [];
  const { agora, depois } = separarPorEstagio(ofertas);

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
        <header className="mb-8 max-w-2xl">
          <h1 className="text-display-xl text-ink">Cupons de desconto</h1>
          <p className="mt-2 text-body-md text-body">
            Os cupons mudam conforme você usa a Movepark. Começa com o desconto de primeira
            reserva, e cada vez que você volta libera o próximo.
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
            {agora.length > 0 ? (
              <section className="mb-10">
                <h2 className="mb-1 text-title-md text-ink">Disponível agora</h2>
                <p className="mb-4 text-body-sm text-muted">
                  Vale já na sua próxima reserva. O desconto aparece no pagamento.
                </p>
                <div className="grid gap-4 tablet:grid-cols-2">
                  {agora.map((o) => (
                    <OfertaTicket key={o.code} oferta={o} />
                  ))}
                </div>
              </section>
            ) : null}

            {depois.length > 0 ? (
              <section className="mb-10">
                <h2 className="mb-1 text-title-md text-ink">Libera conforme você reserva</h2>
                <p className="mb-4 text-body-sm text-muted">
                  Estes já existem e ficam esperando. Cada reserva concluída destrava o próximo.
                </p>
                <div className="grid gap-4 tablet:grid-cols-2">
                  {depois.map((o) => (
                    <OfertaTicket key={o.code} oferta={o} />
                  ))}
                </div>
              </section>
            ) : null}

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
