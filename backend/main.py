"""
TravelMate AI — Main FastAPI Application.
Provides RESTful APIs for:
- Authentication & User Profile
- Destination Discovery & Exploration
- Explainable Recommendation Engine
- Dynamic Itinerary Generation
- Budget Estimation & Optimization
- Interactive Maps & Route Analysis
- Offline AI Chat Assistant
- SQLite Feedback & Analytics Persistence
- Saved Trips Management
"""

import os
import re
import time
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, HTTPException, Depends, Query, status, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from dotenv import load_dotenv

# Load environment configuration (.env) at startup using python-dotenv
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

gemini_key = os.environ.get("GEMINI_API_KEY")
gemini_model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
if gemini_key:
    print(f"Gemini key loaded (model: {gemini_model})")
else:
    print("Gemini key missing")

from database import (
    create_user, authenticate_user, get_user_by_id,
    save_trip, get_user_trips, delete_user_trip,
    save_feedback, get_feedback_analytics
)
from recommendation import load_destinations, get_recommendations
from itinerary import generate_itinerary
from budget import calculate_budget, optimize_budget
from chatbot import process_query
from routes_service import analyze_route, explore_near_me
from email_service import (
    get_email_service_status, send_email_via_resend,
    build_test_email_html, get_resend_api_key
)

app = FastAPI(
    title="TravelMate AI API",
    description="Intelligent travel assistant backend for short trips, weekend getaways, and smart routing.",
    version="1.0.0"
)

# CORS configuration allowing mobile wrapper & web origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# --- Pydantic Request/Response Models ---

EMAIL_REGEX = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"

class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=50)
    email: str = Field(..., min_length=5, max_length=100)
    password: str = Field(..., min_length=6, max_length=100)

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(EMAIL_REGEX, v):
            raise ValueError("Invalid email format.")
        return v

class LoginRequest(BaseModel):
    email: str
    password: str

class RecommendationPreferences(BaseModel):
    starting_location: str = "Bengaluru"
    budget: float = Field(default=4000.0, ge=500.0, le=50000.0)
    available_time: str = "One day"
    travelers: int = Field(default=2, ge=1, le=20)
    transportation: str = "Car"
    travel_mood: str = "Relaxing"
    interests: List[str] = ["Nature", "Photography"]
    max_distance: float = Field(default=200.0, ge=10.0, le=500.0)
    food_preference: str = "No preference"
    cuisine_interest: str = "No preference"
    travel_period: str = "Flexible dates"
    user_lat: Optional[float] = None
    user_lon: Optional[float] = None

class ItineraryRequest(BaseModel):
    destination_id: int
    starting_location: str = "Bengaluru"
    available_time: str = "One day"
    transport_mode: str = "Car"
    food_preference: str = "No preference"
    travelers: int = 2

class BudgetRequest(BaseModel):
    destination_id: int
    travelers: int = 2
    transport_mode: str = "Car"
    target_budget: float = 4000.0

class BudgetOptimizeRequest(BaseModel):
    destination_id: int
    travelers: int = 2
    current_transport: str = "Car"
    target_budget: float = 4000.0

# Rate limiting tracker for chat (1 request per second per IP)
_chat_rate_limits: Dict[str, float] = {}

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)
    history: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    trip_data: Optional[Dict[str, Any]] = Field(default_factory=dict)
    context: Optional[Dict[str, Any]] = Field(default_factory=dict)

class FeedbackRequest(BaseModel):
    destination_id: int
    destination_name: str
    rating: int = Field(..., ge=1, le=5)
    comments: Optional[str] = ""
    preferences: Optional[Dict[str, Any]] = None
    language: str = "en"
    user_id: Optional[int] = None
    user_name: Optional[str] = "Traveler"

class SaveTripRequest(BaseModel):
    user_id: int
    destination_id: int
    destination_name: str
    starting_location: str = "Bengaluru"
    budget: float = 4000.0
    travel_mode: str = "Car"
    travelers: int = 2
    itinerary: List[Dict[str, Any]] = []
    cost_breakdown: Dict[str, Any] = {}

class RouteAnalyzeRequest(BaseModel):
    origin_name: str = "Bengaluru"
    origin_lat: Optional[float] = None
    origin_lon: Optional[float] = None
    destination_id: int
    mode: str = "Driving"

class NearbyExploreRequest(BaseModel):
    latitude: float
    longitude: float
    radius_km: float = Field(default=100.0, ge=5.0, le=400.0)

