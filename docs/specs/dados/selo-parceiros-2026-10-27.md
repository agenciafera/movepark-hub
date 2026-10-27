# Selo de parceiro: levantamento e pedidos (Conteúdo 70, 27/10/2026)

Os 8 parceiros com unidade listada (`location.is_listed`) têm site próprio. O banco não guarda o
site do parceiro: os domínios saíram do e-mail de contato da unidade (`location.email`) e foram
conferidos no ar, um a um. O `aeropark.com.br` é de um hotel em Londrina; o da Aeropark de
Guarulhos é o `aeroparking.com.br`.

## Onde cada um está

Leitura do HTML servido em 27/10/2026, sem executar JavaScript (é o que o Google lê primeiro).

| Parceiro | Site | Plataforma | Quem fez | Link para o `movepark.co` hoje | Ação |
|---|---|---|---|---|---|
| Abbapark | `abbapark.com.br` | Wix | Movepark | "Desenvolvido por **Movepark**", para a home | trocar o endereço do link (nós) |
| Aeropark | `aeroparking.com.br` | PHP próprio | Grupo Bandeira Park | selo "Estacionamento parceiro Movepark", para a home | pedir a troca do endereço (mensagem 3) |
| Aerovalet | `aerovalet.com.br` | Wix | Movepark | "Desenvolvido por **Movepark**", para a home | trocar o endereço do link (nós) |
| BePark | `bepark.com.br` | Vite, repo `agenciafera/bepark-website` | Fera | selo "Estacionamento parceiro Movepark", para a home | trocar no código do repo (nós) |
| Garageinn | `garageinn.com.br` | WordPress 4.8 | Fera ("feito por F E R A") | nenhum | pedir o selo (mensagem 1); a Fera instala |
| Nationpark | `nationpark.com.br` | Wix | Movepark | "Feito por **Movepark**", para a home | trocar o endereço do link (nós) |
| Plenty Park | `plentypark.com.br` | WordPress com Elementor | não informado | nenhum | pedir o selo (mensagem 2) |
| Virapark | `virapark.com.br` | Wix | Movepark | "Desenvolvido por **Movepark**", para a home | trocar o endereço do link (nós) |

Seis dos oito já linkam o `movepark.co`, todos sem `nofollow` e todos para a home. Os links para
`<parceiro>.movepark.co` (o botão de reservar do white-label) não entram na conta: são outro host.

O crédito "Desenvolvido por / Feito por Movepark" fica como está, porque a Movepark fez esses
sites (é a regra das frases `desenvolvido` e `feito` em [selo-parceiro.md](../selo-parceiro.md)).
Só o endereço muda.

## Para onde cada link passa a apontar

A ficha do parceiro na Movepark. As UTMs dos créditos ficam as que já estavam, para o GA4 não
partir a série; as dos selos são as do gerador.

| Parceiro | Endereço novo |
|---|---|
| Abbapark | `https://movepark.co/estacionamentos/aeroporto-curitiba/abbapark?utm_source=abbapark&utm_medium=referral&utm_campaign=estacionamentos` |
| Aeropark | `https://movepark.co/estacionamentos/aeroporto-guarulhos/aeropark?utm_source=aeropark&utm_medium=selo&utm_campaign=parceiros` |
| Aerovalet | `https://movepark.co/estacionamentos/aeroporto-guarulhos/aerovalet?utm_source=aerovalet&utm_medium=referral&utm_campaign=estacionamentos` |
| BePark | `https://movepark.co/estacionamentos/aeroporto-confins/bepark?utm_source=bepark&utm_medium=selo&utm_campaign=parceiros` |
| Garageinn | `https://movepark.co/estacionamentos/aeroporto-viracopos/garageinn?utm_source=garageinn&utm_medium=selo&utm_campaign=parceiros` |
| Nationpark | `https://movepark.co/estacionamentos/aeroporto-curitiba/nationpark?utm_source=nationpark&utm_medium=referral&utm_campaign=estacionamentos` |
| Plenty Park | `https://movepark.co/estacionamentos/aeroporto-congonhas/plenty-park?utm_source=plenty-park&utm_medium=selo&utm_campaign=parceiros` |
| Virapark | `https://movepark.co/estacionamentos/aeroporto-viracopos/virapark?utm_source=virapark&utm_medium=referral&utm_campaign=estacionamentos` |

As oito fichas respondem 200 com o canônico sem parâmetro (conferido em 27/10/2026). A Aerovalet
tem três unidades (Guarulhos, Congonhas e Tietê) e um site só; o link vai para a de Guarulhos,
que é a praça prioritária do plano.

## Mensagens

Para o Diego enviar pelo WhatsApp. Os códigos saíram de `gerarSnippet` em 27/10/2026, na cor do
rodapé de cada site (Garageinn claro, Plenty Park escuro). Se o selo mudar, gere de novo em vez
de copiar daqui.

### 1. Garageinn (pedido do selo, a Fera instala)

> Oi, tudo bem? Aqui é o Diego, da Movepark.
>
> Posso colocar o selo "Estacionamento parceiro Movepark" no rodapé do site da Garageinn? Ele fica
> perto do "feito por Fera" e leva para a página da unidade de Viracopos na Movepark.
>
> Cada site de parceiro que linka a Movepark ajuda a página do aeroporto de Viracopos a subir no
> Google, e a Garageinn aparece nela. Como o site foi feito pela Fera, a gente mesmo instala, sem
> trabalho para vocês.

