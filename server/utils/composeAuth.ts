// Server-only Compose authentication: exchanges the client credentials for a
// short-lived access token (OAuth client-credentials grant) and caches it in
// memory until shortly before expiry. Never runs in the browser.

interface TokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
}

let cached: { token: string, expiresAt: number } | null = null

export async function getComposeAccessToken(): Promise<string> {
  const now = Date.now()
  // Re-use the cached token until 30s before it expires.
  if (cached && cached.expiresAt > now + 30_000) {
    return cached.token
  }

  const config = useRuntimeConfig()
  const clientId = config.composeClientId
  const clientSecret = config.composeClientSecret
  const tokenUrl = config.composeAuthTokenUrl

  if (!clientId || !clientSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Compose client credentials are not configured (COMPOSE_CLIENT_ID / COMPOSE_CLIENT_SECRET).'
    })
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret
  })
  // Compose requires the `graphql` scope to query. Only send it when configured
  // (and granted to the API app) — an ungranted scope yields `invalid_scope`.
  if (config.composeScope) {
    body.set('scope', config.composeScope)
  }

  const response = await $fetch<TokenResponse>(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })

  cached = {
    token: response.access_token,
    expiresAt: now + (response.expires_in ?? 3600) * 1000
  }
  return cached.token
}
