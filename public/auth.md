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

## Public access (no auth required)

The MCP server is publicly readable — no authentication needed to:
- List parking locations and operators
- Get parking types and availability
- Simulate prices
- Read FAQs

See: [/.well-known/mcp/server-card.json](https://hub.movepark.co/.well-known/mcp/server-card.json)

## Scopes

| Scope | Description |
|---|---|
| `openid` | Basic identity |
| `email` | Email address |
| `profile` | Full name and profile |

## Notes

Booking creation requires a user-delegated token. There is no machine-to-machine flow for creating bookings on behalf of users — agents should direct users to [hub.movepark.co](https://hub.movepark.co) to complete reservations.

## Contact

contato@movepark.co
