// Bancos brasileiros (código COMPE de 3 dígitos + nome), para o campo de banco do recebimento.
// O Pagar.me identifica a conta pelo código COMPE. Lista dos bancos mais usados (cobre a grande
// maioria dos recebedores); se faltar algum, dá pra digitar o código na busca.

export type Bank = { code: string; name: string };

export const BANKS: Bank[] = [
  { code: "001", name: "Banco do Brasil" },
  { code: "104", name: "Caixa Econômica Federal" },
  { code: "237", name: "Bradesco" },
  { code: "341", name: "Itaú Unibanco" },
  { code: "033", name: "Santander" },
  { code: "745", name: "Citibank" },
  { code: "399", name: "HSBC" },
  { code: "422", name: "Banco Safra" },
  { code: "070", name: "BRB - Banco de Brasília" },
  { code: "077", name: "Banco Inter" },
  { code: "260", name: "Nubank (Nu Pagamentos)" },
  { code: "290", name: "PagBank (PagSeguro)" },
  { code: "323", name: "Mercado Pago" },
  { code: "336", name: "Banco C6" },
  { code: "212", name: "Banco Original" },
  { code: "380", name: "PicPay" },
  { code: "208", name: "Banco BTG Pactual" },
  { code: "756", name: "Sicoob" },
  { code: "748", name: "Sicredi" },
  { code: "085", name: "Ailos (Cooperativa)" },
  { code: "136", name: "Unicred" },
  { code: "041", name: "Banrisul" },
  { code: "004", name: "Banco do Nordeste" },
  { code: "021", name: "Banestes" },
  { code: "047", name: "Banco do Estado de Sergipe (Banese)" },
  { code: "037", name: "Banco do Pará (Banpará)" },
  { code: "003", name: "Banco da Amazônia" },
  { code: "655", name: "Banco Votorantim (BV)" },
  { code: "623", name: "Banco Pan" },
  { code: "633", name: "Banco Rendimento" },
  { code: "479", name: "Banco ItauBank" },
  { code: "652", name: "Itaú Unibanco Holding" },
  { code: "246", name: "Banco ABC Brasil" },
  { code: "025", name: "Banco Alfa" },
  { code: "263", name: "Banco Cacique" },
  { code: "224", name: "Banco Fibra" },
  { code: "184", name: "Banco Itaú BBA" },
  { code: "612", name: "Banco Guanabara" },
  { code: "604", name: "Banco Industrial do Brasil" },
  { code: "320", name: "Banco CCB Brasil" },
  { code: "755", name: "Bank of America Merrill Lynch" },
];

/** Busca por código (prefixo) ou nome (substring), case-insensitive. */
export function searchBanks(query: string): Bank[] {
  const q = query.trim().toLowerCase();
  if (!q) return BANKS;
  const digits = q.replace(/\D/g, "");
  return BANKS.filter(
    (b) => (digits && b.code.startsWith(digits)) || b.name.toLowerCase().includes(q),
  );
}

/** Nome do banco a partir do código (para exibir a seleção). */
export function bankName(code: string): string | null {
  const b = BANKS.find((x) => x.code === code);
  return b ? b.name : null;
}
