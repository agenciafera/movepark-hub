import { Search, Layers, CheckCircle2 } from "lucide-react";

const steps = [
  {
    icon: Search,
    title: "Busque",
    text: "Digite o aeroporto e suas datas.",
  },
  {
    icon: Layers,
    title: "Compare",
    text: "Veja opções de várias operadoras num só lugar.",
  },
  {
    icon: CheckCircle2,
    title: "Reserve",
    text: "Pague online e receba seu voucher por e-mail.",
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-6 py-16 desktop:px-8">
      <h2 className="text-display-md text-ink mb-2">Como funciona</h2>
      <p className="text-body-md text-muted mb-8">
        Três passos pra deixar o carro tranquilo.
      </p>
      <div className="grid grid-cols-1 gap-8 tablet:grid-cols-3">
        {steps.map((s, idx) => (
          <div key={s.title} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-mp-navy text-white text-button-md font-bold">
                {idx + 1}
              </span>
              <s.icon className="h-6 w-6 text-mp-indigo" />
            </div>
            <h3 className="text-title-md text-ink">{s.title}</h3>
            <p className="text-body-md text-body">{s.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
