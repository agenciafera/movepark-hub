import { toast } from "sonner";
import { MapPin, Car, Tag, Sparkles } from "lucide-react";
import { StepShell } from "../StepShell";
import { useSubmitOnboarding, type OnboardingData } from "../wizardApi";

type Props = { data: OnboardingData; companyId: string; onBack: () => void; onSubmitted: () => void };

function brl(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function Step6Review({ data, companyId, onBack, onSubmitted }: Props) {
  const submit = useSubmitOnboarding(companyId);

  async function handleSubmit() {
    try {
      await submit.mutateAsync({ p_company_id: companyId });
      onSubmitted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar");
    }
  }

  return (
    <StepShell
      title="Revisão e publicação"
      description="Confira tudo. Ao enviar, seu estacionamento vai ao ar na busca."
      onBack={onBack}
      onNext={handleSubmit}
      nextLabel="Enviar e publicar"
      busy={submit.isPending}
    >
      <section className="flex flex-col gap-2 rounded-md border border-hairline p-4">
        <div className="flex items-center gap-2 text-title-sm text-ink">
          <MapPin className="h-4 w-4" /> {data.company.name}
        </div>
        <div className="text-body-sm text-muted">
          {data.location?.name ?? "Sem localização"}
          {data.location?.address ? ` — ${data.location.address}` : ""}
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-md border border-hairline p-4">
        <div className="flex items-center gap-2 text-title-sm text-ink">
          <Car className="h-4 w-4" /> Tipos de vaga e preços
        </div>
        {data.items.length === 0 ? (
          <p className="text-body-sm text-muted">Nenhum tipo de vaga cadastrado.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {data.items.map((i) => (
              <li key={i.location_parking_type_id} className="flex items-center justify-between text-body-sm">
                <span className="text-ink">
                  {i.name} <span className="text-muted">· {i.capacity} vagas</span>
                </span>
                <span className="flex items-center gap-1 text-muted">
                  <Tag className="h-3.5 w-3.5" />
                  {i.strategy === "fixed_bracket"
                    ? `${i.tiers.length} faixa(s)`
                    : `${brl(i.tiers.find((t) => t.unit_price != null)?.unit_price ?? i.base_price)}/dia`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.addons.length > 0 && (
        <section className="flex flex-col gap-2 rounded-md border border-hairline p-4">
          <div className="flex items-center gap-2 text-title-sm text-ink">
            <Sparkles className="h-4 w-4" /> Serviços adicionais
          </div>
          <ul className="flex flex-col gap-1">
            {data.addons.map((a) => (
              <li key={a.add_on_service_id} className="flex justify-between text-body-sm">
                <span className="text-ink">{a.name}</span>
                <span className="text-muted">{brl(a.base_price)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </StepShell>
  );
}
