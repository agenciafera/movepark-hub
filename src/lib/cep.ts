// Autopreenchimento de endereço por CEP via ViaCEP (API pública, sem key, CORS liberado).
// Usado nos campos de endereço do onboarding do parceiro (KYC/recebimento). Só preenche o que
// vier; nunca lança (rede/CEP inexistente devolve null e o usuário digita na mão).

export type CepAddress = {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
};

/** Busca o endereço de um CEP (8 dígitos). Retorna null se inválido, não encontrado ou falha de rede. */
export async function fetchCep(cep: string): Promise<CepAddress | null> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      erro?: boolean;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };
    if (data.erro) return null;
    return {
      street: data.logradouro ?? "",
      neighborhood: data.bairro ?? "",
      city: data.localidade ?? "",
      state: (data.uf ?? "").toUpperCase(),
    };
  } catch {
    return null;
  }
}
