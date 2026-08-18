/**
 * Chaves de funcionalidade do front, lidas no build.
 *
 * A primeira nasceu do lançamento de 20/08/2026.
 */

/**
 * Conta do consumidor: favoritar, "Entrar" e os atalhos de conta na topbar, no
 * menu mobile e no checkout.
 *
 * **Desligada por padrão.** No lançamento o site sobe sem nenhuma unidade que
 * feche reserva no Hub, e toda unidade responde por checkout externo. Um botão
 * que empurra o visitante a criar conta cobra um cadastro e não entrega nada em
 * troca: gera suporte, não reserva. Some agora, volta na primeira unidade
 * transacionável.
 *
 * **Por que é chave de build e não config de banco.** Ela vira uma vez só, num
 * dia que já tem deploy. Vindo do banco, o HTML do SSG sairia sem os controles e
 * eles apareceriam depois da hidratação, então o visitante veria o "Entrar"
 * piscar na tela justamente enquanto a decisão é escondê-lo. Cravada no build,
 * o bundle nem carrega o caminho desligado.
 *
 * **Para ligar:** `VITE_CONSUMER_ACCOUNTS=on` no ambiente de build (no
 * Cloudflare, em Settings › Build › Variables and Secrets, escopos Production e
 * Preview) e publique. Nenhum componente precisa ser tocado.
 *
 * O que ela **não** desliga, de propósito: a rota `/login`, que continua
 * respondendo por URL direta porque é por onde o time entra no Manager e no
 * Operator, e os atalhos "Ir pro Manager" e "Ir pro Operator", que são navegação
 * de equipe e não CTA de consumidor.
 */
export function contasDoConsumidorLigadas(): boolean {
  return import.meta.env.VITE_CONSUMER_ACCOUNTS === "on";
}

/**
 * Assistente do site: a bolinha de chat do canto inferior direito
 * (`ChatWidget`, E3.3), que fala com a Edge `chat`.
 *
 * **Desligado por padrão.** No lugar dele o canto recebe a bolinha de WhatsApp,
 * que cai no atendimento da equipe. Enquanto o assistente estiver desligado, a
 * home e a página de contato não podem prometer resposta a qualquer hora: quem
 * responde é gente, em dia útil.
 *
 * **Por que é chave de build e não a config de banco.** O banco já tem
 * `chatbot_enabled`, e ela continua valendo do lado da Edge. O que ela não
 * resolve é a tela: a config chega depois da hidratação, então a bolinha
 * piscaria no canto antes de sumir, e as duas bolinhas dividiriam o mesmo canto
 * durante esse tempo. Cravada no build, o bundle nem carrega o caminho
 * desligado.
 *
 * **Para ligar:** `VITE_WEB_ASSISTANT=on` no ambiente de build (no Cloudflare,
 * em Settings › Build › Variables and Secrets, escopos Production e Preview) e
 * publique. O `chatbot_enabled` do banco precisa estar ligado também, senão a
 * bolinha sobe e some sozinha.
 */
export function assistenteDoSiteLigado(): boolean {
  return import.meta.env.VITE_WEB_ASSISTANT === "on";
}
