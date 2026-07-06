// nuxt-auth-utils module augmentation. Lives under shared/ (not app/) so it's
// visible to both the client and server TypeScript projects — server routes
// read session.user fields via requireUserSession/getUserSession.
declare module '#auth-utils' {
  interface User {
    id: string
    phone: string
    displayName: string
  }
}
