import { useSearchParams } from "react-router-dom";
import { SearchBarPill } from "@/features/search/SearchBarPill";

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Hero da home — foto de fundo + headline + pill de busca.
 * Placeholder photo: Unsplash neutro (estacionamento/aeroporto).
 */
export function Hero() {
  // Ao "Editar" a busca, o results manda de volta pra /?dest=...&from=...&to=... — semeia o pill
  // com esses valores pra não perder o que o usuário já tinha escolhido.
  const [params] = useSearchParams();
  return (
    <section
      className="relative flex min-h-[480px] items-center justify-center overflow-hidden bg-mp-navy"
    >
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            'url("https://images.unsplash.com/photo-1545173168-9f1947eebb7f?auto=format&fit=crop&w=1920&q=80")',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 bg-mp-navy/55"
        aria-hidden="true"
      />
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center gap-8 px-6 py-16 text-center">
        <div className="space-y-3 text-white">
          <h1 className="text-display-xl tablet:text-[40px] tablet:leading-[1.15] font-bold">
            Estacione com confiança em qualquer aeroporto
          </h1>
          <p className="text-body-md tablet:text-[18px] text-white/85">
            Compare vagas de várias operadoras num só lugar, com reserva instantânea.
          </p>
        </div>
        <SearchBarPill
          className="mx-auto"
          initialDest={params.get("dest")}
          initialFrom={parseDate(params.get("from"))}
          initialTo={parseDate(params.get("to"))}
        />
      </div>
    </section>
  );
}
