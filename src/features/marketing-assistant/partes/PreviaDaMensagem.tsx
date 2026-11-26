type Saida =
  | { channel: "email"; subject?: string; body?: string }
  | { channel: "whatsapp"; template?: string; params?: string[] };

/**
 * A mensagem como o cliente vê. O HTML do e-mail vai num iframe com `sandbox` vazio: sem script,
 * sem formulário, sem origem. É a única saída de tool desenhada como HTML na página.
 */
export function PreviaDaMensagem({ saida }: { saida: unknown }) {
  const s = (saida ?? {}) as Saida;
  if (s.channel === "email") {
    return (
      <div className="space-y-2 rounded-lg border border-hairline bg-surface p-3">
        <p className="text-body-sm">
          <span className="text-muted">Assunto: </span>
          <span className="font-semibold text-ink">{s.subject}</span>
        </p>
        <iframe
          title="Prévia do e-mail"
          sandbox=""
          srcDoc={s.body ?? ""}
          className="h-64 w-full rounded border border-hairline bg-white"
        />
      </div>
    );
  }
  if (s.channel === "whatsapp") {
    return (
      <div className="space-y-1 rounded-lg border border-hairline bg-surface p-3 text-body-sm">
        <p>
          <span className="text-muted">Modelo: </span>
          <span className="font-semibold text-ink">{s.template}</span>
        </p>
        {(s.params ?? []).map((p, i) => (
          <p key={i} className="text-body">
            {`{{${i + 1}}}`} {p}
          </p>
        ))}
      </div>
    );
  }
  return null;
}
