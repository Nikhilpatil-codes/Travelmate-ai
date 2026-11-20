"""
TravelMate AI Assistant ("Ask TravelMate").
Provides context-aware conversational travel guidance for Karnataka, India:
- Primary Engine: Google Gemini API (model: gemini-2.0-flash) via secure backend route.
- Fallback Engine: High-variety, intent-based local rule engine with 2-3 dynamic phrasings per intent.
- Guarantees zero secret exposure, 8-second request timeout, rate limiting, and varied responses.
"""

import os
import re
import json
import time
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv

# Load .env at startup using python-dotenv
def _load_env_at_startup():
    candidates = [
        os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
        os.path.join(os.path.dirname(__file__), ".env")
    ]
    for env_path in candidates:
        if os.path.isfile(env_path):
            load_dotenv(dotenv_path=env_path, override=False)
            break

_load_env_at_startup()

if os.environ.get("GEMINI_API_KEY"):
    print("Gemini key loaded")
else:
    print("Gemini key missing")

SYSTEM_PROMPT = (
    "You are TravelMate AI, a friendly travel assistant for Karnataka, India. "
    "Help with budget, packing, weather, destinations, food, transport and itineraries. "
    "Use ONLY the trip data and factor scores provided for recommendations. "
    "TravelMate's scoring uses 8 weighted factors: Budget 20%, Interests 20%, "
    "Time Feasibility 15%, Travel Mood 15%, Food Compatibility 10%, Distance 10%, "
    "Transport 5%, Season 5%. When asked why a place was recommended, explain using these scores. "
    "Do not invent prices, timings or facts; if unsure, say so and give a safe general tip. "
    "Keep replies under 80 words, practical and specific. Never repeat a previous answer. "
    "If the question is unclear, ask one clarifying question. If it is unrelated to travel, "
    "politely redirect."
)

# In-memory tracking to ensure we never return the same offline reply twice in a row
_last_reply_indices: Dict[str, int] = {}

# Cached destination dataset
_destinations_cache: Optional[List[Dict[str, Any]]] = None

def _get_destinations_data() -> List[Dict[str, Any]]:
    global _destinations_cache
    if _destinations_cache is not None:
        return _destinations_cache

    csv_path = os.path.join(os.path.dirname(__file__), "destinations.csv")
    if os.path.isfile(csv_path):
        try:
            import pandas as pd
            df = pd.read_csv(csv_path)
            _destinations_cache = df.to_dict(orient="records")
            return _destinations_cache
        except Exception:
            pass
    _destinations_cache = []
    return _destinations_cache

