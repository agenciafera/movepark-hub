import * as React from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { downloadCsv, toCsv } from "@/lib/csv";
import { fetchBookingsForExport, type BookingPageFilters } from "./api";
import { EXPORT_MAX_ROWS, exportHeaders, exportRow, type ExportOptions } from "./bookingsExport.logic";

/**
 * Baixa a lista de reservas do recorte em CSV (fase 6 das reservas unificadas). O arquivo segue os
 * filtros da tela; acima de EXPORT_MAX_ROWS a tela pede para encurtar o período.
 */
export function ExportBookingsButton({
  filters,
  options,
  filePrefix,
}: {
  filters: Omit<BookingPageFilters, "page" | "pageSize">;
  options: ExportOptions;
  filePrefix: string;
}) {
  const [busy, setBusy] = React.useState(false);

  async function exportar() {
    setBusy(true);
    try {
      const { total, rows } = await fetchBookingsForExport(filters, EXPORT_MAX_ROWS);
      if (rows.length === 0) {
        toast.error("Nenhuma reserva nesse recorte para exportar.");
        return;
      }
      const csv = toCsv(rows.map((r) => exportRow(r, options)), exportHeaders(options));
      downloadCsv(`${filePrefix}-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`, csv);
      if (total > rows.length) {
        toast.warning(
          `O arquivo tem as ${rows.length.toLocaleString("pt-BR")} reservas mais recentes de ${total.toLocaleString("pt-BR")}. Encurte o período para pegar o resto.`,
        );
      } else {
        toast.success(`${rows.length.toLocaleString("pt-BR")} ${rows.length === 1 ? "reserva exportada" : "reservas exportadas"}.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para exportar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="secondary" onClick={exportar} disabled={busy}>
      <DownloadSimple className="h-4 w-4" aria-hidden />
      {busy ? "Exportando..." : "Exportar"}
    </Button>
  );
}
