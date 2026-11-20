
# Supabase Auth & Resend Development & Testing Setup Guide 📧🔐
>
 **TravelMate AI — Development Testing with Resend & Supabase Auth**

This guide explains how to configure **Resend** and **Supabase Auth** for **development and testing only**, **without purchasing a custom domain**.

---

## 🔒 Security Principles (Private vs Public)

| Credential | Destination | Public / Private | Security Rule |
| :--- | :--- | :---: | :--- |
| **`RESEND_API_KEY`** | Backend `.env` / Server Environment / Supabase SMTP | **🔒 PRIVATE** | **NEVER** put in frontend JS, mobile app, Git, or the APK! |
| **`onboarding@resend.dev`** | Resend Sender Address & Supabase Sender Email | **Public** | Official free test sender provided by Resend. |
| **`SUPABASE_URL`** | `supabase-config.js` or App Settings | **Public** | Safe for mobile APK and web client. |
| **`SUPABASE_ANON_KEY`** | `supabase-config.js` or App Settings | **Public** | Safe for mobile APK and web client. |

---

## 🚀 Development Setup (No Custom Domain Required!)

Resend provides a built-in sandbox sender address: **`onboarding@resend.dev`**.  
You **do NOT need to purchase or own a domain** to test email dispatches and OTP verification.

### ⚠️ Resend Development Domain Restriction:
> [!IMPORTANT]
> When using `onboarding@resend.dev`, Resend **strictly delivers emails only to the primary email address you registered with your Resend account**.  
> If an email is dispatched to any other address during development, Resend will reject it with:  
> `validation_error: You can only send testing emails to your own email address`.  
> **To test OTP or dispatches: always use your registered Resend account email address.**

---

## 1. Quick Local Environment Variables

Create a `.env` file in the project root or configure these in your environment:

```env
# 1. Resend Private API Key (Server-Side Only)
RESEND_API_KEY=re_your_resend_api_key_here
RESEND_FROM_EMAIL=TravelMate AI <onboarding@resend.dev>

# 2. Supabase Public Credentials (For Mobile App & Web Client)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 2. Testing Email Sending Locally (3 Fast Ways)

### Option A: Direct CLI Test Script (Fastest — 1 Second)
Run the bundled testing utility in PowerShell:
```powershell
$env:RESEND_API_KEY="re_your_api_key_here"
python backend/test_email.py your-resend-registered-email@example.com
```
- Dispatches a styled test email directly via Resend's REST API.
- Checks your Resend account configuration and sender address.
- Displays the Resend delivery ID and verification status.

### Option B: FastAPI Backend Endpoint
Start the backend service:
```powershell
cd backend
python -m uvicorn main:app --reload --port 8000
```
Then visit the interactive Swagger UI at **`http://localhost:8000/docs`**:
- Check **`GET /email/status`**: view active configuration, sender, and development notice.
- Call **`POST /email/test`** with:
  ```json
  {
    "to_email": "your-resend-registered-email@example.com",
    "subject": "TravelMate AI Development Test"
  }
  ```

### Option C: Mobile App / Supabase Auth OTP Test
1. Set up Supabase Custom SMTP (see Section 3 below).
2. Launch TravelMate AI on your Android device or emulator.
3. Open the Sign In modal and enter your **registered Resend account email address**.
4. Tap **Send Verification Code**.
5. Check your email inbox for the 6-digit numeric OTP code!
6. Enter the 6 digits in the app to authenticate.

---

## 3. Configuring Supabase Custom SMTP with Resend Dev Sender

To connect Supabase Auth with Resend using the development sender:

1. Sign in to your **Supabase Dashboard** at [supabase.com](https://supabase.com).
2. Go to **Project Settings** (gear icon in sidebar) -> **Authentication**.
3. Scroll down to **SMTP Settings** and toggle **Enable Custom SMTP** to **ON**.
4. Enter the development settings:

| Field | Development Value |
| :--- | :--- |
| **Sender Email** | `onboarding@resend.dev` |
| **Sender Name** | `TravelMate AI` |
| **SMTP Host** | `smtp.resend.com` |
| **SMTP Port** | `465` (SSL) *or `587` (TLS)* |
| **SMTP User** | `resend` *(literal string "resend", lowercase)* |
| **SMTP Password** | Your `RESEND_API_KEY` (starts with `re_...`) |

5. Click **Save**.

---

## 4. Understanding Supabase Auth Limitations & Guest Mode

### What happens if you don't have a custom domain?
- **With `onboarding@resend.dev` configured:** OTP codes will be successfully delivered to your own registered Resend account email. Any other email will fail with a Resend validation error.
- **With Custom SMTP disabled:** Supabase uses its default built-in email service (rate-limited to 3 emails per hour for development).
- **Guest Mode (Zero Friction):** TravelMate AI includes a full **Guest Mode**. Users can plan trips, view recommendations, inspect itineraries, optimize budgets, and explore interactive maps without logging in or configuring Supabase!

### When do you need a custom domain?
You only need a custom domain (e.g. `yourtravelmate.com`) when launching the application to the **general public**, where arbitrary travelers register with random email addresses. For development, class viva, testing, and demonstration, **`onboarding@resend.dev` is 100% sufficient and free**.

---

## 5. Troubleshooting Common Resend Issues

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| `validation_error: You can only send testing emails to your own email address` | Using `onboarding@resend.dev` to email a non-registered address | Use your registered Resend account email as the recipient. |
| `missing_api_key` | `RESEND_API_KEY` not found | Set `$env:RESEND_API_KEY="re_..."` or add to root `.env`. |
| `401 Unauthorized` | Invalid or expired Resend API key | Generate a new API key in Resend Dashboard -> API Keys. |
| `429 Rate Limit` | Supabase OTP limit (1 OTP per 60s) | Wait 60 seconds. The app includes a built-in countdown timer. |
| Network request failed | Offline device | Ensure mobile data or Wi-Fi is active on the test device. |