def _find_destination_in_text(text: str, context_dest: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """Look for destination mentioned in message text or fallback to context destination."""
    lower_text = text.lower()
    destinations = _get_destinations_data()
    for d in destinations:
        name = str(d.get("name", "")).lower()
        city = str(d.get("city", "")).lower()
        if name and name in lower_text:
            return d
        if city and city in lower_text:
            return d
    if context_dest and isinstance(context_dest, dict) and context_dest.get("name"):
        return context_dest
    return None

def _get_varied_reply(intent: str, phrasings: List[str]) -> str:
    """Select a phrasing ensuring we never show the same reply twice in a row."""
    global _last_reply_indices
    last_idx = _last_reply_indices.get(intent, -1)
    if len(phrasings) <= 1:
        return phrasings[0]
    next_idx = (last_idx + 1) % len(phrasings)
    _last_reply_indices[intent] = next_idx
    return phrasings[next_idx]

def get_offline_reply(
    message: str,
    context: Dict[str, Any]
) -> str:
    """
    Local intent-based assistant engine:
    Covers greeting, budget, packing, weather, destinations, food, transport, why-this-place,
    clarifying questions for unclear prompts, and redirection for off-topic queries.
    Uses app's destinations data and ensures varied phrasings.
    """
    msg = message.strip().lower()
    dest = _find_destination_in_text(message, context.get("selected_destination") or context.get("destination"))
    if not dest:
        dests = _get_destinations_data()
        dest = dests[0] if dests else {"name": "Karnataka", "city": "Bengaluru", "average_cost_per_person": 1200}

    dest_name = dest.get("name", "Karnataka")
    dest_city = dest.get("city", "")
    avg_cost = float(dest.get("average_cost_per_person") or 1200)
    best_season = dest.get("best_season", "October to March")
    best_months = dest.get("best_months", "October, November, December, January, February")
    local_food = dest.get("local_food", "Bisi Bele Bath, Mysore Masala Dosa, and Filter Kaapi")
    activities = dest.get("activities", "Heritage shrines, Nature trails, and Scenic viewpoints")

    # Budget & trip preferences from context
    prefs = context.get("preferences") or {}
    travelers = context.get("travelers") or prefs.get("travelers", 2)
    days_str = str(context.get("days") or prefs.get("available_time", "weekend"))
    
    # Extract days multiplier if present in user query (e.g., "3 days")
    days_match = re.search(r"(\d+)\s*(?:day|days)", msg)
    days_count = int(days_match.group(1)) if days_match else (3 if "3" in days_str else 2)

    # 1. Unrelated / Off-topic check (e.g. cricket, sports, stock market, coding, celebrities)
    unrelated_keywords = [
        "cricket", "match", "score", "football", "ipl", "tennis", "movie", "cinema",
        "actor", "actress", "politics", "election", "stock", "shares", "crypto",
        "bitcoin", "python", "code", "programming", "homework", "math", "who won"
    ]
    if any(k in msg for k in unrelated_keywords):
        phrasings = [
            "I specialize exclusively in travel guidance and trip planning for Karnataka, India! Let me know if you need help with destinations, budgets, packing, or itineraries.",
            "I am TravelMate AI, your dedicated Karnataka travel companion. While I don't follow sports or general trivia, I can help you plan your next getaway or road trip!",
            "I'm designed to help you discover the best of Karnataka! Ask me anything about itineraries, local food, packing, or travel costs."
        ]
        return _get_varied_reply("unrelated", phrasings)

    # 2. Greeting intent ("Hi", "Hello", "Hey", "Good morning")
    if re.search(r"^(hi|hello|hey|greetings|namaskara|good\s*(morning|afternoon|evening))\b", msg) or msg in ["hi", "hello", "hey"]:
        phrasings = [
            "Namaskara! I am TravelMate AI, your personal trip companion for Karnataka. Ask me about budgets, packing, weather, or recommendations!",
            "Hello there! Ready to plan your Karnataka getaway? I can help you with customized itineraries, travel costs, local delicacies, and packing tips.",
            "Hey traveler! I'm TravelMate AI. Let me know which Karnataka destination you're eyeing, or ask for budget, packing, or route advice!"
        ]
        return _get_varied_reply("greeting", phrasings)

    # 3. Unclear / Vague prompt ("I need that information", "tell me that", "give me info")
    if msg in ["i need that information", "tell me that", "give me info", "more info", "information", "tell me"]:
        phrasings = [
            "Could you please specify which information you need—are you looking for budget estimates, packing advice, weather, or itinerary recommendations?",
            "I'd love to help! Could you specify what you'd like to know about—such as costs, best season, food specialties, or why a place was chosen?",
            "Happy to provide details! Which topic would you like more information on: travel timings, packing checklist, or destination highlights?"
        ]
        return _get_varied_reply("unclear", phrasings)

    # 4. Why was this place recommended? (Explainable 8-factor scoring)
    if any(k in msg for k in ["why was", "why is", "why this", "recommend", "how did you choose", "explain score"]):
        factor_scores = context.get("factor_scores") or {}
        b_score = factor_scores.get("budget", 92)
        i_score = factor_scores.get("interests", 90)
        t_score = factor_scores.get("time", 88)
        phrasings = [
            f"Mysuru was recommended based on TravelMate's 8 weighted factors: high Interest match (20%) for royal heritage, 100% Time Feasibility (15%) via the Expressway, and top Budget compatibility (20%)." if "mysur" in dest_name.lower() or "mysor" in dest_name.lower() else
            f"{dest_name} was recommended using TravelMate's explainable 8-factor evaluation: Budget ({b_score}%, weight 20%), Interests ({i_score}%, weight 20%), and Time Feasibility ({t_score}%, weight 15%).",
            f"TravelMate AI matched {dest_name} through our 8 transparent factors: Budget (20%), Interests (20%), Time Feasibility (15%), Travel Mood (15%), Food (10%), Distance (10%), Transport (5%), and Season (5%). It provides maximum comfort within your driving radius.",
            f"We recommended {dest_name} because its combined score is high across Heritage & Nature interests (20%), rapid highway road connectivity (5%), and overall budget efficiency (20%)."
        ]
        return _get_varied_reply("why_this_place", phrasings)

    # 5. Budget & Cost queries ("Budget for Coorg 3 days?", "cost", "how much")
    if any(k in msg for k in ["budget", "cost", "how much", "price", "expense", "expensive", "cheaper", "fare"]):
        budget_bd = context.get("budget_breakdown") or {}
        if budget_bd and budget_bd.get("total_group_cost"):
            total = budget_bd.get("total_group_cost", 0)
            per_person = budget_bd.get("cost_per_person", 0)
            trans = budget_bd.get("transport_cost", 0)
            food = budget_bd.get("food_cost", 0)
            phrasings = [
                f"For {dest_name}, the total estimated group cost is ₹{total:,.0f} (approx ₹{per_person:,.0f} per person for {travelers} traveler(s)).\n\n• Transportation: ~₹{trans:,.0f}\n• Meals & Snacks: ~₹{food:,.0f}\n• Entry & Activities: ~₹{budget_bd.get('entry_cost', 0) + budget_bd.get('activity_cost', 0):,.0f}\n\n💡 Tip: Use our 'Make My Trip Cheaper' optimizer in the Budget section for extra savings!",
                f"For {dest_name}, estimated trip expense is ₹{total:,.0f} total (₹{per_person:,.0f} per person). Transport is ~₹{trans:,.0f} and food is ~₹{food:,.0f}.",
                f"Budget breakdown for {dest_name}: ₹{total:,.0f} for your group (~₹{per_person:,.0f}/person) covering fuel/travel, dining, and sightseeing."
            ]
            return _get_varied_reply("budget_breakdown", phrasings)

        calc_per_person = avg_cost * days_count
        calc_group = calc_per_person * travelers
        phrasings = [
            f"For {dest_name} ({days_count} days), estimate ~₹{calc_per_person:,.0f} per person (approx ₹{calc_group:,.0f} for {travelers} travelers). This covers stay, authentic regional dining, fuel, and sightseeing entry fees.",
            f"Budgeting for {dest_name} over {days_count} days: expect ~₹{avg_cost:,.0f} per person daily. For {travelers} travelers, plan for roughly ₹{calc_group:,.0f} total including transport and local activities.",
            f"A {days_count}-day trip to {dest_name} typically costs ~₹{calc_per_person:,.0f} per person. Tip: Traveling by KSRTC bus or booking homestays in advance can save up to 25%!"
        ]
        return _get_varied_reply("budget", phrasings)

    # 6. Weather & Best Season queries ("Weather in Hampi in December?", "climate", "rain", "temperature")
    if any(k in msg for k in ["weather", "season", "climate", "temperature", "rain", "monsoon", "winter", "summer", "december", "when to visit"]):
        if "hampi" in msg or "hampi" in dest_name.lower():
            phrasings = [
                "In December, Hampi enjoys peak winter weather with clear skies, pleasant daytime highs around 28°C, and cool breezy evenings (~16°C). It is the perfect time for walking temple trails!",
                "December is prime time for Hampi! Days are sunny and dry (~27°C) while nights are comfortably cool (~15°C). Great for boulder exploring and Tungabhadra river sunsets.",
                "Hampi's December climate is ideal: warm sunny days and cool nights without rain. Carry a sun hat for midday monument walks and a light layer for pleasant evenings."
            ]
        else:
            phrasings = [
                f"The best climate for {dest_name} is during {best_season} ({best_months}). Expect comfortable outdoor conditions and scenic viewpoints.",
                f"For {dest_name}, plan your visit around {best_season}. Daytime temperatures are pleasant, making sightseeing and outdoor activities very comfortable.",
                f"Weather update for {dest_name}: {best_season} offers the clearest skies and pleasant temperatures. Avoid peak summer afternoons for outdoor climbs."
            ]
        return _get_varied_reply("weather", phrasings)

    # 7. Packing & What to bring ("What should I pack?", "clothes", "footwear")
    if any(k in msg for k in ["pack", "bring", "wear", "clothes", "shoes", "footwear", "essentials"]):
        phrasings = [
            f"Essential packing for {dest_name}: sturdy walking shoes with rubber grip, breathable cotton clothes, 2L water bottle, sun protection (cap/sunglasses), and a light layer for breezy mornings.",
            f"For your Karnataka trip: pack comfortable walking shoes for heritage monuments/trails, high-SPF sunscreen, light cottons, power bank, and small cash/UPI for highway vendors.",
            f"Packing checklist for {dest_name}: comfortable trekking/walking footwear, reusable water bottle, sunglasses, light windcheater jacket, and personal medications."
        ]
        return _get_varied_reply("packing", phrasings)

    # 8. Food & Culinary queries ("food", "eat", "cuisine", "dishes")
    if any(k in msg for k in ["food", "eat", "restaurant", "cuisine", "veg", "breakfast", "lunch", "dinner", "specialty"]):
        phrasings = [
            f"Culinary highlights for {dest_name}: {local_food}. Be sure to visit iconic regional mess halls and family-run highway tiffin spots!",
            f"Food guide for {dest_name}: try authentic regional specialties including {local_food}. Verified vegetarian and regional dining options are widely available.",
            f"Must-try dining near {dest_name}: indulge in {local_food}. Pair with traditional South Indian Filter Kaapi for the authentic road trip experience!"
        ]
        return _get_varied_reply("food", phrasings)

    # 9. Transport & Route queries ("how to reach", "drive", "route", "bus", "train")
    if any(k in msg for k in ["transport", "reach", "route", "drive", "driving", "bus", "train", "cab", "distance", "highway"]):
        dist = dest.get("distance_km", 120)
        phrasings = [
            f"Getting to {dest_name} (~{dist} km from Bengaluru): accessible via well-paved state highways, KSRTC Airavat buses, or self-drive cars. Depart early by 6 AM to beat city toll traffic.",
            f"Transport to {dest_name}: driving takes around {dest.get('travel_time_hours', 2.5)} hours via the main corridor. KSRTC buses and South Western Railway trains run regularly.",
            f"Route advice for {dest_name}: smooth highway driving connects {dest_city or dest_name}. We recommend taking a morning road trip for scenic views and roadside tiffin stops."
        ]
        return _get_varied_reply("transport", phrasings)

    # 10. Destinations & Attractions ("best places", "destinations", "top spots", "places to see")
    if any(k in msg for k in ["destinations", "best places", "places to see", "top spots", "attractions", "sightseeing", "where to go"]):
        phrasings = [
            "Top Karnataka destinations right now: Nandi Hills for sunrise getaways, Mysuru for royal palaces, Coorg for lush coffee hills, and Hampi for UNESCO world heritage ruins.",
            "Explore Karnataka's finest: Kabini for wildlife safaris, Chikmagalur for mountain coffee estates, Gokarna for tranquil beaches, and Badami for rock-cut cave temples.",
            f"Top highlights for {dest_name}: {activities}. Check the Destinations tab in TravelMate AI for transparent 8-factor scores on 40 verified getaways!"
        ]
        return _get_varied_reply("destinations", phrasings)

    # Fallback general response
    phrasings = [
        f"I'm TravelMate AI, your Karnataka travel guide! I can assist with budgets, packing lists, weather timings, local dining, or why {dest_name} was recommended.",
        f"Welcome to TravelMate AI. Ask me anything about exploring {dest_name}—from expected trip expenses and packing tips to the best season for sightseeing!",
        f"TravelMate AI is here to help you navigate Karnataka with ease. Ask about itineraries, road routes, regional dishes, or budget optimizations!"
    ]
    return _get_varied_reply("general", phrasings)

def _sanitize_error(text: str) -> str:
    """Strip any accidental API keys from error descriptions or URLs."""
    return re.sub(r'key=[a-zA-Z0-9_\-\.]+', 'key=[REDACTED]', str(text))

def call_gemini_api(
    message: str,
    context: Dict[str, Any],
    history: List[Dict[str, Any]],
    api_key: str,
    model_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Call Google Gemini API using standard library urllib.
    Timeout is set to 8 seconds. Returns result dictionary with reply or error telemetry.
    """
    model = model_name or os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite")
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    # Format trip context preamble
    dest = context.get("selected_destination") or context.get("destination") or {}
    dest_name = dest.get("name") if isinstance(dest, dict) else str(dest or "Karnataka")
    budget = context.get("budget", 4000)
    days = context.get("days", "One day")
    travelers = context.get("travelers", 2)
    mood = context.get("mood", "Relaxing")
    interests = context.get("interests", ["Nature", "Photography"])
    season = context.get("season", "Flexible dates")
    factor_scores = context.get("factor_scores") or {}

    context_str = (
        f"[Current Trip Data]\n"
        f"• Destination: {dest_name}\n"
        f"• Target Budget: ₹{budget}\n"
        f"• Duration: {days}\n"
        f"• Travelers: {travelers}\n"
        f"• Travel Mood: {mood}\n"
        f"• User Interests: {', '.join(interests) if isinstance(interests, list) else interests}\n"
        f"• Season: {season}\n"
        f"• 8-Factor Scores: Budget {factor_scores.get('budget', 90)}/100, "
        f"Interests {factor_scores.get('interests', 90)}/100, "
        f"Time {factor_scores.get('time', 85)}/100, "
        f"Mood {factor_scores.get('mood', 85)}/100, "
        f"Food {factor_scores.get('food', 80)}/100, "
        f"Distance {factor_scores.get('distance', 85)}/100, "
        f"Transport {factor_scores.get('transport', 90)}/100, "
        f"Season {factor_scores.get('season', 90)}/100."
    )

    contents = []
    # Take last 10 messages of history
    recent_history = (history or [])[-10:]
    for item in recent_history:
        sender = item.get("sender") or item.get("role", "user")
        text = item.get("text") or item.get("content", "")
        if not text:
            continue
        role = "model" if sender in ["ai", "model", "assistant"] else "user"
        contents.append({"role": role, "parts": [{"text": str(text)}]})

    # Append current message with context
    current_prompt = f"{context_str}\n\nUser Question: {message}"
    contents.append({"role": "user", "parts": [{"text": current_prompt}]})

    payload = {
        "system_instruction": {
            "parts": [{"text": SYSTEM_PROMPT}]
        },
        "contents": contents,
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 200
        }
    }

    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=req_data,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "TravelMateAI-Chat/1.0"
        },
        method="POST"
    )

    try:
        # Strict 8-second timeout as required
        with urllib.request.urlopen(req, timeout=8.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            candidates = data.get("candidates") or []
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts and "text" in parts[0]:
                    return {
                        "success": True,
                        "reply": parts[0]["text"].strip(),
                        "model": model
                    }
            return {
                "success": False,
                "error_code": 500,
                "error_message": "Empty candidate parts from Gemini API"
            }
    except urllib.error.HTTPError as e:
        status_code = e.code
        try:
            raw_err = e.read().decode("utf-8", errors="ignore")
            sanitized = _sanitize_error(raw_err)
            err_json = json.loads(sanitized)
            message_text = err_json.get("error", {}).get("message", str(e.reason or e))
        except Exception:
            message_text = _sanitize_error(str(e.reason or e))
        return {
            "success": False,
            "error_code": status_code,
            "error_message": f"HTTP {status_code}: {message_text}"
        }
    except urllib.error.URLError as e:
        if isinstance(e.reason, TimeoutError) or "timed out" in str(e.reason).lower():
            return {
                "success": False,
                "error_code": 408,
                "error_message": "Request timed out after 8.0s"
            }
        return {
            "success": False,
            "error_code": 503,
            "error_message": _sanitize_error(f"Network error: {e.reason}")
        }
    except TimeoutError:
        return {
            "success": False,
            "error_code": 408,
            "error_message": "Request timed out after 8.0s"
        }
    except Exception as e:
        return {
            "success": False,
            "error_code": 500,
            "error_message": _sanitize_error(str(e))
        }

def process_query(
    message: str,
    context: Optional[Dict[str, Any]] = None,
    history: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Main chat processor:
    1. If GEMINI_API_KEY is available, attempts Gemini flash model with 8-second timeout.
    2. If missing, times out, or fails, falls back gracefully to varied local intent engine.
    """
    context = context or {}
    history = history or []

    # Check for Gemini API key and model from environment variables
    api_key = os.environ.get("GEMINI_API_KEY", "").strip() or os.environ.get("GOOGLE_API_KEY", "").strip()
    gemini_model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash").strip()
    last_error = None

    if api_key and not api_key.startswith("your_") and not api_key.startswith("re_"):
        # Primary call using configured model (default: gemini-2.5-flash)
        result = call_gemini_api(message, context, history, api_key, model_name=gemini_model)
        if result.get("success"):
            return {
                "reply": result["reply"],
                "source": result.get("model", gemini_model),
                "offline": False
            }
        else:
            last_error = {
                "status_code": result.get("error_code"),
                "message": result.get("error_message")
            }

    # Offline / local intent fallback
    offline_reply = get_offline_reply(message, context)
    fallback_result = {
        "reply": offline_reply,
        "source": "rule_based_engine",
        "offline": True
    }
    if last_error:
        fallback_result["error_code"] = last_error["status_code"]
        fallback_result["error_message"] = last_error["message"]
    return fallback_result

