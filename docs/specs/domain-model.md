# Domain Model — Move Park Hub

## Mapeamento legado → Hub

O sistema legado foi construído sobre um e-commerce genérico (Lovata Shopaholic).
Os conceitos abaixo devem ser **sempre** traduzidos ao trabalhar no Hub.

| Legado (Shopaholic) | Hub (domínio real) | Notas |
|---|---|---|
| whitelabel key | `company` (tenant/marca) | ex: virapark, garageinn, aeropark |
| category | `location` (unidade física) | ex: aeroporto-guarulhos, terminal-tietê |
| product | `parking_type` (tipo de vaga) | ex: coberta, descoberta, valet, premium |
| offer | instância de preço calculado | efêmera no legado; no Hub é persistida via motor |
| order | `booking` (reserva) | |
| cart | pré-reserva / sessão de checkout | |
| order_position | `booking_item` | 1 vaga + N serviços adicionais |
| coupon | `coupon` | |
| voucher (plugin movepark) | comprovante / QR de entrada | |

## Hierarquia de entidades

```
company (tenant / marca)
└── location (unidade física)
    └── location_parking_type  ←── company_parking_type (config da matriz)
        └── pricing_rule       (motor de cálculo — ver pricing-engine.md)
            ├── pricing_tier   (faixas de preço por duração)
            └── pricing_hourly_bracket (faixas por hora/minuto)
```

## Glossário

| Termo | Definição |
|---|---|
| **company** | Empresa/tenant. Opera N unidades. Detém a configuração-mãe de preços e serviços. |
| **location** | Unidade física (estacionamento em um endereço). Pertence a uma `company`. |
| **parking_type** | Catálogo global de tipos de vaga (`covered`, `uncovered`, `valet`, `premium`, `garage`, `motorcycle`). |
| **company_parking_type** | Habilita um `parking_type` para uma `company`, definindo `base_price` e `default_capacity` padrão. |
| **location_parking_type** | Instância do tipo de vaga em uma unidade específica. Tem sua própria capacidade e `pricing_rule`. |
| **pricing_rule** | Configuração do motor de cálculo vinculada a um `location_parking_type`. Define estratégia, tolerâncias e old price. |
| **add_on_service** | Serviço adicional (ex: lava-jato). Definido pela `company`, habilitado por `location`. |
| **booking** | Reserva efetivada. Cabeçalho com 1 vaga + N serviços adicionais. |
| **booking_item** | Linha da reserva: 1 item de estacionamento ou 1 serviço adicional, com preço snapshot. |
| **profiles** | Dados de domínio do usuário final. PK = FK para `auth.users` (Supabase Auth). |
| **vehicle** | Veículo cadastrado pelo usuário. Placa, modelo, cor. |

## Empresas e unidades mapeadas (seed atual)

| company.slug | location.slug |
|---|---|
| virapark | virapark |
| garageinn | aeroporto-viracopos |
| aeropark | aeroporto-guarulhos |
| abbapark | aeroporto-afonso-pena |
| nationpark | aeroporto-afonso-pena |
| aerovalet | aeroporto-guarulhos, terminal-rodoviario-tiete, aeroporto-congonhas |
| plenty | aeroporto-congonhas |

> Duas empresas diferentes podem operar na mesma localização física
> (ex: `abbapark` e `nationpark` ambas em Afonso Pena).
> No Hub, o `location.slug` é único **por empresa** (`unique(company_id, slug)`).
