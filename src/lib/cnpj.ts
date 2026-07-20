// Autopreenchimento por CNPJ via BrasilAPI (pública, sem key, CORS liberado). Puxa os dados
// cadastrais da Receita pra preencher razão social, nome fantasia e data de fundação no KYC do
// recebedor. Só devolve o que vier; nunca lança (rede/CNPJ inexistente devolve null).

export type CnpjData = {
  legalName: string;
  tradeName: string;
  /** DD/MM/AAAA (o form usa esse formato). Vazio se a Receita não trouxer a data. */
  foundingDate: string;
};

/** ISO (AAAA-MM-DD) → DD/MM/AAAA. Vazio se não bater o formato. */
function isoToBrDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Busca os dados de um CNPJ (14 dígitos). Retorna null se inválido, não encontrado ou falha de rede. */
export async function fetchCnpj(cnpj: string): Promise<CnpjData | null> {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return null;
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      razao_social?: string;
      nome_fantasia?: string;
      data_inicio_atividade?: string;
    };
    return {
      legalName: (data.razao_social ?? "").trim(),
      tradeName: (data.nome_fantasia ?? "").trim(),
      foundingDate: data.data_inicio_atividade ? isoToBrDate(data.data_inicio_atividade) : "",
    };
  } catch {
    return null;
  }
}