Código, para quem for instalar (rodapé claro):

```html
<!-- Selo Movepark -->
<a href="https://movepark.co/estacionamentos/aeroporto-viracopos/garageinn?utm_source=garageinn&utm_medium=selo&utm_campaign=parceiros" target="_blank" rel="noopener" title="Estacionamento parceiro Movepark"
   style="display:inline-flex;align-items:center;gap:8px;white-space:nowrap;font-weight:500;color:#29263F;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1;text-decoration:none;padding:7px 12px;border-radius:10px;border:1px solid #E6E6EA;background:#FFFFFF"><svg width="20" height="13" viewBox="0 0 113 73" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="flex:none"><path d="M31.3281 72.2007H58.5883L112.091 0H84.8308L31.3281 72.2007Z" fill="#DA455E"/><path d="M9.70703 72.2007H25.3143L78.7982 0H63.1909L9.70703 72.2007Z" fill="#A6DBDF"/><path d="M0 72.2007H3.92435L57.4083 0H53.4839L0 72.2007Z" fill="#29263F"/><path d="M94.6281 23.553L84.8229 0L77.0117 47.3174L94.6281 23.553Z" fill="#AE374B"/><path d="M112.088 0H84.8281V72.2007H112.088V0Z" fill="#29263F"/></svg><span><span style="opacity:.72">Estacionamento parceiro</span> <strong style="font-weight:700">Movepark</strong></span></a>
<!-- /Selo Movepark -->
```

### 2. Plenty Park (pedido do selo, em duas mensagens)

Primeira:

> Oi, tudo bem? Aqui é o Diego, da Movepark.
>
> Queria pedir para vocês colocarem o selo "Estacionamento parceiro Movepark" no rodapé do site da
> Plenty Park. Ele leva para a página da unidade de Congonhas na Movepark.
>
> Cada site de parceiro que linka a Movepark ajuda a página do aeroporto de Congonhas a subir no
> Google, e a Plenty aparece nela.
>
> O código vai na próxima mensagem, já na cor do rodapé de vocês. No WordPress com Elementor, é só
> abrir o rodapé, arrastar o widget "HTML" para onde quiser e colar o código. Se travar em alguma
> parte, me chama que eu ajudo.

Segunda (rodapé escuro):

```html
<!-- Selo Movepark -->
<a href="https://movepark.co/estacionamentos/aeroporto-congonhas/plenty-park?utm_source=plenty-park&utm_medium=selo&utm_campaign=parceiros" target="_blank" rel="noopener" title="Estacionamento parceiro Movepark"
   style="display:inline-flex;align-items:center;gap:8px;white-space:nowrap;font-weight:500;color:#FFFFFF;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1;text-decoration:none;padding:7px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.24);background:transparent"><svg width="20" height="13" viewBox="0 0 113 73" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="flex:none"><path d="M31.3281 72.2007H58.5883L112.091 0H84.8308L31.3281 72.2007Z" fill="#DA455E"/><path d="M9.70703 72.2007H25.3143L78.7982 0H63.1909L9.70703 72.2007Z" fill="#A6DBDF"/><path d="M0 72.2007H3.92435L57.4083 0H53.4839L0 72.2007Z" fill="#FFFFFF"/><path d="M94.6281 23.553L84.8229 0L77.0117 47.3174L94.6281 23.553Z" fill="#AE374B"/><path d="M112.088 0H84.8281V72.2007H112.088V0Z" fill="#FFFFFF"/></svg><span><span style="opacity:.72">Estacionamento parceiro</span> <strong style="font-weight:700">Movepark</strong></span></a>
<!-- /Selo Movepark -->
```

### 3. Aeropark (trocar o endereço do selo que já está lá)

> Oi, tudo bem? Aqui é o Diego, da Movepark.
>
> Obrigado por colocar o selo de parceiro no rodapé do site da Aeropark. Preciso de um ajuste
> pequeno: hoje o link vai para a página inicial da Movepark, e o certo é ir para a página da
> Aeropark na Movepark. Assim quem clica cai direto na unidade de vocês.
>
> No código do selo, troque só o endereço que está entre as aspas depois de `href=` por este:
>
> https://movepark.co/estacionamentos/aeroporto-guarulhos/aeropark?utm_source=aeropark&utm_medium=selo&utm_campaign=parceiros
>
> O resto do selo fica igual.

### 4. Sites Wix (só se o acesso ao editor estiver com o parceiro)

Abbapark, Aerovalet, Nationpark e Virapark foram feitos pela Movepark, então a troca deve ser
nossa: no editor do Wix, clicar no texto do rodapé, selecionar a palavra "Movepark", abrir o link
e colar o endereço novo da tabela acima. Se o acesso já tiver passado para o parceiro:

> Oi, tudo bem? Aqui é o Diego, da Movepark.
>
> Preciso de um ajuste pequeno no rodapé do site da [parceiro]: o link do "Desenvolvido por
> Movepark" hoje vai para a página inicial da Movepark, e o certo é ir para a página da
> [parceiro] na Movepark.
>
> No editor do Wix, clique no texto do rodapé, selecione a palavra "Movepark", clique no ícone de
> link e troque o endereço por este:
>
> [endereço novo da tabela]

Na Nationpark o crédito é "Feito por Movepark"; ajuste a frase da mensagem.
