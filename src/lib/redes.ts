/**
 * Perfis da Movepark nas redes, numa fonte só.
 *
 * Mesmo motivo do [`suporte.ts`](./suporte.ts): endereço espalhado por arquivo
 * envelhece em silêncio. As redes já viviam só no rodapé dos e-mails, e o site
 * não mostrava nenhuma, então a página de contato saía sem elas sem ninguém
 * notar.
 *
 * A Edge não consegue importar daqui (Deno não enxerga `src/`), então
 * `supabase/functions/_shared/email.ts` mantém a cópia dele. As duas têm que
 * andar juntas, e `redes.test.ts` falha se divergirem.
 *
 * **LinkedIn:** é `/company/movepark`, e não a URL numérica. Conferido em
 * 14/08/2026 com requisição deslogada: a vaidosa devolve a página real
 * ("Movepark | LinkedIn") e a numérica cai no muro de login. A URL que circula
 * internamente termina em `/admin/dashboard/` e só abre para quem administra a
 * página.
 */

export type Rede = {
  /** Como aparece na tela e no rótulo acessível. */
  nome: string;
  url: string;
};

export const REDES: Rede[] = [
  { nome: "Instagram", url: "https://www.instagram.com/moveparkestacionamento" },
  { nome: "Facebook", url: "https://www.facebook.com/profile.php?id=100066981103562" },
  { nome: "LinkedIn", url: "https://www.linkedin.com/company/movepark" },
];
