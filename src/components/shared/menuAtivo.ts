/**
 * O item do menu marca a **seção**, não a URL exata.
 *
 * Lendo um post, "Blog" continua aceso; dentro de um destino, "Destinos"
 * também. Sem isso a marca some justamente quando o leitor navegou para dentro,
 * que é quando ele mais precisa saber onde está.
 *
 * A barra final é normalizada dos dois lados porque o blog usa a URL canônica
 * com barra (`/blog/`, herdada do WordPress) e as outras rotas não.
 *
 * O corte por `/` é o que separa seção de prefixo parecido: `/destinos` não pode
 * acender em `/destinos-antigos`.
 */
export function secaoAtiva(pathname: string, to: string): boolean {
  const alvo = to.replace(/\/+$/, "");
  const atual = pathname.replace(/\/+$/, "");
  if (!alvo) return false;
  return atual === alvo || atual.startsWith(`${alvo}/`);
}
