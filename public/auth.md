# Auth.md

Movepark is a parking reservation platform for airports and travel destinations in Brazil.

## Public access (no auth required)

The MCP server is publicly readable — no authentication needed to:
- List parking locations and operators
- Get parking types and availability
- Simulate prices
- Read FAQs

See: [/.well-known/mcp/server-card.json](https://movepark.com.br/.well-known/mcp/server-card.json)

## Protected resources

Booking creation requires a user account. The authorization server is Supabase Auth:

- **Authorization server**: `https://mgaigbezdalbyuqiofcf.supabase.co/auth/v1`
- **OIDC configuration**: `https://mgaigbezdalbyuqiofcf.supabase.co/auth/v1/.well-known/openid-configuration`

Consumer authentication methods:
- Passwordless OTP (email or WhatsApp)
- Google OAuth (`provider=google`)

There is currently no agent-to-agent OAuth flow for booking on behalf of users. Agents should direct users to [movepark.com.br](https://movepark.com.br) to complete reservations.

## Contact

contato@movepark.com.br
