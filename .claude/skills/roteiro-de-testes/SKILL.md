---
name: roteiro-de-testes
description: >
  Escreve, revisa ou atualiza roteiro de testes (QA ponto a ponto) do Movepark
  Hub, no formato que não envelhece: status derivado de evidência, asserção
  verificável por caso, armadilhas de formulário documentadas, efeitos
  colaterais declarados e limpeza FK-safe. Use SEMPRE que for criar um roteiro
  de teste novo, atualizar um existente, reconciliar roteiro com o código,
  marcar caso como pronto ou pendente, ou quando o usuário disser "monta o
  roteiro de teste", "revisa o roteiro", "esse caso ainda falta?", "atualiza o
  status dos casos". Também use antes de automatizar um roteiro em Playwright,
  porque a skill define o que cada caso precisa ter para virar teste.
---

# Roteiro de testes do Movepark Hub

## Por que esta skill existe

Em jul/2026, ao automatizar o roteiro E1.3, **8 dos 17 casos descreviam um baseline que já não existia**. Todos os itens marcados FALTA estavam implementados, alguns havia semanas. O testador procurava o que já estava pronto, e o time discutia entregar coisa entregue.

A causa não foi desleixo. Foi formato: o roteiro registrava status como **texto declarado uma vez**, sem nada que o obrigasse a ser reconferido. Um roteiro assim envelhece a cada deploy.

Duas correções minhas na mesma revisão vieram do mesmo erro: declarei T-06 e T-09 pendentes depois de procurar num único arquivo. Os dois estavam prontos, em arquivo diferente do que olhei.

## Regra número um: status é derivado, nunca declarado

Nenhum caso pode dizer "FALTA", "PRONTO" ou "PARCIAL" sem trazer a evidência ao lado. Formato obrigatório:

- `PRONTO · coberto por e2e/manager/T05-kanban-tela-cheia.spec.ts`
- `PRONTO · sem teste · Sidebar.tsx:57 (commit 75b7a58)`
- `PENDENTE · verificado em <data> · git log de src/features/onboarding/ sem commit relacionado`

Status sem evidência é bug de roteiro.

### Antes de escrever PENDENTE, olhe o histórico da área

Busca por palavra num arquivo **não** é verificação. O contador de leads existia em `Sidebar.tsx` enquanto eu procurava em `nav-items.ts`.

```bash
git log --oneline --since="30 days ago" -- src/features/<area>/ src/routes/<area>/
git show -s --format=%B <commit>   # o corpo costuma explicar a decisão
```

O corpo do commit vale ouro. Em `cab629e`, o autor descreveu exatamente o comportamento do kanban que eu ia reportar como falha de design. Era decisão consciente, e ler isso mudou a atividade inteira.

## O que cada caso precisa ter

```markdown
### T-NN · <o que se prova>  [STATUS · evidência]

- **Antes:** estado verificável. SQL quando for banco.
- **Passos:** o que a pessoa faz, na ordem.
- **Depois:** estado verificável. SQL ou elemento de tela.
- **Efeitos colaterais:** e-mail que sai, arquivo que sobe, cobrança.
- **Armadilhas:** o que faz alguém registrar dado errado sem perceber.
```

"Antes" e "Depois" precisam ser checáveis por máquina. "A tela mostra o cadastro" não serve. `select onboarding_status from company where slug ilike '%mercy%'` serve.

## Armadilhas: a seção que mais evita erro humano

Formulário que aceita valor errado em silêncio é pior que formulário que quebra. Estas três custaram falha na automação do E1.3 e valem para quem testa na mão:

- **Campo de dinheiro mascara em centavos.** Digitar `15000` em Renda mensal grava **R$ 150,00**. O campo aceita e segue.
- **Telefone tem dois campos** (seletor de país e número). Mirar no errado deixa o telefone vazio e o passo trava sem mensagem clara.
- **Checkbox obrigatório escondido no meio do passo.** No representante, "Declaro que sou o representante legal" bloqueia o avanço e o roteiro original nem citava.

Ao escrever um caso, pergunte: *o que aqui aceitaria um valor errado sem reclamar?* Isso vira armadilha documentada.

## Fixtures e usuários

Os usuários de teste são fixos e estão no `CLAUDE.md`. Não invente usuário novo.

| Papel | E-mail |
|---|---|
| Parceiro em onboarding | `peu+mercy@fera.ag` (empresa **Mercy**) |
| Cliente | `peu+teste1@fera.ag` |
| Super admin | `developer@fera.ag` |

**Ciclo do parceiro:** o mesmo usuário atravessa o onboarding e, aprovado, vira o operador da unidade que cadastrou. Roteiro que começa em `/operator` precisa dizer como chegou ali: onboarding completo ou vínculo semeado.

## Limpeza faz parte do roteiro

Roteiro sem teardown só roda limpo uma vez. E a ordem importa mais do que parece:

- `location.company_id` é **RESTRICT**. Sem apagar a unidade antes, o delete da company falha e trava a limpeza inteira.
- `booking.location_id` também é RESTRICT, e isso é proposital. Se a limpeza estourar ali, a unidade de teste ganhou reserva de verdade: investigue, não force.
- Arquivo em Storage não cai por FK nenhuma. Fotos do wizard ficam em `assets-public/<company_id>/`.

Antes de escrever a limpeza, confira as FKs em vez de supor:

```sql
select tc.table_name, rc.delete_rule
from information_schema.table_constraints tc
join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
where tc.constraint_type = 'FOREIGN KEY' and ccu.table_name = '<tabela>';
```

## Efeitos colaterais precisam estar escritos

Hoje a suíte roda contra **produção** (não existe staging do Hub). Todo caso que dispara algo para fora declara isso:

- submeter lead manda e-mail real para o lead e para `hub@movepark.co`
- aprovar parceiro manda o e-mail de convite
- publicar unidade sobe imagem para o Storage de produção

Quem for rodar o roteiro precisa saber disso antes, não depois de a caixa de entrada encher.

## Caso automatizado aponta para o teste

Quando existir cobertura, o caso traz o arquivo. Isso fecha o ciclo: o roteiro deixa de ser a fonte da verdade sobre o status e passa a apontar para algo que roda.

Casos sem cobertura ficam marcados como tal, com o motivo. Há dois tipos legítimos: depende de decisão em aberto, ou depende de coisa que teste não alcança (investigação em sandbox de terceiro, conferir caixa de entrada).

## Ao revisar um roteiro existente

1. Rode o histórico do git das áreas que o roteiro cobre, no período desde a data do baseline dele.
2. Para cada caso, confirme o status **no código**, com arquivo e linha.
3. Corrija os status e registre a evidência.
4. Some as armadilhas que aparecerem.
5. Se algum caso mudou de natureza (a premissa caiu), diga isso explicitamente em vez de só trocar o status. No E1.3, o T-08 deixou de ser "realinhar o pedido" e virou pergunta de UX, porque o step de fotos passou a existir.
6. Se o roteiro estiver muito defasado, o achado principal não é caso a caso: é que faltava rede de regressão. Diga isso.

## Escrita

Vale a regra de marca do projeto: **sem travessão** ("—" ou "–"). Reescreva com ponto, vírgula, dois-pontos ou parênteses.
