# Plano de rollback: corte de domínio para movepark.co

**Status:** escrito em 18/08/2026, no mesmo dia do corte · **Fonte da verdade:** Cloudflare (zona `movepark.co`, conta Financeiro@fera.ag) e este documento

## O que este plano cobre

O corte de domínio (18/08/2026) tirou o WordPress do apex `movepark.co` e colocou o Hub no lugar, via **Custom Domain** do Cloudflare Workers (ver [seo-indexacao.md](./seo-indexacao.md)). Este documento é o passo a passo para desfazer **só essa troca de origem**, caso o corte precise ser revertido nas primeiras horas ou dias. Não cobre rollback de conteúdo (posts, preços, RLS): esses são reversíveis por commit/migration normal, e não têm relação com DNS.

## O que existia antes, exatamente

Conferido na própria API do Cloudflare (audit log da zona, evento `dns.record` tipo `delete`, `2026-08-18T12:37:40Z`, ator `services@orbitaldev.com.br` via UI):

```
Tipo:      A
Nome:      movepark.co (apex)
Conteúdo:  200.150.200.209
Proxy:     Ligado (nuvem laranja)
TTL:       Auto
Comentário: "Jelastic Production Website Wordpress"
```

Esse registro foi apagado às 12:37:40 UTC de 18/08/2026, 16 segundos antes de o Cloudflare começar a criar o certificate pack e o registro `AAAA movepark.co → 100::` que hoje representa o **Custom Domain** do worker `movepark-hub` (registro gerenciado automaticamente pelo Cloudflare, `read_only: true`, não editável direto por DNS).

**O servidor de origem do WordPress segue respondendo agora**, testado em 18/08/2026 (`curl -H "Host: movepark.co" http://200.150.200.209/` devolve `200` com o título "Sistema de Reserva para Estacionamentos - Movepark"). O acesso SSH à mesma infraestrutura Jelastic/SaveInCloud está documentado à parte (memória `project-wordpress-legacy-access`).

## Passo a passo para reverter o apex

Alguém com acesso ao dashboard do Cloudflare (conta Financeiro@fera.ag) precisa fazer isto — nenhuma ferramenta que rodei tem permissão de escrita em DNS ou Custom Domain, só leitura:

1. **Cloudflare Dashboard → Workers & Pages → `movepark-hub` → Settings → Domains & Routes.**
2. Remover o Custom Domain `movepark.co`. Isso apaga sozinho o registro `AAAA movepark.co → 100::` e o certificate pack que o acompanha (o mesmo mecanismo que os criou quando o domínio foi anexado).
3. **DNS → Add record**, recriando exatamente o que existia:
   - Tipo: `A`
   - Nome: `movepark.co` (ou `@`)
   - Conteúdo: `200.150.200.209`
   - Proxy status: **Proxied** (nuvem laranja)
   - TTL: Auto
4. Confirmar em `https://movepark.co/` que o WordPress voltou a responder.

**Sobre TTL e propagação:** o registro é proxiado pelo Cloudflare (nuvem laranja) tanto antes quanto depois da troca, então isso **não é um rollback de DNS tradicional** com espera de 24 a 48h. O que muda é a origem que o Cloudflare consulta atrás do proxy, e essa troca vale no edge da Cloudflare em segundos a poucos minutos, não em horas. TTL baixo aqui é irrelevante — o gargalo seria só se algum dia o registro deixasse de ser proxiado.

O `www.movepark.co` não precisa de ação: ele é um `CNAME` para o apex desde antes do corte (ver commit `a6e48f24`, "www.movepark.co devolve 301 para o apex"), então volta a seguir a origem do apex sozinho.

## Nada é apagado no dia do corte

- O WordPress **não é desligado nem tem o banco apagado**. A tarefa "Congelar o WordPress" ([docs/specs/README.md](./README.md), checklist de migração) faz só backup: dump do banco + backup dos uploads, sem tocar no servidor em produção.
- A hospedagem do WordPress (Jelastic/SaveInCloud) precisa continuar **ativa e paga por pelo menos 30 dias** a partir do corte (18/08/2026 → 17/09/2026), mesmo com o registro DNS já apontando para o Hub. Cancelar a hospedagem antes desse prazo destrói a origem que este plano depende para reverter.
- Nenhum dado do Hub (bookings, companies, migrations) é revertido por este plano — ele reverte só a origem HTTP do domínio, não o banco do Supabase (que tem PITR próprio, ver a pendência de confirmação em `docs/specs/seo-indexacao.md`).

## Quando revisar este documento

- Se a hospedagem WordPress for desligada antes dos 30 dias, o passo 3 deixa de ser possível e este plano precisa ser reescrito (ou o registro de origem, guardado em outro lugar).
- Se o Custom Domain for reconfigurado (por exemplo, trocar de zona ou de worker), refaça a captura do estado "antes" pela audit log da zona, do mesmo jeito que este documento foi escrito.
