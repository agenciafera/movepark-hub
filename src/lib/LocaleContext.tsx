import * as React from "react";

import { LOCALE_PADRAO, type Locale } from "./i18n";
import { textos, type Textos } from "./i18nTextos";

/**
 * O idioma da página, para os componentes que ficam abaixo dela.
 *
 * Contexto, e não prop, por um motivo prático: o texto em português está espalhado
 * por card, tabela, cabeçalho e rodapé, e passar `locale` por prop obrigaria a mudar
 * a assinatura de uma dúzia de componentes que hoje não sabem que idioma existe. O
 * risco de conflito com o resto do time seria alto e o ganho, nenhum.
 *
 * **O default é o português.** Componente sem provider acima continua exatamente
 * como está hoje, então a página que ainda não foi tocada não muda de comportamento
 * e nenhuma rota precisa ser migrada de uma vez.
 */
const LocaleContext = React.createContext<Locale>(LOCALE_PADRAO);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return React.useContext(LocaleContext);
}

/** O dicionário da casca no idioma da página. */
export function useTextos(): Textos {
  return textos(useLocale());
}
