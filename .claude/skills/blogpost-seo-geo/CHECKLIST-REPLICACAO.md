# ✅ CHECKLIST SEO/GEO OBRIGATÓRIO - Replicação de Guias Completos

**ANTES DE PUBLICAR QUALQUER POST, VALIDE 100% DESSES CRITÉRIOS**

## 1. TÍTULO & HEADING TAGS (H2/H3)

- [ ] **Title:** `Estacionamento no aeroporto de [AEROPORTO]: o guia que resolve`
  - Frase-chave na abertura
  - Máx 60 caracteres
  
- [ ] **Meta-title:** `Estacionamento no aeroporto de [AEROPORTO]: preços e como escolher`
  - Similar ao title, reforça frase-chave
  - Máx 60 caracteres

- [ ] **H2s em forma de pergunta** (fechado com `?`)
  - Exemplo: `Qual é o preço de estacionamento em [AEROPORTO]?`
  - Nunca: `Tabela de preços` ou `Preços em [AEROPORTO]`

- [ ] **H3s** quando necessário, também em forma de pergunta

## 2. PRIMEIRO PARÁGRAFO (Abertura)

- [ ] Máximo **90 palavras**
- [ ] **Frase-chave na primeira frase** (não escondida em parágrafo 2)
- [ ] Estrutura: `Estacionamento no aeroporto de [X] custa a partir de R$ [menor_preço] ...`
- [ ] Sem pronomes soltos (começar com nome do serviço, não "Ele", "Isso", "Essa")
- [ ] Número com unidade (R$, minutos, km)

## 3. META-DESCRIPTION (120-160 caracteres)

Estrutura **obrigatória**: `<frase-chave>. A partir de R$ <preço> <período>. <CTA>.`

Exemplo para Guarulhos:
```
Estacionamento no aeroporto de Guarulhos com traslado grátis 24h. A partir de R$ [X]/dia. Compare e reserve pela Movepark.
```

- [ ] Frase-chave na abertura
- [ ] Menor preço REAL (do motor de reservas ou conferido em fonte)
- [ ] Período especificado (diária, 7 dias, 15 dias)
- [ ] CTA concreto: "Compare e reserve pela Movepark" OU "Confira a tabela atualizada" OU "Veja as opções e como chegar"
- [ ] Entre 120 e 160 caracteres

## 4. DENSIDADE DE PALAVRA-CHAVE

- [ ] Frase-chave aparece em:
  - ✓ Title
  - ✓ Meta-title
  - ✓ Meta-description
  - ✓ H1 (primeiro parágrafo)
  - ✓ 2-3 H2s (naturalmente, não forçado)
  - ✓ 15-20% nos primeiros 300 palavras

- [ ] **Sinônimos variados**: "estacionamento no aeroporto de [X]", "estacionar em [X]", "estacionamento [IATA]"
  - Não repetir 30 vezes a mesma frase
  - Soar natural para humano e máquina

## 5. ESTRUTURA DO CORPO

- [ ] **Abertura autossuficiente** (até 90 palavras com frase-chave)
- [ ] **H2 em pergunta** logo abaixo
- [ ] **Parágrafo de resposta** (autossuficiente, sem "Essa tabela", "Ele fica")
- [ ] **Tabela** com preços reais, operadores, distâncias
- [ ] **Blocos de fato** (`> **Nome** fica a **X km**, cobra **R$ Y**...`)
- [ ] **FAQ em H3 com ?** (mínimo 5 perguntas próprias do post)

## 6. PREÇOS & FONTES

- [ ] Todo R$ tem **data de referência** (e.g., "outubro de 2026")
- [ ] Preço de **parceiro**: link para `/estacionamentos/<slug>`
- [ ] Preço de **não-parceiro**: nome da fonte, sem link
- [ ] Nunca preço inventado ou copiado de concorrente
- [ ] Período especificado: "1 dia", "7 dias", "15 dias" (não "30 dias")

## 7. ESTRANGEIRISMOS & LINGUAGEM

- [ ] **REMOVER**: "money", "draw", "resort", "self-park" (deixar como está se for termo técnico mas contextualizar)
- [ ] **TROCAR**: 
  - "money" → "dinheiro" ou "reais"
  - "draw" → "sorte" ou "risco"
  - "resort" → "luxo" ou "conforto"
- [ ] Linguagem comum, segunda pessoa ("você")
- [ ] Zero travessão `—`, zero traço `–`
- [ ] Usar " - " quando precisar de separador

## 8. IMAGENS

- [ ] Cada imagem com **nome descritivo em kebab-case**:
  - `estacionamento-aeroporto-de-[cidade]-[variacao].webp`
  - Exemplos: `estacionamento-aeroporto-guarulhos-preco.webp`, `estacionamento-guarulhos-vaga-coberta.webp`

- [ ] **Alt text** com núcleo (serviço + lugar) + variação:
  - `estacionamento no aeroporto de Guarulhos com vagas bem organizadas`
  - Não começar com "imagem de" ou "foto de"

- [ ] Todas em `.webp`, máx 1600px de largura
- [ ] Frota moderna (2020s), cenário contemporâneo
- [ ] Sem carro antigo, ferrugem, pintura fosca ou placa legível

## 9. LINKS & CTAs

- [ ] Mínimo **1 link para `/estacionamentos/<slug>`** (reserva)
- [ ] Link externo nunca para quem vende vaga (agregador, comparador, site do parceiro)
- [ ] Fonte citada pelo nome, sem link (portão 1.4 da skill)
- [ ] CTA concreto no fim ("Reserve na Movepark", "Confira a tabela", "Compare agora")

## 10. VALIDAÇÃO FINAL

Antes de publicar, rode:

```bash
node .claude/skills/blogpost-seo-geo/scripts/analisar-post.mjs <arquivo.md>
```

- [ ] Zero `XX` (bloqueios)
- [ ] Máximo 3 `!!` (laranja, com justificativa)
- [ ] `ok` em verde nos grupos principais

## 11. PUBLICAÇÃO

Após validar:

1. [ ] Commit + push na `main`
2. [ ] Verificar `/blog/[novo-slug]` no ar em ~2 min (deploy automático)
3. [ ] Conferir primeiro parágrafo e tabela no navegador
4. [ ] Meta-description aparecendo no resumo da listagem

---

**CRÍTICO**: Não publique nenhum post sem passar por TODOS esses 11 passos. A replicação de 23 guias sem esse checklist vai gerar posts rasos e quebrar o padrão do blog.

Se algum critério não coubcaber, JUSTIFIQUE por escrito ao usuário antes de publicar.
