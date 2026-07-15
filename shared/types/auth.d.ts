// nuxt-auth-utils module augmentation. Lives under shared/ (not app/) so it's
// visible to both the client and server TypeScript projects — server routes
// read session.user fields via requireUserSession/getUserSession.
declare module '#auth-utils' {
  interface User {
    id: string
    // Umbraco Members key (GUID) when mirrored, else the local user id.
    key: string
    // The login-only flow has no display name, so this is the E.164 phone.
    username: string
  }
}
