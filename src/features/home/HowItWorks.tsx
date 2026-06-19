import { Image } from "lucide-react";

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
      {/* Breadcrumb de etapas */}
      <div className="mx-auto mb-12 max-w-[1280px] px-6 text-center desktop:px-8">
        <p className="mb-2 text-caption-sm font-bold uppercase tracking-widest text-mp-violet">
          Simples e rápido
        </p>
        <h2 className="text-[28px] font-bold tracking-tight text-ink tablet:text-[36px]">
          Como reservar em 4 passos
        </h2>

        {/* Step indicator */}
        <div className="mt-6 flex items-center justify-center gap-0">
          {steps.map((s, i) => (
            <div key={s.title} className="flex items-center">
              <div className="flex flex-col items-center">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-mp-navy text-[13px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="mt-1 hidden max-w-[80px] text-center text-[11px] font-medium text-muted tablet:block">
                  {s.title.split(" ").slice(0, 2).join(" ")}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className="mx-2 h-px w-8 bg-hairline tablet:w-16" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Layout lado a lado */}
      <div className="mx-auto max-w-[1280px] px-6 desktop:px-8">
        <div className="grid grid-cols-1 gap-10 tablet:grid-cols-2 tablet:items-center">
          {/* Placeholder de imagem */}
          <div className="relative flex min-h-[320px] flex-col items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-hairline bg-gradient-to-br from-mp-pale to-surface-soft desktop:min-h-[400px]">
            <Image className="mb-4 h-12 w-12 text-mp-indigo/30" aria-hidden="true" />
            <span className="text-caption text-muted">Foto do processo de reserva</span>
            <span className="absolute bottom-4 right-4 rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted backdrop-blur-sm">
              placeholder
            </span>

            {/* Floating booking card decorativo */}
            <div className="absolute bottom-8 left-8 rounded-md border border-hairline bg-canvas p-4 shadow-tier tablet:bottom-10 tablet:left-10">
              <div className="mb-2 text-caption font-semibold text-ink">Reserva confirmada</div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-success" />
                <span className="text-body-sm text-muted">Voucher enviado por e-mail</span>
              </div>
            </div>
          </div>

          {/* Lista de passos */}
          <div className="flex flex-col gap-6">
            <p className="text-body-md font-semibold text-ink">Reserve sua vaga em 4 passos simples</p>
            {steps.map((s, i) => (
              <div key={s.title} className="flex gap-4">
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mp-navy text-[15px] font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <div className="text-title-md text-ink">{s.title}</div>
                  <p className="mt-1 text-body-sm text-muted">{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