class TestEmailRequest(BaseModel):
    to_email: str
    subject: Optional[str] = "TravelMate AI — Development Email Test"
    custom_message: Optional[str] = None

    @field_validator("to_email")
    @classmethod
    def validate_to_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(EMAIL_REGEX, v):
            raise ValueError("Invalid recipient email format.")
        return v

# --- Endpoints ---

@app.get("/health", tags=["System"])
def health_check():
    """Health status and dataset telemetry."""
    try:
        df = load_destinations()
        dest_count = len(df)
        db_ok = True
    except Exception as e:
        dest_count = 0
        db_ok = False

    return {
        "status": "healthy" if db_ok else "degraded",
        "service": "TravelMate AI Backend",
        "version": "1.0.0",
        "destinations_loaded": dest_count,
        "database_connected": db_ok,
        "environment": "production" if os.environ.get("PRODUCTION") else "development"
    }

@app.get("/destinations", tags=["Destinations"])
def get_all_destinations():
    """Fetch complete catalog of 40 unique destinations."""
    df = load_destinations()
    return {"count": len(df), "destinations": df.to_dict(orient="records")}

@app.get("/destinations/{dest_id}", tags=["Destinations"])
def get_destination_by_id(dest_id: int):
    """Retrieve details for a single destination."""
    df = load_destinations()
    match = df[df["id"] == dest_id]
    if match.empty:
        raise HTTPException(status_code=404, detail="Destination not found")
    return match.iloc[0].to_dict()

@app.post("/recommendations", tags=["Recommendation Engine"])
def compute_recommendations(prefs: RecommendationPreferences):
    """Compute deterministic explainable recommendations based on 8 weighted factors."""
    result = get_recommendations(prefs.model_dump())
    return result

@app.post("/itinerary", tags=["Itinerary"])
def create_itinerary(req: ItineraryRequest):
    """Generate time-aware vertical timeline itinerary."""
    df = load_destinations()
    match = df[df["id"] == req.destination_id]
    if match.empty:
        raise HTTPException(status_code=404, detail="Destination not found")
    dest = match.iloc[0].to_dict()
    
    itinerary = generate_itinerary(
        destination=dest,
        starting_location=req.starting_location,
        available_time=req.available_time,
        transport_mode=req.transport_mode,
        food_preference=req.food_preference,
        travelers=req.travelers
    )
    return itinerary

@app.post("/budget", tags=["Budget"])
def get_budget_breakdown(req: BudgetRequest):
    """Calculate group and per-person cost breakdown."""
    df = load_destinations()
    match = df[df["id"] == req.destination_id]
    if match.empty:
        raise HTTPException(status_code=404, detail="Destination not found")
    dest = match.iloc[0].to_dict()
    
    breakdown = calculate_budget(
        distance_km=float(dest["distance_km"]),
        entry_fee=float(dest["entry_fee_estimate"]),
        travelers=req.travelers,
        transport_mode=req.transport_mode,
        user_budget=req.target_budget
    )
    return breakdown

@app.post("/budget/optimize", tags=["Budget"])
def optimize_trip_budget(req: BudgetOptimizeRequest):
    """'Make My Trip Cheaper' budget optimizer."""
    df = load_destinations()
    match = df[df["id"] == req.destination_id]
    if match.empty:
        raise HTTPException(status_code=404, detail="Destination not found")
    dest = match.iloc[0].to_dict()
    
    optimized = optimize_budget(
        distance_km=float(dest["distance_km"]),
        entry_fee=float(dest["entry_fee_estimate"]),
        travelers=req.travelers,
        current_transport=req.current_transport,
        user_budget=req.target_budget,
        supported_transports=str(dest.get("transport_options", "Bike, Car, Bus"))
    )
    return optimized

@app.post("/api/chat", tags=["AI Assistant"])
@app.post("/chat", tags=["AI Assistant"])
def chat_with_assistant(req: ChatRequest, request: Request):
    """
    Ask TravelMate conversational assistant (Google Gemini API with offline fallback).
    Enforces 1 request/sec rate limiting and 500 character limit.
    """
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    last_req_time = _chat_rate_limits.get(client_ip, 0)
    if now - last_req_time < 1.0:
        return {
            "reply": "Please wait a moment before sending another message.",
            "source": "rule_based_engine",
            "offline": True
        }
    _chat_rate_limits[client_ip] = now

    merged_context = dict(req.context or {})
    if req.trip_data:
        merged_context.update(req.trip_data)

    response = process_query(
        message=req.message,
        context=merged_context,
        history=req.history
    )
    return response

