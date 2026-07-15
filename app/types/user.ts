export interface AuthUser {
  id: string
  // Umbraco Members key (GUID) when mirrored, else the local user id.
  key: string
  // The login-only flow has no display name, so this is the E.164 phone.
  username: string
}
