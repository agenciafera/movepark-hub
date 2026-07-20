# Auth.md

Movepark is a parking reservation platform for airports and travel destinations in Brazil.

## Agent Registration

Agents can authenticate with Movepark using OAuth 2.0 via Supabase Auth.

```agent_auth
register_uri: https://mgaigbezdalbyuqiofcf.supabase.co/auth/v1/authorize
identity_types: [oauth2, email_otp]
credential_types: [bearer_token]
claim_uri: https://mgaigbezdalbyuqiofcf.supabase.co/auth/v1/token
revocation_uri: https://mgaigbezdalbyuqiofcf.supabase.co/auth/v1/logout
```

## Authorization server

- **Issuer**: `https://mgaigbezdalbyuqiofcf.supabase.co/auth/v1`
- **Authorization endpoint**: `https://mgaigbezdalbyuqiofcf.supabase.co/auth/v1/authorize`
- **Token endpoint**: `https://mgaigbezdalbyuqiofcf.supabase.co/auth/v1/token`
- **JWKS**: `https://mgaigbezdalbyuqiofcf.supabase.co/auth/v1/.well-known/jwks.json`
- **OIDC discovery**: `https://mgaigbezdalbyuqiofcf.supabase.co/auth/v1/.well-known/openid-configuration`

## Surfaces

| Surface | Endpoint | Auth | Card |
|---|---|---|---|
| Consumer (discovery) | `https://mcp.movepark.co` | none | [server-card.json](https://hub.movepark.co/.well-known/mcp/server-card.json) |
| Partner (tenant-scoped) | `https://mcp.movepark.co/partner` | API key `mp_` + scopes | [partner-card.json](https://hub.movepark.co/.well-known/mcp/partner-card.json) |
| Customer (book on behalf) | `https://mcp.movepark.co/customer` | user OTP login | [customer-card.json](https://hub.movepark.co/.well-known/mcp/customer-card.json) |

## Public access (no auth required)

The consumer surface is publicly readable, with no authentication needed to:
- List parking locations and operators
- Get parking types and availability
- Simulate prices
- Read FAQs and destinations

## Booking on behalf of a user

The customer surface (`/customer`) lets an agent reserve for an end user. The user logs in with a
one-time code, so the agent never handles a password:

1. `request_login_otp({ identifier, channel })` sends a code by WhatsApp or email.
2. `verify_login_otp({ identifier, channel, code })` returns `access_token` and `refresh_token`.
3. Send `Authorization: Bearer <access_token>` on the booking tools (`create_booking`,
   `set_booking_customer`, `add_vehicle`, `set_booking_vehicle`, `get_booking_status`,
   `cancel_booking`). Row-level security scopes every call to that user.

**Payment is never handled by the agent.** The user pays on the web checkout. Generating the checkout
link (`create_checkout_link`) additionally requires a trusted-agent API key (`X-API-Key: mp_…`) with
the `checkout:link` scope, because the link authenticates whoever opens it.

## Scopes

| Scope | Description |
|---|---|
| `openid` | Basic identity |
| `email` | Email address |
| `profile` | Full name and profile |

## Notes

Booking creation requires a user-delegated token. Get one through the OTP login on the customer
surface (see above); there is no machine-to-machine flow that bypasses the user. Payment always
happens on the web checkout, not through the API.

## Contact

contato@movepark.co
