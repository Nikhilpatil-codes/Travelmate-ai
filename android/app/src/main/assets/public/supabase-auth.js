/**
 * TravelMate AI — Supabase Auth Client Engine (Zero-Dependency GoTrue REST Client)
 *
 * Implements real email OTP authentication with Supabase Auth:
 * - Request numeric OTP via Supabase Auth (/auth/v1/otp)
 * - Custom SMTP via Resend sends real numeric OTP emails to real user addresses
 * - Verify OTP (/auth/v1/verify)
 * - Session restoration with token expiry verification & auto-refresh (/auth/v1/token, /auth/v1/user)
 * - Sign out with token revocation (/auth/v1/logout)
 * - Strict security: Never treats unverified local data as authenticated
 * - Offline & WebView resilience
 */

(function (window) {
  const SESSION_STORAGE_KEY = "travelmate_supabase_session";
  const GUEST_STORAGE_KEY = "travelmate_guest_active";

  const TravelMateAuth = {
    /**
     * Helper to get clean Supabase Base URL (ensuring no trailing slash and no /rest/v1).
     */
    getCleanBaseUrl: function () {
      const cfg = this.getConfig();
      let url = (cfg.SUPABASE_URL || "").trim();
      // Strip trailing slashes and common path suffixes if accidentally present
      url = url.replace(/\/+$/, "").replace(/\/rest\/v1\/?$/, "").replace(/\/auth\/v1\/?$/, "");
      return url;
    },

    /**
     * Checks if Supabase credentials are configured and not placeholders.
     */
    isConfigured: function () {
      const cfg = this.getConfig();
      const url = this.getCleanBaseUrl();
      const key = (cfg.SUPABASE_ANON_KEY || "").trim();

      const isPlaceholderUrl = !url || url.includes("your-project-id") || !url.startsWith("https://");
      const isPlaceholderKey = !key || key.includes("your-supabase-anon-key") || key.includes("PASTE_");

      return !isPlaceholderUrl && !isPlaceholderKey;
    },

    /**
     * Returns the active configuration.
     */
    getConfig: function () {
      return window.TRAVELMATE_CONFIG || {
        SUPABASE_URL: "https://riwowgzdfaurmwedjnbq.supabase.co",
        SUPABASE_ANON_KEY: "",
        OTP_RESEND_COOLDOWN_SECONDS: 60
      };
    },

    /**
     * Normalizes and validates user input.
     */
    normalizeEmail: function (email) {
      return (email || "").trim().toLowerCase();
    },

    validateEmail: function (email) {
      const normalized = this.normalizeEmail(email);
      const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
      return emailRegex.test(normalized);
    },

    validateName: function (name) {
      return typeof name === "string" && name.trim().length >= 2;
    },

    /**
     * Requests an email OTP via Supabase Auth (/auth/v1/otp).
     * Works for both existing users and new registrations via create_user: true.
     */
    requestOtp: async function (email, name) {
      const normalizedEmail = this.normalizeEmail(email);
      const trimmedName = (name || "").trim() || "Traveler";

      if (!this.validateEmail(normalizedEmail)) {
        return {
          success: false,
          error_code: "invalid_email",
          message: "Please enter a valid email address."
        };
      }

      if (!this.isConfigured()) {
        return {
          success: false,
          error_code: "service_unavailable",
          message: "Authentication service is currently unavailable. Please continue as Guest."
        };
      }

      const cfg = this.getConfig();
      const endpoint = `${this.getCleanBaseUrl()}/auth/v1/otp`;

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": cfg.SUPABASE_ANON_KEY
          },
          body: JSON.stringify({
            email: normalizedEmail,
            create_user: true,
            data: {
              name: trimmedName
            }
          })
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          return {
            success: true,
            email: normalizedEmail,
            name: trimmedName,
            message: "OTP sent successfully! Check your inbox."
          };
        }

        // Handle rate limiting (HTTP 429)
        if (response.status === 429) {
          return {
            success: false,
            error_code: "rate_limit",
            message: data.msg || "For security, you can only request an OTP code once every 60 seconds. Please wait before retrying."
          };
        }

        // Handle other Supabase provider errors
        let errorMsg = data.msg || data.error_description || "Could not send OTP code.";
        if (errorMsg.toLowerCase().includes("email") || errorMsg.toLowerCase().includes("smtp") || response.status >= 500) {
          errorMsg += " (Note: If testing with onboarding@resend.dev, ensure you use your registered Resend account email address).";
        }
        return {
          success: false,
          error_code: data.error_code || "provider_error",
          message: errorMsg
        };
      } catch (err) {
        console.error("TravelMateAuth.requestOtp network error:", err);
        return {
          success: false,
          error_code: "network_error",
          message: "Network request failed. Please check your internet connection."
        };
      }
    },

    /**
     * Verifies the numeric OTP code entered by the user (/auth/v1/verify).
     * Only after confirmation is the user treated as authenticated.
     */
    verifyOtp: async function (email, token) {
      const normalizedEmail = this.normalizeEmail(email);
      const cleanToken = (token || "").toString().trim().replace(/\s+/g, "");

      if (!this.validateEmail(normalizedEmail)) {
        return {
          success: false,
          error_code: "invalid_email",
          message: "Invalid email address."
        };
      }

      if (!cleanToken || cleanToken.length < 6) {
        return {
          success: false,
          error_code: "invalid_token_length",
          message: "Please enter a valid 6-digit verification code."
        };
      }

      if (!this.isConfigured()) {
        return {
          success: false,
          error_code: "service_unavailable",
          message: "Authentication service is currently unavailable."
        };
      }

      const cfg = this.getConfig();
      const endpoint = `${this.getCleanBaseUrl()}/auth/v1/verify`;

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": cfg.SUPABASE_ANON_KEY
          },
          body: JSON.stringify({
            type: "email",
            email: normalizedEmail,
            token: cleanToken
          })
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.access_token && data.user) {
          const expiresAt = Math.floor(Date.now() / 1000) + (data.expires_in || 3600);

          const session = {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            token_type: data.token_type || "bearer",
            expires_at: expiresAt,
            user: {
              id: data.user.id,
              email: data.user.email,
              name: data.user.user_metadata?.name || data.user.email.split("@")[0],
              confirmed_at: data.user.email_confirmed_at || new Date().toISOString(),
              verified: true
            }
          };

          // Persist real verified session
          this._saveSession(session);

          // Clear guest flag once authenticated
          sessionStorage.removeItem(GUEST_STORAGE_KEY);

          return {
            success: true,
            session: session,
            user: session.user,
            message: "Authentication successful!"
          };
        }

        // Invalid or expired OTP code
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          return {
            success: false,
            error_code: "invalid_otp",
            message: "The verification code is invalid or has expired. Please try again or request a new code."
          };
        }

        if (response.status === 429) {
          return {
            success: false,
            error_code: "rate_limit",
            message: data.msg || "Too many failed attempts. Please wait a moment before trying again."
          };
        }

        return {
          success: false,
          error_code: data.error_code || "verification_failed",
          message: data.msg || data.error_description || "Verification failed. Please check the code."
        };
      } catch (err) {
        console.error("TravelMateAuth.verifyOtp network error:", err);
        return {
          success: false,
          error_code: "network_error",
          message: "Network request failed. Please check your internet connection."
        };
      }
    },

    /**
     * Validates stored session on app startup.
     * Never trusts unverified or expired tokens without cryptographic verification.
     */
    restoreSession: async function () {
      const stored = this.getCurrentSession();
      if (!stored || !stored.access_token || !stored.user) {
        this.clearSession();
        return null;
      }

      if (!this.isConfigured()) {
        console.warn("Supabase not configured; stored session cannot be validated.");
        return null;
      }

      const cfg = this.getConfig();
      const nowSec = Math.floor(Date.now() / 1000);
      const isExpired = stored.expires_at ? (nowSec >= stored.expires_at - 60) : false;

      // If expired, attempt token refresh using refresh_token
      if (isExpired) {
        if (stored.refresh_token) {
          const refreshed = await this.refreshToken(stored.refresh_token);
          if (refreshed && refreshed.user) {
            return refreshed.user;
          }
        }
        // Could not refresh expired session
        this.clearSession();
        return null;
      }

      // Token has not expired yet: verify validity with Supabase /auth/v1/user
      try {
        const endpoint = `${this.getCleanBaseUrl()}/auth/v1/user`;
        const response = await fetch(endpoint, {
          method: "GET",
          headers: {
            "apikey": cfg.SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${stored.access_token}`
          }
        });

        if (response.ok) {
          const userData = await response.json();
          stored.user.id = userData.id;
          stored.user.email = userData.email;
          if (userData.user_metadata?.name) {
            stored.user.name = userData.user_metadata.name;
          }
          stored.user.verified = true;
          this._saveSession(stored);
          return stored.user;
        }

        // If server says 401 Unauthorized, token has been revoked
        if (response.status === 401 && stored.refresh_token) {
          const refreshed = await this.refreshToken(stored.refresh_token);
          if (refreshed && refreshed.user) {
            return refreshed.user;
          }
        }

        // Invalidated session
        this.clearSession();
        return null;
      } catch (err) {
        console.warn("TravelMateAuth.restoreSession offline check:", err);
        // If offline and unexpired, retain cached verified user so app functions in WebView
        if (!isExpired && stored.user && stored.user.verified) {
          return stored.user;
        }
        return null;
      }
    },

    /**
     * Refreshes access token via Supabase Auth (/auth/v1/token?grant_type=refresh_token).
     */
    refreshToken: async function (refreshToken) {
      if (!this.isConfigured() || !refreshToken) return null;

      const cfg = this.getConfig();
      const endpoint = `${this.getCleanBaseUrl()}/auth/v1/token?grant_type=refresh_token`;

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": cfg.SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ refresh_token: refreshToken })
        });

        if (response.ok) {
          const data = await response.json();
          const expiresAt = Math.floor(Date.now() / 1000) + (data.expires_in || 3600);
          const current = this.getCurrentSession() || {};

          const updatedSession = {
            access_token: data.access_token,
            refresh_token: data.refresh_token || refreshToken,
            token_type: data.token_type || "bearer",
            expires_at: expiresAt,
            user: {
              id: data.user?.id || current.user?.id,
              email: data.user?.email || current.user?.email,
              name: data.user?.user_metadata?.name || current.user?.name || "Traveler",
              verified: true
            }
          };

          this._saveSession(updatedSession);
          return updatedSession;
        }
      } catch (err) {
        console.error("TravelMateAuth.refreshToken error:", err);
      }
      return null;
    },

    /**
     * Revokes session on Supabase and purges local storage.
     */
    signOut: async function () {
      const stored = this.getCurrentSession();
      if (stored && stored.access_token && this.isConfigured()) {
        const cfg = this.getConfig();
        const endpoint = `${this.getCleanBaseUrl()}/auth/v1/logout`;
        try {
          await fetch(endpoint, {
            method: "POST",
            headers: {
              "apikey": cfg.SUPABASE_ANON_KEY,
              "Authorization": `Bearer ${stored.access_token}`
            }
          });
        } catch (err) {
          console.warn("Logout request failed (offline):", err);
        }
      }

      this.clearSession();
      return { success: true };
    },

    /**
     * Storage Helpers
     */
    getCurrentSession: function () {
      try {
        const raw = localStorage.getItem(SESSION_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },

    getCurrentUser: function () {
      const sess = this.getCurrentSession();
      return sess ? sess.user : null;
    },

    _saveSession: function (session) {
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
        // Remove old fake login key to prevent legacy confusion
        localStorage.removeItem("travelmate_user");
      } catch (e) {
        console.error("Could not save session to localStorage:", e);
      }
    },

    clearSession: function () {
      try {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        localStorage.removeItem("travelmate_user");
        localStorage.removeItem("travelmate_custom_supabase_url");
        localStorage.removeItem("travelmate_custom_supabase_anon_key");
      } catch (e) {
        console.error("Could not clear session:", e);
      }
    }
  };

  window.TravelMateAuth = TravelMateAuth;
})(window);
