// Mensagem de feedback (toast) das ações de parceiro no Manager, decidida a partir do
// resultado REAL de envio do e-mail que a Edge `approve-partner` agora retorna. Antes o
// envio era fire-and-forget e o toast dizia "sucesso" mesmo quando o e-mail não saía.

export type EmailOutcome = { emailSent?: boolean; emailError?: string | null };

function suffix(res: EmailOutcome): string {
  return res.emailError ? `: ${res.emailError}` : ".";
}

/** Toast do "Aprovar e enviar convite" (drawer e arraste no kanban). */
export function partnerApproveMessage(res: EmailOutcome): { ok: boolean; text: string } {
  return res.emailSent
    ? { ok: true, text: "Parceiro aprovado. Convite enviado por e-mail." }
    : { ok: false, text: `Parceiro aprovado, mas o e-mail não saiu${suffix(res)}` };
}

/** Toast do "Reenviar convite". */
export function partnerResendMessage(res: EmailOutcome): { ok: boolean; text: string } {
  return res.emailSent
    ? { ok: true, text: "Convite reenviado por e-mail." }
    : { ok: false, text: `E-mail não enviado${suffix(res)}` };
}
