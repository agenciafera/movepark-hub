# Movepark Website UI Kit

Kit de UI do marketplace Movepark — busca em pílula, cards foto-first, category strip, rail de reserva sticky e o único momento tipográfico intenso (rating display) — tudo com identidade própria Movepark (navy + violet + indigo, Inter, monograma M).

## O que está modelado

Interface de marketplace de vagas de estacionamento. Vagas substituem imóveis; tarifas horárias no lugar de diárias; "Operador verificado" em vez de "Superhost".

## Arquivos

| Arquivo | Propósito |
|---|---|
| `index.html` | Protótipo clicável — conecta todos os componentes |
| `styles.css` | Importa as foundations e estilos de componente |
| `TopNav.jsx` | Navegação global com três abas de produto |
| `SearchBar.jsx` | Busca em pílula com segmentos Onde / Quando / Duração + orb violet |
| `CategoryStrip.jsx` | Filtro de categoria horizontal scrollável (Cobertas, 24h, etc.) |
| `PropertyCard.jsx` | Card foto-first com dots, badge destaque, coração salvo e meta |
| `ListingDetail.jsx` | Detalhe em 2 colunas: galeria, amenidades, rating-display, rail de reserva sticky |
| `Footer.jsx` | Rodapé três colunas + faixa legal |

## Fluxos

O protótipo inicia na home. A partir daí:
- Clicar num card → abre o detalhe da vaga
- Clicar no coração → alterna estado salvo
- Clicar no botão de conta (canto direito) → abre modal de login
- Clicar em "Reservar" no detalhe → confirma com toast e volta para home

## Observações

- **Sem fotografias reais** — cada placa de imagem é um placeholder de gradiente alinhado à marca. Substituir por fotografia de produção quando disponível.
- **Sem codebase real** — formas dos componentes derivadas das specs de design. Conectar ao repositório real para aumentar fidelidade.
- **Ícones** são SVGs manuais no estilo Lucide (~1.7–2px stroke, pontas arredondadas). Trocar pelo set de ícones de produção quando disponível.
- **i18n**: copy em português brasileiro alinhada à marca.
