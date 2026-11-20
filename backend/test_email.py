"""
TravelMate AI — Standalone Resend Email Test CLI.

Usage:
    python backend/test_email.py [your-resend-registered-email@example.com]

Requirements:
    Set the RESEND_API_KEY environment variable or put it in .env:
    $env:RESEND_API_KEY="re_123456789..." (PowerShell)
    export RESEND_API_KEY="re_123456789..." (Bash)
"""

import sys
import os

# Safe UTF-8 console output on Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from email_service import (
    get_resend_api_key,
    get_sender_address,
    get_email_service_status,
    send_email_via_resend,
    build_test_email_html
)


def main():
    print("=" * 60)
    print("TravelMate AI -- Resend Development Email Tester")
    print("=" * 60)

    status = get_email_service_status()
    print(f"API Key Configured: {'[YES]' if status['resend_configured'] else '[NO]'}")
    print(f"Sender Address:     {status['sender_address']}")
    print(f"Development Mode:   {'[ACTIVE] (onboarding@resend.dev)' if status['development_mode'] else 'Custom Domain'}")
    print(f"Domain Required:    [NO] (Free development testing)")
    print("-" * 60)

    if not status["resend_configured"]:
        print("\n[!] RESEND_API_KEY is not set on the server!")
        print("To configure:")
        print("1. Get your free API key at: https://resend.com/api-keys")
        print("2. Set the environment variable in PowerShell:")
        print('   $env:RESEND_API_KEY="re_your_api_key_here"')
        print("   OR create a .env file with:")
        print("   RESEND_API_KEY=re_your_api_key_here")
        sys.exit(1)

    # Determine recipient
    if len(sys.argv) > 1 and sys.argv[1].strip():
        recipient = sys.argv[1].strip()
    else:
        print("Please provide a recipient email address to test dispatches:")
        try:
            recipient = input("Recipient Email: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            sys.exit(0)

    if not recipient or "@" not in recipient:
        print("[ERROR] Invalid email address provided.")
        sys.exit(1)

    print(f"\n[*] Sending test email to: {recipient} ...")
    print(f"    From: {status['sender_address']}")

    html = build_test_email_html(recipient, test_type="Local Development Test")
    result = send_email_via_resend(
        to_email=recipient,
        subject="TravelMate AI -- Development Email Test",
        html_content=html
    )

    print("-" * 60)
    if result["success"]:
        print("[SUCCESS] Email dispatched successfully via Resend!")
        print(f"   Email ID: {result.get('id')}")
        print(f"   Check the inbox of: {recipient}")
    else:
        print(f"[FAILED] {result.get('error_code')}")
        print(f"   Details: {result.get('message')}")
        if result.get("status_code") == 403:
            print("\n[TIP] Remember that 'onboarding@resend.dev' can only send to your")
            print("      registered Resend account email address during development.")
    print("=" * 60)


if __name__ == "__main__":
    main()
