// Twilio Verify REST API, called directly via $fetch rather than Twilio's
// Node SDK — the SDK's Node-internals usage is a risk on Cloudflare's
// workerd runtime; a plain REST call is safer and matches how
// server/utils/composeAuth.ts already talks to an OAuth token endpoint.
//
// Twilio Verify owns code generation, expiry (~10 min), resend cooldown, and
// attempt-limits itself — the app never stores or compares an OTP code.

function authHeader(accountSid: string, authToken: string) {
  return `Basic ${btoa(`${accountSid}:${authToken}`)}`
}

export async function sendOtp(phone: string): Promise<void> {
  const config = useRuntimeConfig()
  await $fetch(
    `https://verify.twilio.com/v2/Services/${config.twilioVerifyServiceSid}/Verifications`,
    {
      method: 'POST',
      headers: { Authorization: authHeader(config.twilioAccountSid, config.twilioAuthToken) },
      body: new URLSearchParams({ To: phone, Channel: 'sms' })
    }
  )
}

// Returns true only if Twilio confirms the code as "approved".
export async function checkOtp(phone: string, code: string): Promise<boolean> {
  const config = useRuntimeConfig()
  const result = await $fetch<{ status: string }>(
    `https://verify.twilio.com/v2/Services/${config.twilioVerifyServiceSid}/VerificationCheck`,
    {
      method: 'POST',
      headers: { Authorization: authHeader(config.twilioAccountSid, config.twilioAuthToken) },
      body: new URLSearchParams({ To: phone, Code: code })
    }
  )
  return result.status === 'approved'
}
