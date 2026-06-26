// Allow importing .gql documents as raw query strings via Vite's `?raw` suffix.
// The same .gql files double as the codegen source for nuxt-graphql-client.
declare module '*.gql?raw' {
  const content: string
  export default content
}
