import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const steps = [
  {
    title: "Escolha o destino",
    text: "Digite o aeroporto ou terminal e selecione as datas da sua viagem.",
  },
  {
    title: "Compare as opções",
    text: "Veja vagas de várias operadoras: coberto, descoberto, valet e mais.",
  },
  {
    title: "Reserve e pague online",
    text: "Pagamento seguro via PIX ou cartão. Confirmação instantânea.",
  },
  {
    title: "Apresente o voucher",
    text: "Chegue ao estacionamento e mostre o QR Code que enviamos por e-mail.",
  },
];

export function HowItWorks() {
  return (
    <section className="py-16 desktop:py-20">
      <div className="mx-auto max-w-[1280px] px-6 desktop:px-8">
        <div className="grid grid-cols-1 gap-12 tablet:grid-cols-2 tablet:items-start">

          {/* Coluna esquerda: headline + link + grid 2×2 de passos */}
          <div>
            <p className="mb-2 text-caption-sm font-bold uppercase tracking-widest text-mp-violet">
              Simples e rápido
            </p>
            <h2 className="mb-4 text-[36px] font-bold text-ink tablet:text-display-2xl">
              Como reservar em 4 passos
            </h2>
            <p className="mb-6 max-w-md text-body-md text-muted">
              Do destino ao voucher em menos de 2 minutos. Sem cadastro obrigatório para buscar.
            </p>
            <Link
              to="/search"
              className="group mb-12 inline-flex items-center gap-1.5 text-body-md font-semibold text-mp-violet"
            >
              Buscar vagas agora{" "}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>

            {/* Grid 2×2 — números grandes sem círculo, estilo referência */}
            <div className="grid grid-cols-2 gap-x-10 gap-y-10">
              {steps.map((s, i) => (
                <div key={s.title}>
                  <span className="block text-[64px] font-black leading-none text-mp-navy">
                    {i + 1}
                  </span>
                  <h3 className="mt-3 text-title-md font-semibold text-ink">{s.title}</h3>
                  <p className="mt-1.5 text-body-sm text-muted">{s.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Coluna direita: imagem ocupando toda a altura */}
          <div className="relative min-h-[400px] overflow-hidden rounded-xl bg-surface-strong desktop:min-h-[560px]">
            <img
              src="/images/como-reservar.jpg"
              alt="Motorista sorrindo ao celular após concluir reserva no aeroporto"
              className="h-full w-full object-cover"
            />

            {/* Floating booking card decorativo */}
            <div className="absolute bottom-8 left-8 rounded-xl border border-hairline bg-canvas p-4 shadow-tier">
              <div className="mb-2 text-caption font-semibold text-ink">Reserva confirmada</div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-success" />
                <span className="text-body-sm text-muted">Voucher enviado por e-mail</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
