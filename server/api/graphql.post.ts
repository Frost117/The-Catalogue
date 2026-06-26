// Same-origin GraphQL gateway. The frontend posts { query, variables } here;
// this route attaches the Compose Bearer token server-side and forwards the
// request upstream, keeping credentials out of the browser and avoiding CORS.

interface GraphqlBody {
  query: string
  variables?: Record<string, unknown>
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const upstream = config.composeGraphqlUrl

  if (!upstream) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Compose GraphQL URL is not configured (GQL_HOST).'
    })
  }

  const body = await readBody<GraphqlBody>(event)
  if (!body?.query) {
    throw createError({ statusCode: 400, statusMessage: 'Missing GraphQL query.' })
  }

  const token = await getComposeAccessToken()

  try {
    return await $fetch(upstream, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: { query: body.query, variables: body.variables ?? {} }
    })
  } catch (err: unknown) {
    // Surface the upstream status/message rather than a generic 500.
    const e = err as { status?: number, statusCode?: number, statusMessage?: string, message?: string }
    const status = e.status ?? e.statusCode ?? 502
    throw createError({
      statusCode: status,
      statusMessage: `Compose GraphQL request failed (${status}): ${e.statusMessage || e.message || 'unknown error'}`
    })
  }
})
