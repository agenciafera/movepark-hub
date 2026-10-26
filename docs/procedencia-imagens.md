# Procedência das imagens geradas

Registro de onde veio cada imagem que a Movepark publica e que **não foi fotografada por nós**.
Existe para duas coisas: cumprir a atribuição que as licenças pedem, e deixar rastreável o que
serviu de entrada para cada geração, em vez de essa informação viver só na cabeça de quem fez.

**Atualize este arquivo no mesmo commit que sobe uma imagem nova.** Imagem publicada sem linha
aqui é dívida silenciosa: seis meses depois ninguém sabe se podia usar.

## Heroes de destino

Todas geradas com **Nano Banana 2** (Higgsfield), usando a foto abaixo como referência visual. O
prompt manda **preservar a arquitetura, as proporções e a sinalização** do terminal, e refazer só a
luz para o golden hour, que é a linguagem das heroes do site. O nome do lugar, o enquadramento e o
ângulo vêm da foto original; a luz, o céu e a ausência de pessoas, não.

| Destino | Autor | Licença | Foto original |
|---|---|---|---|
| CGR · Campo Grande | Jcornelius | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Aeroporto_Internacional_de_Campo_Grande_MS,_20-07-2025.jpg) |
| FLN · Florianópolis | Ajmcbarreto | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Aeroporto_Hercilio_Luz_-_Florian%C3%B3polis_-_02.jpg) |
| FOR · Fortaleza | Alexandro Dias | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Vista_do_Aeroporto_Internacional_de_Fortaleza_Pinto_Martins.jpg) |
| GYN · Goiânia | Fronteira | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Aeroporto_Internacional_Santa_Genoveva_%C3%A0_noite,_Goi%C3%A2nia,_abril_de_2025_(1).jpg) |
| SSA · Salvador | Mila Cordeiro / AGECOM | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [Commons](https://commons.wikimedia.org/wiki/File:Fachada_Aeroporto_de_Salvador2.jpg) |
| THE · Teresina | Alexandro Dias | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Vista_A%C3%A9rea_do_Aeroporto_de_Teresina_Senador_Petr%C3%B4nio_Portella.jpg) |
| VIX · Vitória | Kaesza | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Aeroporto_da_cidade_de_Vit%C3%B3ria.jpg) |

## Imagens de card (og:image) sem fonte externa

As quatro fallbacks de `og:image` (`marca`, `destinos`, `precos`, `conteudo`) foram geradas **só a
partir de texto**, sem foto de referência. Não têm origem de terceiro e não pedem atribuição. Ver
[`src/lib/ogImage.tsx`](../src/lib/ogImage.tsx).

## Fundos de reel do Instagram

Gerados **só a partir de texto** (sem foto de referência) no Higgsfield, modelo **Nano Banana 2**,
em 9:16, para o reel de preço de Confins (Conteúdo 49). Não têm origem de terceiro e não pedem
atribuição. Antes de entrar no reel, emblemas de marca dos carros e da van, placas e um letreiro
de sinalização com texto inventado foram desfocados. Não mostram nenhum pátio real: são cena
genérica de aeroporto e de pátio com van.

| Arquivo | Job no Higgsfield | Gerado em |
|---|---|---|
| [`preco-estacionamento-aeroporto-confins-terminal.webp`](social/conteudo-49-reels-confins/preco/fotos/preco-estacionamento-aeroporto-confins-terminal.webp) | `8c68e235-ca5f-4456-8cbd-b07eaa15346c` | 23/10/2026 |
| [`preco-estacionamento-aeroporto-confins-oficial-a-pe.webp`](social/conteudo-49-reels-confins/preco/fotos/preco-estacionamento-aeroporto-confins-oficial-a-pe.webp) | `cc0ae1cb-8ad6-4dbd-8a8b-1d3a6c517e06` | 23/10/2026 |
| [`preco-estacionamento-aeroporto-confins-particular-van.webp`](social/conteudo-49-reels-confins/preco/fotos/preco-estacionamento-aeroporto-confins-particular-van.webp) | `4b18bbef-31ab-4065-86f9-fee2d542563d` | 23/10/2026 |

## Ponto em aberto: o ShareAlike

Seis das sete fontes são **CC BY-SA**, que pede atribuição **e** ShareAlike: se a imagem publicada
for considerada obra derivada, ela teria que sair sob a mesma licença, e qualquer um poderia reusá-la.
Este arquivo resolve a atribuição; **não resolve o ShareAlike**.

Se a exclusividade sobre essas heroes importar, as saídas são refazê-las a partir de foto contratada,
ou consultar um advogado. A questão é real porque o prompt pede para **preservar** a composição, que é
justamente a escolha protegida do fotógrafo, e não para descaracterizá-la.

**Para a próxima leva, prefira CC0 e domínio público**, que não impõem condição nenhuma e fazem essa
seção deixar de existir. O acervo tem: as duas fotos CC0 do terminal antigo de Goiânia apareceram na
mesma busca que trouxe a atual, e só foram descartadas porque mostram um prédio que não existe mais.
