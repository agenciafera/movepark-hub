import {
  parseInstallmentPolicy,
  type InstallmentPolicy,
} from "../_shared/payments/installments.ts";

/**
 * Monta o corpo público de `/get-payment-config`.
 *
 * A rota é aberta (`verify_jwt = false`, CORS `*`): o que sai daqui está visível para
 * a internet inteira. A public key do Pagar.me (`pk_`) é publishable e existe para
 * tokenizar cartão no navegador, então expor é o desenho. A secret key (`sk_`) não:
 * ela cobra, estorna e lê dado de portador.
 *
 * As duas moram no mesmo painel, com nomes vizinhos. Colar uma no lugar da outra é um
 * erro de um caractere, e o efeito seria publicar a chave que move dinheiro. Por isso
 * a checagem abaixo: chave com cara de secreta não sai daqui.
 *
 * O resultado de recusar é checkout de cartão quebrado, que aparece na hora. O
 * resultado de deixar passar é uma chave secreta indexada.
 */

export type ConfigPublica = {
  public_key: string;
  installment_policy: InstallmentPolicy;
};

/** Prefixos que o Pagar.me usa em chave secreta, incluindo a de teste. */
const PREFIXOS_SECRETOS = ["sk_", "sk_test_", "sk_live_"];

export function pareceChaveSecreta(valor: string): boolean {
  const v = valor.trim().toLowerCase();
  return PREFIXOS_SECRETOS.some((p) => v.startsWith(p));
}

export function montarConfigPublica(
  publicKey: string | undefined,
  settingValue: string | null | undefined,
): ConfigPublica {
  const bruta = (publicKey ?? "").trim();
  return {
    public_key: pareceChaveSecreta(bruta) ? "" : bruta,
    installment_policy: parseInstallmentPolicy(settingValue),
  };
}
