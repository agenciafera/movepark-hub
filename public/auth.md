# Movepark — Agent Authentication

Movepark is a parking reservation platform for airports and travel destinations in Brazil.

## Public access (no auth required)

The MCP server is publicly readable — no authentication needed to:
- List parking locations and operators
- Get parking types and availability
- Simulate prices
- Read FAQs

See: [/.well-known/mcp/server-card.json](https://movepark.com.br/.well-known/mcp/server-card.json)

## Authenticated actions

Booking creation requires a user account token. Consumer authentication is done via:
- Passwordless OTP (email or WhatsApp)
- Google OAuth

There is currently no agent-to-agent OAuth flow for booking on behalf of users. Agents should direct users to [movepark.com.br](https://movepark.com.br) to complete reservations.

## Contact

For API access or integration inquiries: contato@movepark.com.br
