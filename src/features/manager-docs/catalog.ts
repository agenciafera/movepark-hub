/**
 * Catálogo da superfície INTERNA da Movepark.
 *
 * O que está aqui não aparece no `public/openapi.yaml` nem em card de MCP: é ação
 * de Manager, e superfície pública não anuncia ação de Manager. Esta é a
 * documentação dela, e ela é servida numa rota trancada por `hub_admin`.
 *
 * `manager-docs.contract.test.ts` casa este catálogo com as rotas declaradas em
 * `supabase/functions/api/router.ts`. Rota interna nova sem entrada aqui reprova
 * o teste, e entrada aqui sem rota também. É o mesmo remédio do `lint:openapi`,
 * aplicado à documentação que ninguém vê de fora.
 */

export type Modalidade = "manager" | "operator" | "publico";

/**
 * A superfície de MCP do Manager.
 *
 * Ela é interna de verdade: não tem card, e recusa até o `tools/list` sem chave
 * de plataforma. O `lint:openapi` reprova o build se um nome dela aparecer em
 * qualquer card, do jeito que já reprova rota interna publicada no OpenAPI.
 */
export const MCP_MANAGER_ENDPOINT = "https://mcp.movepark.co/manager";

export interface RotaInterna {
  metodo: "GET" | "POST";
  caminho: string;
  escopo: string;
  resumo: string;
  corpo?: { campo: string; tipo: string; obrigatorio?: boolean; nota?: string }[];
  respostas?: string;
}

export const ROTAS_INTERNAS: RotaInterna[] = [
  {
    metodo: "POST",
    caminho: "/v1/blog/posts",
    escopo: "blog:write",
    resumo: "Cria um post, ou atualiza o existente com o mesmo slug.",
    corpo: [
      { campo: "slug", tipo: "string", obrigatorio: true, nota: "vira /blog/<slug>/ e é contrato de URL" },
      { campo: "title", tipo: "string", obrigatorio: true },
      { campo: "body_md", tipo: "string", obrigatorio: true, nota: "Markdown" },
      { campo: "excerpt", tipo: "string" },
      { campo: "cover_image_url", tipo: "string" },
      { campo: "meta_title", tipo: "string" },
      { campo: "meta_description", tipo: "string" },
      { campo: "category", tipo: "slug", nota: "ex.: precos, guias" },
      { campo: "author", tipo: "slug", nota: "ex.: diego" },
      { campo: "destination", tipo: "slug", nota: "ex.: aeroporto-de-viracopos" },
      { campo: "tags", tipo: "slug[]", nota: "substitui as tags atuais" },
      { campo: "is_published", tipo: "boolean", nota: "padrão false" },
    ],
    respostas: "200 com { id, slug }. 400 quando um slug de categoria, autor, destino ou tag não existe.",
  },
  {
    metodo: "POST",
    caminho: "/v1/blog/posts/:slug/publish",
    escopo: "blog:write",
    resumo: "Publica ou despublica um post.",
    corpo: [{ campo: "is_published", tipo: "boolean", nota: "padrão true" }],
    respostas: "200 com { slug, is_published }. 404 se o post não existe.",
  },
  {
    metodo: "POST",
    caminho: "/v1/blog/posts/:slug/delete",
    escopo: "blog:write",
    resumo: "Exclui um post (soft delete: a linha fica, com deleted_at).",
    respostas: "200 com { slug, deleted: true }. 404 se o post não existe.",
  },
];

export interface SuperficieMcp {
  nome: string;
  endpoint: string;
  autenticacao: string;
  modalidade: Modalidade;
  tools: string;
  observacao?: string;
}

export const SUPERFICIES_MCP: SuperficieMcp[] = [
  {
    nome: "Manager (interna)",
    endpoint: MCP_MANAGER_ENDPOINT,
    autenticacao: "Chave de plataforma, emitida aqui nesta página",
    modalidade: "manager",
    tools: "Escrita do blog: criar e atualizar, publicar e despublicar, excluir.",
    observacao:
      "Sem card público, e recusa até o tools/list sem chave. Chave de parceiro não entra, mesmo com o escopo: a superfície confere que a chave não tem empresa.",
  },
  {
    nome: "Consumidor",
    endpoint: "https://mcp.movepark.co",
    autenticacao: "Nenhuma",
    modalidade: "publico",
    tools: "Descoberta e consulta: busca de estacionamento, simulação de preço, FAQ, destinos, blog e a base de conhecimento.",
    observacao: "Nenhuma tool escreve. É a superfície que o agente de fora usa.",
  },
  {
    nome: "Parceiro",
    endpoint: "https://mcp.movepark.co/partner",
    autenticacao: "Chave mp_ do parceiro, com escopo",
    modalidade: "operator",
    tools: "Espelha a API v1 tenant-scoped: unidades, disponibilidade, reservas, cupons, avaliações.",
    observacao: "Recusa até o tools/list sem chave válida.",
  },
  {
    nome: "Consumidor autenticado",
    endpoint: "https://mcp.movepark.co/customer",
    autenticacao: "Login do usuário final por código (OTP) no WhatsApp ou e-mail",
    modalidade: "publico",
    tools: "Reserva em nome do usuário. O pagamento acontece no checkout web, nunca pelo MCP.",
    observacao: "Lista as tools sem sessão, mas reservar e cancelar exigem login.",
  },
];


export interface Modalidades {
  nome: string;
  quem: string;
  credencial: string;
  ondeSeDocumenta: string;
}

export const MODALIDADES: Modalidades[] = [
  {
    nome: "Público",
    quem: "Qualquer um, inclusive agente de IA",
    credencial: "Nenhuma no MCP consumidor. Na API v1, chave com escopo de leitura",
    ondeSeDocumenta: "openapi.yaml, card do MCP e llms.txt",
  },
  {
    nome: "Operator (parceiro)",
    quem: "Estacionamento parceiro",
    credencial: "Chave mp_ gerada pelo próprio painel, em /operator/api-keys",
    ondeSeDocumenta: "openapi.yaml e card do MCP de parceiro",
  },
  {
    nome: "Manager (Movepark)",
    quem: "Equipe Movepark",
    credencial: "Chave de plataforma, emitida só aqui nesta página",
    ondeSeDocumenta: "Esta página. Fora daqui, em lugar nenhum",
  },
];
