# TravelMate AI 🌍✈️
> **“Your Journey, Your Preferences, Your Perfect Trip.”**  
> *Discover destinations around Bengaluru and Karnataka that match your time, budget, interests, and travel style.*

[![Android Build](https://img.shields.io/badge/Android%20APK-v1.0.0--debug-brightgreen)](https://files.catbox.moe/12ry8p.apk)
[![Target SDK](https://img.shields.io/badge/Android%20SDK-API%2034-blue)](https://developer.android.com)
[![Python Backend](https://img.shields.io/badge/Backend-FastAPI%20%2B%20SQLite-teal)](https://fastapi.tiangolo.com)
[![Tests](https://img.shields.io/badge/Tests-20%20Passed-success)](#automated-testing)

---

## 1. Project Overview & Problem Statement
Planning short outings, one-day weekend getaways, and spontaneous road trips is often frustrating:
1. **Generic Top 10 Lists:** Travel blogs suggest distant or impractical tourist traps without knowing the traveler's available hours or budget.
2. **Opaque AI Hallucinations:** Generative LLMs frequently invent non-existent travel times, unrealistic bus timetables, or closed monuments.
3. **Budget Surprises:** Travelers lack realistic breakdowns of fuel, highway tolls, food, and parking costs.

**TravelMate AI** solves this with a **deterministic, explainable content-based recommendation engine** and an **integrated Android mobile application**. It takes user preferences (starting location, budget, available time, travelers count, transport mode, travel mood, dietary preferences, and seasonal timing) and computes transparent compatibility scores for 40 verified destinations across Karnataka and neighboring regions.

---

## 2. Key Implemented Features

### 🧠 Explainable 8-Factor Recommendation Engine
- Deterministic, mathematical content-based compatibility calculation normalized to **0–100**.
- **Configurable Factor Weights:**
  | Factor | Weight | Evaluation Logic |
  | :--- | :---: | :--- |
  | **Budget Compatibility** | **20%** | Compares estimated group cost vs. target budget. Gradual penalty applied if exceeded. |
  | **Interest Matching** | **20%** | Matches user interests (Nature, Mountains, Heritage, etc.) with recorded activities. |
  | **Time Feasibility** | **15%** | Verifies round-trip travel time + recommended duration fits selected time window. |
  | **Travel Mood** | **15%** | Matches travel vibe (Adventure, Relaxing, Photography, Family, Friends). |
  | **Food Compatibility** | **10%** | Validates dietary needs (Veg, Non-veg, Vegan, Jain) & regional cuisine. |
  | **Distance Constraint** | **10%** | Strict max distance filter; convenience bonus for closer getaways. |
  | **Transportation Mode** | **5%** | Validates connectivity via Car, Bike, Bus, Train, or Cab. |
  | **Seasonal Suitability**| **5%** | Checks travel month against documented best seasons. |
  | **TOTAL** | **100%** | Normalized Overall Compatibility Score |
- Top 3 eligible destinations returned with **2 to 4 personalized explainable bullet points** derived from real scores.

### 🗺️ Google Maps Smart Route & Navigation Assistant
- **"Use My Current Location":** Geolocation auto-detection with runtime Android permissions and manual city entry fallback.
- **"Analyze My Route":** Evaluates travel distance, estimated driving duration, and highway corridor characteristics.
- **"Open in Google Maps":** Direct one-tap turn-by-turn navigation launched into the native Google Maps Android app or web URL.
- **"Explore Near Me":** Geospatial radius filtering (50 km, 100 km, 200 km, all Karnataka).

### ⏱️ Travel-Time-Aware Itinerary Generator
- Generates vertical chronological timelines with activity icons, hours, and descriptions.
- Explicitly factors in **outbound and return driving travel**.
- Infeasible trip detection: alerts travelers if a requested schedule cannot fit within their selected time window.

### 💰 Budget Calculator & "Make My Trip Cheaper" Optimizer
- Comprehensive breakdown: Transport fuel/tolls, meals, entry fees, activities, and miscellaneous parking.
- Distinguishes **Total Group Cost** from **Per-Person Cost**.
- **"⚡ Make My Trip Cheaper":** Recalculates expenses with economical transport alternatives (e.g. Bus/Train/Bike) and authentic regional eateries, showing exact rupee savings without reducing sightseeing quality.

### 🤖 "Ask TravelMate" AI Assistant (Gemini 2.0 Flash + Offline Fallback)
- **Google Gemini API Integration:** Powered by `gemini-2.0-flash` on the backend (`/api/chat` route) with private server-side `GEMINI_API_KEY`.
- **System Prompt & Context Guardrails:** Anchored with Karnataka domain knowledge and 8-factor scores (Budget 20%, Interests 20%, Time 15%, Mood 15%, Food 10%, Distance 10%, Transport 5%, Season 5%).
- **Offline Intent Fallback Engine:** 100% resilient when offline, timed out (>8s), or unconfigured, returning varied responses across 10 intents with "Offline mode" badge.
- **Interactive UI:** Dynamic typing indicator, Send button state locking, suggestion chips (Budget, Packing, Weather, Best places), 500-char safety limits, and rate limiting.

### 🌐 Multilingual Localization (5 Languages)
- Fully localized in **English**, **Kannada (ಕನ್ನಡ)**, **Hindi (हिन्दी)**, **Telugu (తెలుగు)**, and **Tamil (தமிழ்)**.
- Switching languages maintains full trip state, selected destination, and user preferences.

### 🔒 Passwordless Email OTP & Resend Development Mode
- **Zero-Domain Development Setup:** Pre-configured to use Resend's free testing sender `onboarding@resend.dev` with private server-side `RESEND_API_KEY` (no domain purchase required).
- **Supabase Auth Integration:** Passwordless 6-digit numeric OTP generation with real delivery via Resend SMTP. (Testing note: with `onboarding@resend.dev`, Resend delivers to your registered Resend account email).
- **Backend Email Tester:** Standalone CLI (`python backend/test_email.py`) and FastAPI endpoints (`GET /email/status`, `POST /email/test`) for 1-second local verification.
- **Guest Mode:** Plan trips, view recommendations, inspect itineraries, and calculate budgets with zero login barriers.
- **Cryptographic Session Restoration:** On app restart, sessions are verified directly against Supabase (`/auth/v1/user` & `/auth/v1/token`) with token refresh. Never treats unverified local data as authenticated.
- **User Profile & Sign-Out:** Verified user badge in header, account modal with verified email badge, and secure token revocation on logout.
- **Step-by-Step Setup Guide:** See [SUPABASE_RESEND_SETUP.md](SUPABASE_RESEND_SETUP.md) for full development testing instructions.

---

## 3. Technology Stack & Architecture

- **Android Mobile Frontend:** Native Android Activity (`MainActivity.java`, `WebAppInterface.java`) hosting an optimized, hardware-accelerated WebView with bundled offline assets. Target SDK 34 (Android 14), Minimum SDK 24 (Android 7.0+).
- **Backend Service:** Python 3.13, FastAPI, Uvicorn, Pydantic, Pandas, NumPy, SQLite3.
- **Build System:** Google Android SDK Commandline Tools (`aapt2`, `d8`, `javac`, `zipalign`, `apksigner`).
- **Data Storage:** Structured CSV (`destinations.csv`) + SQLite relational database (`travelmate.db`).

---

## 4. Repository Structure

```
TravelMate-AI/
├── TravelMate-AI-v1.0.0-debug.apk      # Compiled, signed Android Debug APK artifact
├── download/
│   └── index.html                     # Mobile-friendly APK distribution landing page
├── backend/
│   ├── destinations.csv               # 40 Karnataka destinations with 24 structured attributes
│   ├── main.py                        # FastAPI REST API endpoints
│   ├── recommendation.py              # 8-factor explainable content-based recommendation engine
│   ├── itinerary.py                   # Dynamic time-aware itinerary generator
│   ├── budget.py                      # Cost calculator & "Make My Trip Cheaper" optimizer
│   ├── chatbot.py                     # Offline domain travel assistant
│   ├── routes_service.py              # Geospatial distance & Google Maps routing
│   ├── database.py                    # SQLite tables, auth hashing, saved trips, feedback
│   ├── test_app.py                    # Automated test suite (15 test cases)
│   ├── requirements.txt               # Backend Python dependencies
│   ├── Dockerfile                     # Cloud container deployment configuration
│   └── Procfile                       # PaaS process configuration
├── android/
│   └── app/
│       ├── src/main/
│       │   ├── AndroidManifest.xml    # Package: com.travelmate.ai, permissions, SDK versions
│       │   ├── java/com/travelmate/ai/
│       │   │   ├── MainActivity.java  # WebView controller & geolocation permissions
│       │   │   └── WebAppInterface.java# JavaScript bridge for native intents & toast
│       │   ├── res/                   # Layouts, vector icons, colors, security config
│       │   └── assets/                # Self-contained offline application assets
│       │       ├── index.html
│       │       ├── style.css
│       │       ├── app.js
│       │       ├── translations.js
│       │       └── destinations.json
│       └── build/outputs/apk/debug/   # Build output folder
├── scripts/
│   ├── setup_android_sdk.ps1          # Automated Android SDK installer script
│   ├── install_android_build_tools.ps1# SDK licenses and platform tools installer
│   └── build_apk.ps1                  # Native AAPT2 + javac + D8 + apksigner build script
├── .env.example                       # Environment configuration template
└── README.md                          # Documentation & viva preparation guide
```

---

## 5. Verified Deliverables & Artifact Details

| Artifact Property | Verified Detail |
| :--- | :--- |
| **Debug APK File Path** | `android/app/build/outputs/apk/debug/app-debug.apk` |
| **Root Distribution Path** | `TravelMate-AI-v1.0.0-debug.apk` |
| **File Size** | **50,209 bytes** (~0.05 MB) |
| **Package ID** | `com.travelmate.ai` |
| **Min Supported Android**| Android 7.0 (API Level 24) |
| **Target Android Version**| Android 14 (API Level 34) |
| **Signature Schemes** | **v2 (APK Signature Scheme v2)** & **v3 (APK Signature Scheme v3)** |
| **SHA-256 Checksum** | `E8ED508E6798CF642C4C1AC58ABE73AE945BF40F0E41BD82B56BEEAEB35CE078` |

---

## 6. Exact Commands to Run, Test & Build

### A. Run Backend API Server
```powershell
# 1. Install Python dependencies
python -m pip install -r backend/requirements.txt

# 2. Run automated test suite
python -m unittest backend/test_app.py

# 3. Start the FastAPI development server
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```
*API documentation will be accessible at: `http://localhost:8000/docs`*

### B. Build Android Debug APK
```powershell
# Run the automated build pipeline
powershell -ExecutionPolicy Bypass -File .\scripts\build_apk.ps1
```
*Outputs compiled, signed APK to: `android/app/build/outputs/apk/debug/app-debug.apk`*

### C. Install on Phone / Emulator via ADB
```powershell
# Check connected device
adb devices

# Install APK onto phone or emulator
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 7. Verification Status Matrix

| Component | Status | Verification Evidence |
| :--- | :---: | :--- |
| **Destination Dataset** | **PASS** | 40 unique destinations verified with coordinates, costs, activities, and seasons. |
| **Recommendation Engine** | **PASS** | Deterministic 8-factor score, distance exclusion, and explainable reasons verified. |
| **Budget Calculator & Optimizer** | **PASS** | Group vs per-person calculation verified; "Make My Trip Cheaper" savings verified. |
| **Itinerary Generator** | **PASS** | Feasible timeline and infeasible travel warnings verified. |
| **Authentication & Persistence** | **PASS** | Salted SHA-256 password hashing and isolated saved trips verified. |
| **Feedback & Analytics** | **PASS** | Ratings distribution and average calculations verified with SQLite. |
| **Automated Test Suite** | **PASS** | All 15 unit tests executed and passed (`OK` in 0.302s). |
| **Android APK Build** | **PASS** | Generated `app-debug.apk` using AAPT2, javac, D8, and apksigner. |
| **APK Signature Verification** | **PASS** | Verified with APK Signature Scheme v2 and v3. |
| **Live Device ADB Install** | **NOT RUN / BLOCKED** | No physical phone or emulator was attached to `adb devices` at build time. |

---

## 8. College Viva Preparation & Demonstration Guide

### Q1: What problem does TravelMate AI solve?
> **Answer:** It acts as an intelligent travel companion for short trips, one-day outings, and weekend getaways around Bengaluru and Karnataka. Instead of generic lists or hallucinated LLM responses, it offers deterministic, explainable destination recommendations based on actual budget, time limits, and travel mood.

### Q2: Why is the recommendation engine content-based rather than collaborative filtering?
> **Answer:** In short weekend trip applications, user-item interaction matrices suffer from extreme **cold-start problems** (new users haven't rated destinations yet). Content-based filtering compares the explicit attributes of destinations (activities, cost, travel time, cuisine, seasonal suitability) against the traveler's stated preferences, guaranteeing an accurate, explainable result on the very first try.

### Q3: How does the 8-factor scoring algorithm work?
> **Answer:** Each factor is evaluated on a normalized scale of 0 to 100 and weighted: Budget (20%), Interests (20%), Time Feasibility (15%), Travel Mood (15%), Food Compatibility (10%), Distance Constraint (10%), Transport Mode (5%), and Season (5%). Destinations exceeding the user's maximum distance are excluded upfront. The top 3 results are ranked deterministically with personalized bullet reasons.

### Q4: Why doesn't the recommendation engine require a paid AI API?
> **Answer:** The core scoring logic uses deterministic feature matching implemented with Pandas and NumPy. This eliminates API subscription costs, prevents rate limits, guarantees zero hallucinations, and ensures the application runs completely offline on an Android device.

### Q5: How does the "Make My Trip Cheaper" budget optimizer work?
> **Answer:** Rather than applying arbitrary flat discounts, it inspects the trip breakdown. It evaluates more economical supported transport options (e.g., switching from Cab to Car, or Car to Bus/Bike) and replaces high-end food plannings with authentic regional eateries and Darshinis. It then recomputes the actual fuel, toll, and food totals to show transparent savings.

### Q6: How does the Android APK communicate with the backend?
> **Answer:** The Android app packages an optimized WebView container with local offline assets (`file:///android_asset/index.html`). When a network backend is available (`http://10.0.2.2:8000` for Android emulator or public HTTPS URL), it communicates via RESTful JSON APIs. If offline, the bundled JavaScript engine computes the exact same 8-factor scores locally.

---
**TravelMate AI** — Engineered for transparency, accessibility, and smooth travel experiences.
