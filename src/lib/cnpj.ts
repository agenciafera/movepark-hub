// Autopreenchimento por CNPJ via BrasilAPI (pública, sem key, CORS liberado). Puxa os dados
// cadastrais da Receita pra preencher razão social, nome fantasia, data de fundação, e-mail e
// o endereço da empresa no KYC do recebedor. Só devolve o que vier; nunca lança (rede/CNPJ
// inexistente devolve null). Telefone fica de fora de propósito: a Receita traz fixo, e o KYC
// espera celular.

import { cepMask } from "@/lib/masks";

export type CnpjAddress = {
  zip_code: string;
  street: string;
  street_number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};

export type CnpjData = {
  legalName: string;
  tradeName: string;
  /** DD/MM/AAAA (o form usa esse formato). Vazio se a Receita não trouxer a data. */
  foundingDate: string;
  email: string;
  address: CnpjAddress;
};

/** ISO (AAAA-MM-DD) → DD/MM/AAAA. Vazio se não bater o formato. */
function isoToBrDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Busca os dados de um CNPJ (14 dígitos). Retorna null se inválido, não encontrado ou falha de rede. */
export async function fetchCnpj(cnpj: string): Promise<CnpjData | null> {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return null;
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
    if (!res.ok) return null;
    const d = (await res.json()) as Record<string, unknown>;
    return {
      legalName: s(d.razao_social),
      tradeName: s(d.nome_fantasia),
      foundingDate: d.data_inicio_atividade ? isoToBrDate(s(d.data_inicio_atividade)) : "",
      email: s(d.email).toLowerCase(),
      address: {
        zip_code: d.cep ? cepMask(s(d.cep)) : "",
        street: s(d.logradouro),
        street_number: s(d.numero),
        complement: s(d.complemento),
        neighborhood: s(d.bairro),
        city: s(d.municipio),
        state: s(d.uf).toUpperCase(),
      },
    };
  } catch {
    return null;
  }
}
