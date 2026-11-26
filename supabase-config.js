/**
 * TravelMate AI — Supabase Default Configuration
 *
 * CRITICAL SECURITY NOTICE:
 * 1. Only public/publishable client credentials belong here (SUPABASE_URL and SUPABASE_ANON_KEY).
 * 2. NEVER include any service_role key, SMTP key, Brevo key, or Resend API key in this app or APK.
 */

window.TRAVELMATE_CONFIG = {
  // Supabase Project URL (no trailing slash, no /rest/v1)
  SUPABASE_URL: "https://riwowgzdfaurmwedjnbq.supabase.co",

  // Supabase Public Anon Key (Verified RLS & scoped to GoTrue email OTP auth)
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpd293Z3pkZmF1cm13ZWRqbmJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMjI1NDMsImV4cCI6MjEwODU5ODU0M30.F-CqWrEHhBNGVS2P-bKuub2hHWXjzrPJD2sQIiZNpGk",

  // Cooldown between OTP resends in seconds (prevents email spam / provider rate limits)
  OTP_RESEND_COOLDOWN_SECONDS: 60
};

// Purge any legacy saved-credentials from local storage so users cannot change or override them
(function () {
  try {
    localStorage.removeItem("travelmate_custom_supabase_url");
    localStorage.removeItem("travelmate_custom_supabase_anon_key");
  } catch (e) {
    // Ignore storage restrictions
  }
})();
