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
        <h2 className="text-[36px] font-bold text-ink tablet:text-display-2xl">
          Como reservar em 4 passos
        </h2>


      </div>

      {/* Layout lado a lado */}
      <div className="mx-auto max-w-[1280px] px-6 desktop:px-8">
        <div className="grid grid-cols-1 gap-10 tablet:grid-cols-2 tablet:items-center">
          {/* Imagem ilustrativa */}
          <div className="relative overflow-hidden rounded-md desktop:min-h-[400px]">
            <img
              src="/images/como-reservar.jpg"
              alt="Mulher sorrindo ao celular após concluir reserva no aeroporto"
              className="h-full w-full object-cover"
            />

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
