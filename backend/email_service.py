"""
TravelMate AI — Resend Email Service for Development & Testing.
Provides server-side email dispatching via Resend's REST API:
- Uses RESEND_API_KEY from environment variables (never exposed to client/Git)
- Uses 'onboarding@resend.dev' as sender address for domain-free development
- Standard library implementation (zero extra dependencies required)
- Handles Resend testing domain limitations gracefully
"""

import os
import json
import urllib.request
import urllib.error
from typing import Dict, Any, Optional, List


def load_env_file_if_present():
    """
    Lightweight fallback parser for local .env files without requiring python-dotenv.
    Searches both backend/.env and root .env.
    """
    candidates = [
        os.path.join(os.path.dirname(__file__), ".env"),
        os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    ]
    for env_path in candidates:
        if os.path.isfile(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            key, val = line.split("=", 1)
                            key = key.strip()
                            val = val.strip().strip('"').strip("'")
                            if key and key not in os.environ:
                                os.environ[key] = val
            except Exception:
                pass


# Initialize env vars on module import
load_env_file_if_present()


def get_resend_api_key() -> Optional[str]:
    """Retrieve Resend API Key from server environment."""
    key = os.environ.get("RESEND_API_KEY", "").strip()
    return key if key and not key.startswith("re_your_") else None


def get_sender_address() -> str:
    """
    Get configured sender address.
    Defaults to onboarding@resend.dev for domain-free development.
    """
    sender = os.environ.get("RESEND_FROM_EMAIL", "").strip()
    if not sender:
        sender = os.environ.get("SMTP_SENDER_EMAIL", "").strip()
    if not sender:
        sender = "TravelMate AI <onboarding@resend.dev>"
    elif "@" in sender and "<" not in sender:
        sender = f"TravelMate AI <{sender}>"
    return sender


def get_email_service_status() -> Dict[str, Any]:
    """Return status of server-side email service for health telemetry."""
    api_key = get_resend_api_key()
    sender = get_sender_address()
    is_configured = bool(api_key)
    is_dev_sender = "onboarding@resend.dev" in sender.lower()

    return {
        "resend_configured": is_configured,
        "sender_address": sender,
        "development_mode": is_dev_sender,
        "custom_domain_required": False if is_dev_sender else True,
        "dev_notice": (
            "Development mode active with 'onboarding@resend.dev'. "
            "Resend allows delivering test emails ONLY to your registered Resend account email. "
            "No custom domain purchase is required."
        ) if is_dev_sender else "Custom domain sender configured."
    }


def send_email_via_resend(
    to_email: str,
    subject: str,
    html_content: str,
    from_email: Optional[str] = None
) -> Dict[str, Any]:
    """
    Send an email via Resend's REST API (https://api.resend.com/emails).
    
    Requirements:
    - RESEND_API_KEY in environment
    - For onboarding@resend.dev: to_email must be the registered Resend account email
    """
    api_key = get_resend_api_key()
    if not api_key:
        return {
            "success": False,
            "error_code": "missing_api_key",
            "message": (
                "RESEND_API_KEY is not configured on the server. "
                "Please set RESEND_API_KEY in your server environment or .env file."
            )
        }

    sender = from_email or get_sender_address()

    payload = {
        "from": sender,
        "to": [to_email.strip()],
        "subject": subject,
        "html": html_content
    }

    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=req_data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "TravelMateAI-Backend/1.0"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp_body = resp.read().decode("utf-8")
            data = json.loads(resp_body) if resp_body else {}
            return {
                "success": True,
                "id": data.get("id"),
                "to": to_email,
                "from": sender,
                "message": f"Email successfully dispatched to {to_email} via Resend!"
            }
    except urllib.error.HTTPError as e:
        error_text = e.read().decode("utf-8", errors="replace")
        try:
            err_json = json.loads(error_text)
            err_msg = err_json.get("message", error_text)
            err_name = err_json.get("name", "resend_api_error")
        except Exception:
            err_msg = error_text
            err_name = f"http_{e.code}"

        # Detect Resend dev domain recipient restriction
        is_restriction = (
            "only send testing emails to your own email" in err_msg.lower() or
            "validation_error" in err_name.lower() or
            e.code == 403
        )
        if is_restriction and "onboarding@resend.dev" in sender:
            explanation = (
                f"Resend Restriction: {err_msg}. "
                "When using 'onboarding@resend.dev' in development, Resend only delivers to the "
                "email address used to register the Resend account. Please test with your registered Resend email."
            )
        else:
            explanation = f"Resend API Error ({e.code}): {err_msg}"

        return {
            "success": False,
            "error_code": err_name,
            "status_code": e.code,
            "message": explanation
        }
    except urllib.error.URLError as e:
        return {
            "success": False,
            "error_code": "network_error",
            "message": f"Network connection to Resend API failed: {str(e.reason)}"
        }
    except Exception as e:
        return {
            "success": False,
            "error_code": "unexpected_error",
            "message": f"Unexpected error while sending email: {str(e)}"
        }


def build_test_email_html(recipient: str, test_type: str = "Test Verification") -> str:
    """Generate responsive HTML email template for development tests."""
    return f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 14px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="display: inline-block; width: 48px; height: 48px; background: #1C155F; border-radius: 12px; line-height: 48px; text-align: center; font-size: 26px; color: #ffffff; box-shadow: 0 4px 12px rgba(28,21,95,0.25);">✈️</div>
        <h2 style="color: #1C155F; margin: 8px 0 0 0; font-size: 22px;">TravelMate AI</h2>
        <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Development Email Test • Resend Integration</p>
      </div>

      <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
        <strong style="color: #065f46; font-size: 14px;">✅ Resend Connection Verified!</strong>
        <p style="color: #047857; font-size: 13px; margin: 4px 0 0 0;">
          This email confirms your server-side <code>RESEND_API_KEY</code> is working properly using the development sender <code>onboarding@resend.dev</code>.
        </p>
      </div>

      <p style="color: #334155; font-size: 14px; line-height: 1.6;">
        Hello Traveler,
      </p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">
        You are testing the TravelMate AI transactional email service. Your local development environment is configured without requiring a custom domain.
      </p>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 20px 0; font-size: 13px; color: #1e293b;">
        <div style="margin-bottom: 8px;"><strong>Sender:</strong> <code>onboarding@resend.dev</code></div>
        <div style="margin-bottom: 8px;"><strong>Recipient:</strong> <code>{recipient}</code></div>
        <div style="margin-bottom: 8px;"><strong>Test Type:</strong> {test_type}</div>
        <div><strong>Status:</strong> <span style="color: #059669; font-weight: 700;">Development Mode (Free)</span></div>
      </div>

      <p style="color: #64748b; font-size: 12px; line-height: 1.5;">
        ℹ️ <em>Notice: While in development, Resend allows sending emails from <code>onboarding@resend.dev</code> strictly to your registered account email. No domain purchase is needed.</em>
      </p>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
      <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
        TravelMate AI • Explainable Trip Recommendations & Navigation
      </p>
    </div>
    """

