/**
 * Canal de atendimento da Movepark, numa fonte só.
 *
 * O número já morava cravado em `supabase/functions/_shared/email.ts`, e a
 * página de contato tinha uma cópia própria que ficou para trás: foi ao ar com
 * `5511999999999`, um placeholder. Um número de suporte espalhado por arquivo
 * envelhece em silêncio, porque ninguém abre a página de contato para conferir.
 *
 * A Edge não consegue importar daqui (Deno não enxerga `src/`), então
 * `_shared/email.ts` mantém a cópia dele. As duas têm que andar juntas, e
 * `suporte.test.ts` falha se divergirem.
 */

/** Só os dígitos, com DDI, que é o formato que o `wa.me` aceita. */
export const WHATSAPP_SUPORTE_DIGITOS = "5511994752952";

export const WHATSAPP_SUPORTE = {
  digitos: WHATSAPP_SUPORTE_DIGITOS,
  /** Como o número aparece na tela. */
  label: "(11) 99475-2952",
  href: `https://wa.me/${WHATSAPP_SUPORTE_DIGITOS}`,
};

export const EMAIL_SUPORTE = "contato@movepark.co";