@app.post("/feedback", tags=["Feedback"])
def submit_feedback(fb: FeedbackRequest):
    """Store trip rating and review in SQLite database."""
    fb_id = save_feedback(fb.model_dump())
    return {"status": "success", "feedback_id": fb_id, "message": "Feedback submitted successfully. Thank you!"}

@app.get("/feedback/analytics", tags=["Feedback"])
def get_analytics():
    """Retrieve feedback analytics and ratings distributions."""
    analytics = get_feedback_analytics()
    return analytics

@app.post("/routes/analyze", tags=["Smart Maps"])
def route_journey(req: RouteAnalyzeRequest):
    """Analyze route between starting point and destination across travel modes."""
    df = load_destinations()
    match = df[df["id"] == req.destination_id]
    if match.empty:
        raise HTTPException(status_code=404, detail="Destination not found")
    dest = match.iloc[0].to_dict()
    
    route_data = analyze_route(
        origin_name=req.origin_name,
        origin_lat=req.origin_lat,
        origin_lon=req.origin_lon,
        dest_name=dest["name"],
        dest_lat=float(dest["latitude"]),
        dest_lon=float(dest["longitude"]),
        mode=req.mode
    )
    return route_data

@app.post("/explore/nearby", tags=["Smart Maps"])
def discover_nearby(req: NearbyExploreRequest):
    """Find destinations within radius from current location."""
    df = load_destinations()
    all_destinations = df.to_dict(orient="records")
    nearby = explore_near_me(
        user_lat=req.latitude,
        user_lon=req.longitude,
        radius_km=req.radius_km,
        destinations=all_destinations
    )
    return {"count": len(nearby), "radius_km": req.radius_km, "nearby_destinations": nearby}

# --- Authentication & Saved Trips Endpoints ---

@app.post("/auth/register", tags=["Authentication"])
def register(user_data: RegisterRequest):
    """Register new user account."""
    try:
        user = create_user(user_data.name, user_data.email, user_data.password)
        return {"status": "success", "user": user, "message": "Account created successfully!"}
    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=400, detail="An account with this email already exists.")
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

@app.post("/auth/login", tags=["Authentication"])
def login(creds: LoginRequest):
    """Authenticate existing user."""
    user = authenticate_user(creds.email, creds.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return {"status": "success", "user": user, "message": "Login successful!"}

@app.post("/trips/save", tags=["Saved Trips"])
def persist_trip(trip: SaveTripRequest):
    """Save trip for authenticated user."""
    user = get_user_by_id(trip.user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found or unauthenticated.")
    trip_id = save_trip(trip.user_id, trip.model_dump())
    return {"status": "success", "trip_id": trip_id, "message": "Trip saved to your profile!"}

@app.get("/trips/my", tags=["Saved Trips"])
def list_my_trips(user_id: int = Query(..., description="ID of authenticated user")):
    """Retrieve saved trips for authenticated user."""
    trips = get_user_trips(user_id)
    return {"count": len(trips), "trips": trips}

@app.delete("/trips/{trip_id}", tags=["Saved Trips"])
def remove_trip(trip_id: int, user_id: int = Query(..., description="ID of authenticated user")):
    """Delete a saved trip with ownership verification."""
    success = delete_user_trip(user_id, trip_id)
    if not success:
        raise HTTPException(status_code=404, detail="Trip not found or unauthorized.")
    return {"status": "success", "message": "Trip removed successfully."}

# --- Resend Email Testing Endpoints (Development Only) ---

@app.get("/email/status", tags=["Email Service"])
def email_status():
    """Retrieve Resend email service configuration and development telemetry."""
    return get_email_service_status()

@app.post("/email/test", tags=["Email Service"])
def test_email_dispatch(req: TestEmailRequest):
    """
    Dispatch a development test email using Resend and onboarding@resend.dev.
    Requires RESEND_API_KEY set on the server.
    Note: onboarding@resend.dev only delivers to the registered Resend account owner email.
    """
    html = build_test_email_html(req.to_email, test_type=req.custom_message or "API Development Test")
    result = send_email_via_resend(
        to_email=req.to_email,
        subject=req.subject or "TravelMate AI — Development Email Test",
        html_content=html
    )
    if not result.get("success"):
        raise HTTPException(
            status_code=400 if result.get("error_code") == "missing_api_key" else 502,
            detail=result
        )
    return result

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run("main:app", host=host, port=port)
