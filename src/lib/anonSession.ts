// Sessão anônima do navegador (E0.16).
//
// Um identificador aleatório por aba, guardado em `sessionStorage`. Serve para dedup de clique
// de saída e para contar visitante distinto no funil da unidade externa.
//
// O que ele NÃO é, e não pode virar: identificador de pessoa. Não deriva de nada do usuário
// (sem fingerprint, sem e-mail, sem `profile_id`), morre quando a aba fecha, e a tabela que o
// consome não tem coluna nenhuma que o ligue a `profiles`. Se um dia alguém precisar cruzar
// clique com pessoa, isso é decisão de produto e de LGPD, não um `join` a mais.

const STORAGE_KEY = "mp_anon_session";

function safeSession(): Storage | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null; // SSR ou storage bloqueado (modo privado).
  }
}

function newId(): string {
  // `randomUUID` só existe em contexto seguro. O fallback não precisa ser criptográfico: o pior
  // caso de uma colisão é uma dedup a mais, e o valor nunca protege nada.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * Id da sessão anônima desta aba, criando na primeira chamada.
 *
 * Devolve null quando não há storage: sem lugar para guardar, gerar um id novo a cada clique
 * inflaria a contagem de sessões distintas do funil, que é pior do que não medir.
 */
export function getAnonSessionId(): string | null {
  const store = safeSession();
  if (!store) return null;

  const existing = store.getItem(STORAGE_KEY);
  if (existing) return existing;

  const id = newId();
  try {
    store.setItem(STORAGE_KEY, id);
  } catch {
    return null; // Cota estourada: mesma razão de acima, melhor não medir do que medir inflado.
  }
  return id;
}
