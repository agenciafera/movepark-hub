import * as React from "react";
import { isMeasurementOptedOut, setMeasurementOptOut } from "@/lib/measurement-optout";

/**
 * O link do rodapé que desliga a medição (GTM e Clarity) neste navegador.
 *
 * A base legal é legítimo interesse com opt-out, então o pedido tem que estar a um
 * clique em toda página, e não escondido na política. A escolha vale por navegador
 * (`localStorage`), e o texto diz isso para ninguém achar que desligou na conta.
 *
 * O estado inicial é "medindo" também no cliente, e só o efeito lê o `localStorage`:
 * a página é pré-renderizada, e ler a chave no primeiro render faria o HTML do servidor
 * divergir do cliente em quem já desligou.
 */
type Estado = "medindo" | "desligada" | "sem-storage";

const linkClass =
  "text-caption-sm text-muted underline-offset-2 hover:text-ink hover:underline focus-visible:underline";

export function MedicaoOptOut() {
  const [estado, setEstado] = React.useState<Estado>("medindo");

  React.useEffect(() => {
    if (isMeasurementOptedOut()) setEstado("desligada");
  }, []);

  function alternar(desligar: boolean) {
    if (!setMeasurementOptOut(desligar)) {
      setEstado("sem-storage");
      return;
    }
    setEstado(desligar ? "desligada" : "medindo");
  }

  if (estado === "sem-storage") {
    return (
      <p className="text-caption-sm text-muted" data-testid="medicao-optout">
        Este navegador não guarda a escolha. Libere o armazenamento do site e tente de novo.
      </p>
    );
  }

  if (estado === "desligada") {
    return (
      <p className="text-caption-sm text-muted" data-testid="medicao-optout">
        Medição desligada neste navegador.{" "}
        <button type="button" className={linkClass} onClick={() => alternar(false)}>
          Voltar a medir
        </button>
      </p>
    );
  }

  return (
    <p className="text-caption-sm text-muted" data-testid="medicao-optout">
      <button type="button" className={linkClass} onClick={() => alternar(true)}>
        Não medir minha navegação
      </button>
    </p>
  );
}
