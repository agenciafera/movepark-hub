// E0.10 · Quais credenciais sobrevivem ao merge, e quais somem.
//
// O `auth.users` guarda um e-mail e um telefone por conta (ADR-006). No merge, a conta em sessão
// sobrevive, ganha o identificador recém-verificado e a outra conta é apagada. Logo, a credencial
// da conta perdedora no OUTRO canal (a que não está sendo anexada) deixa de existir como login,
// porque não há onde guardá-la. A tela "conectar contas" precisa dizer isso antes de confirmar.

export type MergePreview = {
  bookings: number;
  vehicles: number;
  saved: number;
  reviews: number;
  email: string | null;
  phone: string | null;
};

export type MyIdentities = {
  email: string | null;
  phone: string | null;
  email_verified: boolean;
  phone_verified: boolean;
};

export function computeMergeLogins(args: {
  channel: "phone" | "email";
  /** Identificador sendo anexado: ele passa para a conta em sessão. */
  identifier: string;
  preview: MergePreview;
  mine?: Pick<MyIdentities, "email" | "phone" | "email_verified" | "phone_verified"> | null;
}): { losing: string[]; remaining: string[] } {
  const { channel, identifier, preview, mine } = args;

  // A credencial do outro canal da conta perdedora não tem para onde ir.
  const orphan = channel === "phone" ? preview.email : preview.phone;
  const losing = orphan && orphan !== identifier ? [orphan] : [];

  const remaining: string[] = [];
  if (mine?.email && mine.email_verified) remaining.push(mine.email);
  if (mine?.phone && mine.phone_verified) remaining.push(mine.phone);
  if (!remaining.includes(identifier)) remaining.push(identifier);

  return { losing, remaining };
}
