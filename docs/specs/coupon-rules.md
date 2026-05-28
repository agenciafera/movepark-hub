# Coupon Rules — Regras de Validação de Cupons

## Modelo de dados

```
coupon
├── company_id       → empresa dona do cupom
├── code             → código único por empresa
├── discount_type    → 'percent' | 'fixed'
├── discount_value   → valor do desconto (% ou R$)
├── valid_from       → início da validade (nullable = já válido)
├── valid_until      → fim da validade (nullable = sem expiração)
├── max_uses         → limite total de usos (nullable = ilimitado)
├── times_used       → contador de usos já realizados
└── is_active        → toggle manual de ativação
```

---

## Algoritmo de validação

A validação ocorre em **duas etapas**: na simulação de preço e novamente na criação da reserva.

### Passo a passo

```
1. Código existe?
   → Não: erro "cupom inválido"

2. Pertence à mesma empresa da unidade solicitada?
   → Não: erro "cupom inválido" (não revela motivo por segurança)

3. is_active = true?
   → Não: erro "cupom inativo"

4. valid_from IS NULL OR valid_from <= now()?
   → Não: erro "cupom ainda não é válido"

5. valid_until IS NULL OR valid_until >= now()?
   → Não: erro "cupom expirado"

6. max_uses IS NULL OR times_used < max_uses?
   → Não: erro "cupom esgotado"

7. Usuário já usou este cupom?  (via booking_coupon)
   → Opcional: depende de regra por cupom (ver campo futuro per_user_limit)
   → Se sim: erro "cupom já utilizado"

→ Válido: retorna discount_type + discount_value
```

### Aplicação do desconto

```
if discount_type = 'percent':
    discount_applied = total_amount × (discount_value / 100)
    
if discount_type = 'fixed':
    discount_applied = min(discount_value, total_amount)  -- não pode ser negativo

total_final = total_amount - discount_applied
```

O `discount_applied` é salvo em `booking_coupon.discount_applied` como **snapshot**
no momento da reserva, independente de mudanças futuras no cupom.

---

## Incremento do contador

- `times_used` é incrementado **somente após pagamento confirmado** (não na criação da reserva)
- Se a reserva for cancelada antes do pagamento: não incrementa
- Se cancelada após pagamento: **não** decrementa (uso já foi contabilizado)

---

## Campos futuros (não no MVP)

| Campo | Descrição |
|---|---|
| `per_user_limit` | Limite de usos por usuário (ex: 1 = uso único por pessoa) |
| `parking_type_ids[]` | Restringir cupom a tipos de vaga específicos |
| `min_days` | Permanência mínima para o cupom ser válido |
| `min_amount` | Valor mínimo da reserva |

---

## Observações do legado

- No legado existia o conceito de **CouponGroup** (grupo com validade) + **Coupon** (código individual).
  No Hub simplificamos para um único modelo `coupon` com os campos de validade direto.
- O legado permitia vincular um cupom a um `user_id` específico (cupom nominativo).
  No Hub isso pode ser implementado via `booking_coupon` existente ou campo `profile_id` futuro na `coupon`.
- Cupons podiam ter `max_usage_per_user` diferente do `max_usage` global.
  No MVP, apenas `max_uses` global está implementado.
