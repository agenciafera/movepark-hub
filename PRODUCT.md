# Product

## Register

brand

## Users

**Consumidor (cliente final):** Viajante brasileiro que precisa estacionar perto de um aeroporto ou destino. Usa o app no celular, frequentemente com pressa, em trânsito ou no estacionamento. O contexto é de estresse leve — o voo não espera. Quer reservar em minutos, com preço claro e sem surpresas na hora de retirar o carro.

**Parceiro (operador de estacionamento):** Dono ou gerente de um estacionamento parceiro. Usa o painel operator no desktop ou tablet para acompanhar reservas, configurar vagas e precificação, e consultar relatórios. Conforto médio com tecnologia; não quer ter que ligar pro suporte para tarefas rotineiras.

**Equipe Movepark (hub_admin):** Time interno que gerencia parceiros, destinos, FAQ, precificação e acompanha a operação. Power users; esperam eficiência e densidade de informação.

## Product Purpose

Marketplace de reserva de vagas de estacionamento, com foco inicial em aeroportos brasileiros. Conecta viajantes que querem garantir vaga com antecedência a estacionamentos parceiros certificados pela Movepark. Substitui dois sistemas legados (backoffice PHP e site público Next.js) em um único app React multi-tenant com três superfícies: site do consumidor, painel do operador e painel do gestor Movepark.

**Sucesso para o consumidor:** reservar uma vaga em menos de 2 minutos, chegar ao aeroporto sem estresse, e pagar exatamente o que estava escrito.

**Sucesso para o parceiro:** cheio de reservas confirmadas, sem disputas de preço e sem precisar gerenciar manualmente.

## Brand Personality

**Simples · Transparente · Eficiente**

Tom: direto, humano e confiante — sem juridiquês, sem superlativo vazio. A Movepark sabe o que faz e comunica isso sem precisar gritar. Nuance: a eficiência não é frieza; há calor humano no micro-copy e nas mensagens de estado (reserva confirmada, vaga garantida, boa viagem).

## References

**Nubank** — claro, direto, sem juridiquês, com personalidade forte mesmo sendo tecnologia financeira. Tecnológico mas humano. O tom de voz é o principal empréstimo: não o visual específico deles.

## Anti-references

- **Apps de mobilidade urbana (Uber/99):** Verde neon ou laranja saturado, visual frenético, muito ruído visual, gamificação excessiva. A Movepark não compete por atenção com notificações piscando.
- **Design excessivamente minimalista:** Muita brancura sem opinião, tipografia micro, sem personalidade. O silêncio total não é marca — é ausência de marca.
- **Legalese corporativo:** Bancos tradicionais com tom formal e distante, disclaimers no hero, paleta navy-e-dourado de institucional.

## Design Principles

1. **Clareza sem instrução.** O usuário está com pressa e não vai ler tutorial. Cada ação deve ser óbvia pela hierarquia visual, não por texto explicativo. Se precisou de tooltip para fazer sentido, repense o layout.

2. **Confiança antes do clique.** O consumidor está confiando à Movepark sua viagem ao aeroporto. Sinais de confiança (preço fixo, política clara, confirmação instantânea) chegam antes do CTA — não depois.

3. **Personalidade no detalhe, não no barulho.** A marca vive no micro-copy ("Vaga garantida. Boa viagem."), no estado de confirmação, na mensagem de erro que não culpa o usuário. Não em gradientes decorativos nem em eyebrows repetidos.

4. **Mobile-first, aeroporto-first.** O contexto de uso padrão é um viajante no celular a caminho do aeroporto. Um polegar, conexão 4G variável, luz de sol. Otimize para isso antes de otimizar para desktop.

5. **Uma marca, três superfícies.** O consumidor, o operador e o admin Movepark usam o mesmo sistema de design — mesmos tokens, mesma linguagem visual. O painel operator não pode parecer que foi terceirizado.

## Accessibility & Inclusion

**WCAG 2.1 AA.** Contraste mínimo 4.5:1 para corpo de texto, 3:1 para texto grande e componentes interativos. Navegação por teclado funcional em todos os fluxos críticos (busca → checkout → confirmação). Suporte a leitores de tela nos formulários e estados de feedback. `prefers-reduced-motion` respeitado em todas as animações.
