// Adapter over the Umbraco Members/Management API — NOT YET CONFIGURED. No
// base URL, credentials, or request/response shape exist yet for this
// system (it is separate from the read-only Compose GraphQL used for shows;
// see server/utils/composeAuth.ts).
//
// Until UMBRACO_MEMBERS_BASE_URL is set, this runs in stub mode: it mints a
// local id and returns immediately, so signup/login work end-to-end with D1
// as the sole source of truth for identity. When the real API is available,
// fill in the branch below; nothing outside this file needs to change.

export interface Member {
  id: string
  phone: string
  displayName: string
}

export interface CreateMemberInput {
  phone: string
  displayName: string
}

export async function createMember(input: CreateMemberInput): Promise<Member> {
  const config = useRuntimeConfig()
  if (config.umbracoMembersBaseUrl) {
    // TODO: real call once Umbraco Members API docs/credentials exist.
    throw createError({ statusCode: 501, statusMessage: 'Real Umbraco Members API not implemented yet.' })
  }
  return { id: crypto.randomUUID(), phone: input.phone, displayName: input.displayName }
}
