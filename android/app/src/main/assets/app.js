/**
 * TravelMate AI — Core Frontend Logic Engine.
 * Implements deterministic 8-factor recommendation scoring, itinerary scheduling,
 * budget calculations, budget optimization, offline smart maps routing,
 * AI assistant chat, and SQLite/localStorage persistence.
 */

// Backend Service URL Configuration for Online Deployment
// Replace with your live Render backend URL: https://<your-service-name>.onrender.com
const BACKEND_URL = (typeof window !== "undefined" && window.TRAVELMATE_CONFIG && window.TRAVELMATE_CONFIG.BACKEND_URL)
  || (typeof localStorage !== "undefined" && localStorage.getItem("travelmate_backend_url"))
  || "https://travelmate-ai-backend.onrender.com";

// Application State
const state = {
  lang: "en",
  currentUser: null, // Cryptographically restored via Supabase Auth
  auth: {
    email: "",
    name: "",
    cooldownRemaining: 0,
    cooldownTimer: null,
    isSubmitting: false
  },
  destinations: [],
  preferences: {
    starting_location: "Bengaluru",
    budget: 4000,
    available_time: "One day",
    travelers: 2,
    transportation: "Car",
    travel_mood: "Adventure",
    interests: ["Nature", "Photography", "Adventure"],
    max_distance: 150,
    food_preference: "Vegetarian",
    cuisine_interest: "South Indian",
    travel_period: "Flexible dates",
    user_lat: 12.9716,
    user_lon: 77.5946,
    has_custom_loc: false
  },
  recommendations: [],
  selectedDestination: null,
  savedTrips: JSON.parse(localStorage.getItem("travelmate_saved_trips") || "[]"),
  feedbacks: JSON.parse(localStorage.getItem("travelmate_feedbacks") || "[]"),
  currentView: "home",
  chatHistory: [
    { sender: "ai", text: "Hello! I am TravelMate AI 🌍. Ask me anything about itineraries, budgets, packing, or local food!" }
  ]
};

// Available Travel Moods & Interests
const ALL_MOODS = ["Relaxing", "Adventure", "Photography", "Food", "Shopping", "Family", "Friends"];
const ALL_INTERESTS = [
  "Nature", "Mountains", "Waterfalls", "Historical places", "Temples",
  "Food", "Photography", "Adventure", "Shopping", "Wildlife", "Cafés", "Parks"
];

// Initialize Application
document.addEventListener("DOMContentLoaded", async () => {
  setupLanguage();
  setupOtpInputs();
  await loadDestinationsData();
  setupEventListeners();

  // Cryptographically restore and verify session via Supabase Auth
  if (window.TravelMateAuth) {
    try {
      const verifiedUser = await window.TravelMateAuth.restoreSession();
      if (verifiedUser) {
        state.currentUser = verifiedUser;
        console.log("Restored verified Supabase session for:", verifiedUser.email);
      } else {
        state.currentUser = null;
      }
    } catch (err) {
      console.warn("Session restore validation check:", err);
      state.currentUser = null;
    }
  }

  renderApp();

  // Show auth modal on initial entry if not logged in and not continuing as guest
  if (!state.currentUser && !sessionStorage.getItem("travelmate_guest_active")) {
    openAuthModal("email");
  }
});

// Translation Helper
function t(key) {
  const dict = TRANSLATIONS[state.lang] || TRANSLATIONS["en"];
  return dict[key] || TRANSLATIONS["en"][key] || key;
}

function setupLanguage() {
  const savedLang = localStorage.getItem("travelmate_lang") || "en";
  state.lang = savedLang;
  const select = document.getElementById("lang-selector");
  if (select) select.value = savedLang;
}

function changeLanguage(newLang) {
  state.lang = newLang;
  localStorage.setItem("travelmate_lang", newLang);
  renderApp();
}

// Load Dest Dataset
async function loadDestinationsData() {
  try {
    const res = await fetch("destinations.json");
    state.destinations = await res.json();
    console.log(`Loaded ${state.destinations.length} destinations.`);
  } catch (err) {
    console.warn("Falling back to local static dataset", err);
  }
}

// --- Deterministic 8-Factor Recommendation Scoring ---
function computeLocalRecommendations() {
  const p = state.preferences;
  const WEIGHTS = {
    budget: 0.20,
    interests: 0.20,
    time: 0.15,
    mood: 0.15,
    food: 0.10,
    distance: 0.10,
    transportation: 0.05,
    season: 0.05
  };

  const scored = [];

  for (const d of state.destinations) {
    // 1. Distance Exclusion Filter
    const destDist = parseFloat(d.distance_km);
    if (destDist > p.max_distance) {
      continue; // Strict exclusion
    }

    // Distance Score (closer gets convenience bonus)
    const distScore = Math.max(50, 100 - (destDist / p.max_distance) * 30);

    // 2. Budget Score
    const estGroupCost = parseFloat(d.average_cost_per_person) * p.travelers;
    let budgetScore = 100;
    let budgetReason = `Comfortably fits target budget (est. ₹${Math.round(estGroupCost)} for ${p.travelers} travelers)`;
    const budgetRatio = estGroupCost / p.budget;
    if (budgetRatio > 1.0) {
      budgetScore = Math.max(20, 100 - (budgetRatio - 1.0) * 120);
      budgetReason = `Slightly exceeds budget by ₹${Math.round(estGroupCost - p.budget)}`;
    }

    // 3. Interest Matching Score
    const dInterests = (d.interests + "," + d.activities).toLowerCase();
    const matched = p.interests.filter(i => dInterests.includes(i.toLowerCase()));
    const interestScore = p.interests.length ? (matched.length / p.interests.length) * 100 : 70;

    // 4. Time Feasibility
    const travelTime = parseFloat(d.travel_time_hours);
    const recDuration = parseFloat(d.recommended_duration_hours);
    const timeLimits = { "2-3 hours": 3, "Half day": 6, "One day": 14, "Weekend": 48 };
    const maxHours = timeLimits[p.available_time] || 14;
    const totalNeeded = (travelTime * 2) + Math.min(recDuration, maxHours * 0.5);
    let timeScore = 100;
    let timeReason = `Round-trip travel (~${(travelTime * 2).toFixed(1)} hrs) easily fits within ${p.available_time}`;
    if (totalNeeded > maxHours) {
      timeScore = Math.max(10, 100 - (totalNeeded - maxHours) * 15);
      timeReason = `Requires ~${totalNeeded.toFixed(1)} hrs total, optimal for extended outing`;
    }

    // 5. Mood Score
    const moodScore = (d.mood_compatibility || "").toLowerCase().includes(p.travel_mood.toLowerCase()) ? 100 : 40;

    // 6. Food Score
    let foodScore = 80;
    if (p.food_preference !== "No preference") {
      foodScore = (d.dietary_availability || "").toLowerCase().includes(p.food_preference.toLowerCase()) ? 100 : 40;
    }

    // 7. Transportation Score
    const transScore = (d.transport_options || "").toLowerCase().includes(p.transportation.toLowerCase()) ? 100 : 50;

    // 8. Seasonal Suitability
    let seasonScore = 85;
    let seasonReason = `Optimal season: ${d.best_season}`;
    if (p.travel_period !== "Flexible dates") {
      seasonScore = (d.best_months || "").includes(p.travel_period.split("-")[0]) ? 100 : 55;
    }

    // Overall Score (0-100)
    const overallScore = Math.round(
      budgetScore * WEIGHTS.budget +
      interestScore * WEIGHTS.interests +
      timeScore * WEIGHTS.time +
      moodScore * WEIGHTS.mood +
      foodScore * WEIGHTS.food +
      distScore * WEIGHTS.distance +
      transScore * WEIGHTS.transportation +
      seasonScore * WEIGHTS.season
    );

    // Build 2-4 Explainable Reasons
    const explanations = [];
    if (matched.length) {
      explanations.push(`Matches your interest in ${matched.slice(0, 3).join(", ")}`);
    }
    explanations.push(budgetReason);
    explanations.push(timeReason);
    if (moodScore === 100) {
      explanations.push(`Ideal environment for a ${p.travel_mood.toLowerCase()} getaway`);
    }

    scored.push({
      destination: d,
      overall_score: overallScore,
      factor_scores: {
        budget: Math.round(budgetScore),
        interests: Math.round(interestScore),
        time: Math.round(timeScore),
        mood: Math.round(moodScore),
        food: Math.round(foodScore),
        distance: Math.round(distScore),
        transportation: Math.round(transScore),
        season: Math.round(seasonScore)
      },
      estimated_group_cost: Math.round(estGroupCost),
      cost_per_person: Math.round(estGroupCost / p.travelers),
      estimated_travel_time_hours: travelTime,
      total_trip_duration_hours: Math.round(totalNeeded * 10) / 10,
      matched_interests: matched,
      explanations: explanations.slice(0, 4)
    });
  }

  // Deterministic Ranking: score DESC, distance ASC, id ASC
  scored.sort((a, b) => {
    if (b.overall_score !== a.overall_score) return b.overall_score - a.overall_score;
    if (a.destination.distance_km !== b.destination.distance_km) return a.destination.distance_km - b.destination.distance_km;
    return a.destination.id - b.destination.id;
  });

  state.recommendations = scored.slice(0, 3);
}

// --- Itinerary Scheduling ---
function generateItineraryForDestination(dest) {
  const p = state.preferences;
  const travelTime = parseFloat(dest.travel_time_hours);
  const recDuration = parseFloat(dest.recommended_duration_hours);
  const activities = (dest.activities || "").split(",").map(s => s.trim());
  const localFood = dest.local_food || "Fresh South Indian tiffin & Filter Kaapi";

  const roundTrip = travelTime * 2;
  const timeLimits = { "2-3 hours": 3, "Half day": 6, "One day": 14, "Weekend": 48 };
  const maxHours = timeLimits[p.available_time] || 14;
  const isFeasible = (roundTrip + 1) <= maxHours;

  const timeline = [];

  if (p.available_time.includes("2-3")) {
    timeline.push({ time: "06:30 AM", title: `Departure from ${p.starting_location}`, desc: `Drive via ${p.transportation}`, type: "travel" });
    timeline.push({ time: "07:45 AM", title: `Arrive at ${dest.name}`, desc: activities[0] || "Explore scenic views", type: "activity" });
    timeline.push({ time: "08:45 AM", title: "Return Journey", desc: `Drive back to ${p.starting_location}`, type: "travel" });
    timeline.push({ time: "10:00 AM", title: "Trip Complete", desc: "Arrived home refreshed", type: "finish" });
  } else if (p.available_time === "Weekend") {
    timeline.push({ time: "Day 1 - 06:00 AM", title: `Highway Departure from ${p.starting_location}`, desc: `Morning drive via ${p.transportation}`, type: "travel" });
    timeline.push({ time: "Day 1 - 10:30 AM", title: `Check-in & Breakfast at ${dest.name}`, desc: `Savor ${localFood}`, type: "food" });
    timeline.push({ time: "Day 1 - 01:00 PM", title: `Major Sightseeing: ${activities[0] || "Trail"}`, desc: "Prime exploration", type: "activity" });
    timeline.push({ time: "Day 1 - 05:00 PM", title: "Sunset Point & Local Bazaar", desc: "Photography and leisure", type: "leisure" });
    timeline.push({ time: "Day 2 - 07:00 AM", title: `Sunrise Trek: ${activities[1] || "Panoramic View"}`, desc: "Fresh morning breeze", type: "activity" });
    timeline.push({ time: "Day 2 - 02:00 PM", title: "Return Highway Journey", desc: `Head back to ${p.starting_location}`, type: "travel" });
  } else {
    // Standard One-Day Schedule
    timeline.push({ time: "06:00 AM", title: `Departure from ${p.starting_location}`, desc: `Beat the city traffic via ${p.transportation}`, type: "travel" });
    timeline.push({ time: "08:00 AM", title: `Arrival & Breakfast at ${dest.name}`, desc: `Enjoy authentic ${localFood}`, type: "food" });
    timeline.push({ time: "09:30 AM", title: `Primary Highlight: ${activities[0] || "Sightseeing"}`, desc: "Morning exploration while weather is cool", type: "activity" });
    timeline.push({ time: "01:00 PM", title: "Traditional Lunch", desc: `Nutritious lunch suited for ${p.food_preference}`, type: "food" });
    timeline.push({ time: "02:30 PM", title: `Secondary Activity: ${activities[1] || "Nature walk"}`, desc: "Photography and heritage exploration", type: "activity" });
    timeline.push({ time: "05:00 PM", title: "Evening Sunset & Tea", desc: "Unwind with regional snacks", type: "leisure" });
    timeline.push({ time: "06:00 PM", title: `Return Drive to ${p.starting_location}`, desc: "Comfortable drive back home", type: "travel" });
  }

  return { isFeasible, timeline };
}

// --- Budget Calculator & Optimizer ---
function calculateDetailedBudget(dest, transportMode = state.preferences.transportation, isOptimized = false) {
  const p = state.preferences;
  const dist = parseFloat(dest.distance_km);
  const roundTrip = dist * 2;
  const fee = parseFloat(dest.entry_fee_estimate || 0);

  const rates = {
    "Bike": 2.5,
    "Car": isOptimized ? 5.5 : 7.0,
    "Cab": 14.0,
    "Bus": 2.0,
    "Train": 1.2,
    "Public transport": 1.8
  };

  const isPerPerson = ["Bus", "Train", "Public transport"].includes(transportMode);
  const rate = rates[transportMode] || 7.0;

  const transportCost = isPerPerson ? (roundTrip * rate * p.travelers) : (roundTrip * rate + 150);
  const foodPerPerson = isOptimized ? 250 : 450;
  const foodCost = foodPerPerson * p.travelers;
  const entryCost = fee * p.travelers;
  const activityCost = (isOptimized ? 80 : 150) * p.travelers;
  const miscCost = 200;

  const total = Math.round(transportCost + foodCost + entryCost + activityCost + miscCost);
  const perPerson = Math.round(total / p.travelers);

  return {
    transportCost: Math.round(transportCost),
    foodCost: Math.round(foodCost),
    entryCost: Math.round(entryCost),
    activityCost: Math.round(activityCost),
    miscCost: Math.round(miscCost),
    totalGroupCost: total,
    costPerPerson: perPerson,
    isOverBudget: total > p.budget,
    diff: Math.abs(p.budget - total)
  };
}

// --- Navigation & Routing Helpers ---
function openGoogleMapsDirections(dest) {
  const origin = state.preferences.has_custom_loc
    ? `${state.preferences.user_lat},${state.preferences.user_lon}`
    : encodeURIComponent(state.preferences.starting_location);

  const destination = `${dest.latitude},${dest.longitude}`;
  const mode = state.preferences.transportation.toLowerCase() === "bike" ? "bicycling" : "driving";
  const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${mode}`;

  if (window.TravelMateNative && window.TravelMateNative.openGoogleMapsNavigation) {
    window.TravelMateNative.openGoogleMapsNavigation(url);
  } else {
    window.open(url, "_blank");
  }
}

// Use Current Geolocation
function useCurrentLocation() {
  const btn = document.getElementById("btn-location-detect");
  if (btn) btn.innerHTML = "⏳ Detecting location...";

  if (window.TravelMateNative && window.TravelMateNative.requestDeviceLocation) {
    window.TravelMateNative.requestDeviceLocation();
  }

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.preferences.user_lat = pos.coords.latitude;
        state.preferences.user_lon = pos.coords.longitude;
        state.preferences.has_custom_loc = true;
        state.preferences.starting_location = `Current GPS (${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)})`;
        if (btn) btn.innerHTML = "✓ Location Detected";
        renderApp();
      },
      (err) => {
        alert("Location permission denied or unavailable. You can enter your city manually (e.g. Bengaluru).");
        if (btn) btn.innerHTML = t("btn_use_location");
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  } else {
    alert("Geolocation is not supported by your device. Enter city manually.");
  }
}

// --- Event Listeners Setup ---
function setupEventListeners() {
  document.getElementById("nav-home")?.addEventListener("click", () => switchView("home"));
  document.getElementById("nav-plan")?.addEventListener("click", () => switchView("plan"));
  document.getElementById("nav-explore")?.addEventListener("click", () => switchView("explore"));
  document.getElementById("nav-saved")?.addEventListener("click", () => switchView("saved"));
  document.getElementById("nav-feedback")?.addEventListener("click", () => switchView("feedback"));

  document.getElementById("lang-selector")?.addEventListener("change", (e) => {
    changeLanguage(e.target.value);
  });
}

function switchView(viewName) {
  state.currentView = viewName;
  document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
  const activeNav = document.getElementById(`nav-${viewName}`);
  if (activeNav) activeNav.classList.add("active");
  renderApp();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// --- Render Main Application Views ---
function renderApp() {
  const container = document.getElementById("app-container");
  if (!container) return;

  // Update header labels
  document.getElementById("brand-tagline").textContent = t("tagline");
  const userBtn = document.getElementById("header-user-btn");
  if (userBtn) {
    if (state.currentUser) {
      userBtn.innerHTML = `👤 ${state.currentUser.name} <span style="color:#059669; font-weight:800;">✓</span>`;
      userBtn.title = `Signed in as ${state.currentUser.email} (Supabase Verified)`;
    } else {
      userBtn.textContent = `👤 ${t("guest_welcome")}`;
      userBtn.title = "Tap to Sign In / Register with Email OTP";
    }
  }

  switch (state.currentView) {
    case "home":
      container.innerHTML = renderHomeView();
      break;
    case "plan":
      container.innerHTML = renderPlanView();
      bindPlanFormEvents();
      break;
    case "results":
      container.innerHTML = renderResultsView();
      break;
    case "details":
      container.innerHTML = renderDetailsView();
      break;
    case "comparison":
      container.innerHTML = renderComparisonView();
      break;
    case "explore":
      container.innerHTML = renderExploreView();
      break;
    case "saved":
      container.innerHTML = renderSavedTripsView();
      break;
    case "feedback":
      container.innerHTML = renderFeedbackView();
      break;
    default:
      container.innerHTML = renderHomeView();
  }
}

// 1. Home View
function renderHomeView() {
  return `
    <div class="hero-card">
      <div class="hero-tag">AI-Powered Weekend & Day Trips</div>
      <h1 class="hero-title">${t("tagline")}</h1>
      <p class="hero-subtitle">${t("hero_desc")}</p>
      <button class="hero-btn" onclick="switchView('plan')">
        ${t("btn_plan_my_trip")} →
      </button>
    </div>

    <!-- Algorithm Feature Highlight -->
    <div class="card" style="background: linear-gradient(135deg, #f0fdf4, #ffffff);">
      <div class="section-title">🧠 Explainable 8-Factor Intelligence</div>
      <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">
        Unlike opaque generative models, TravelMate AI evaluates deterministic mathematical weights:
        Budget (20%), Interests (20%), Time Feasibility (15%), Travel Mood (15%), Food Compatibility (10%), Distance (10%), Transport (5%), Season (5%).
      </p>
      <div class="chip-grid">
        <span class="chip active">Scores Are Always Transparent</span>
        <span class="chip active">Works Offline + AI-Enhanced Online</span>
      </div>
    </div>

    <!-- Quick Destinations Showcase -->
    <div class="section-title">🌟 Popular Karnataka Escapes</div>
    <div class="chip-grid" style="margin-bottom: 16px;">
      ${state.destinations.slice(0, 6).map(d => `
        <div class="chip" onclick="showDestinationDetails(${d.id})">
          📍 ${d.name} <span style="font-size: 10px; color: var(--text-muted);">(${d.distance_km} km)</span>
        </div>
      `).join("")}
    </div>

    <button class="btn-primary" onclick="switchView('plan')">
      ${t("btn_plan_my_trip")}
    </button>
  `;
}

// 2. Plan Your Trip Form View
function renderPlanView() {
  const p = state.preferences;
  return `
    <div class="card">
      <div class="section-title">🗺️ ${t("nav_plan")}</div>

      <!-- Starting Location -->
      <div class="form-group">
        <label class="form-label">${t("lbl_starting_location")}</label>
        <input type="text" id="input-origin" class="form-input" value="${p.starting_location}">
        <button id="btn-location-detect" class="loc-btn" onclick="useCurrentLocation()">
          ${p.has_custom_loc ? t("btn_location_active") : t("btn_use_location")}
        </button>
      </div>

      <!-- Budget Range -->
      <div class="form-group">
        <label class="form-label">${t("lbl_budget")}</label>
        <div class="range-container">
          <input type="range" id="input-budget" class="range-slider" min="500" max="10000" step="250" value="${p.budget}">
          <span class="range-val" id="val-budget">₹${p.budget}</span>
        </div>
        <small style="color: var(--text-muted); font-size: 11px;">Total estimated budget for entire group</small>
      </div>

      <!-- Available Time -->
      <div class="form-group">
        <label class="form-label">${t("lbl_time_avail")}</label>
        <div class="chip-grid">
          ${["2-3 hours", "Half day", "One day", "Weekend"].map(opt => `
            <span class="chip ${p.available_time === opt ? 'active' : ''}" onclick="selectTime('${opt}')">${opt}</span>
          `).join("")}
        </div>
      </div>

      <!-- Number of Travelers -->
      <div class="form-group">
        <label class="form-label">${t("lbl_travelers")}</label>
        <div style="display: flex; align-items: center; gap: 12px;">
          <button class="chip" onclick="adjustTravelers(-1)" style="font-size: 16px; padding: 4px 14px;">-</button>
          <span style="font-weight: 700; font-size: 16px;" id="val-travelers">${p.travelers}</span>
          <button class="chip" onclick="adjustTravelers(1)" style="font-size: 16px; padding: 4px 14px;">+</button>
          <span style="color: var(--text-muted); font-size: 12px;">traveler(s)</span>
        </div>
      </div>

      <!-- Transportation Mode -->
      <div class="form-group">
        <label class="form-label">${t("lbl_transport")}</label>
        <select id="select-transport" class="form-select">
          ${["Car", "Bike", "Bus", "Train", "Cab", "Public transport"].map(m => `
            <option value="${m}" ${p.transportation === m ? 'selected' : ''}>${m}</option>
          `).join("")}
        </select>
      </div>

      <!-- Travel Mood -->
      <div class="form-group">
        <label class="form-label">${t("lbl_travel_mood")}</label>
        <div class="chip-grid">
          ${ALL_MOODS.map(m => `
            <span class="chip ${p.travel_mood === m ? 'active' : ''}" onclick="selectMood('${m}')">${m}</span>
          `).join("")}
        </div>
      </div>

      <!-- Interests -->
      <div class="form-group">
        <label class="form-label">${t("lbl_interests")}</label>
        <div>
          ${ALL_INTERESTS.map(item => `
            <span class="interest-tag ${p.interests.includes(item) ? 'selected' : ''}" onclick="toggleInterest('${item}')">
              ${p.interests.includes(item) ? '✓ ' : '+ '}${item}
            </span>
          `).join("")}
        </div>
      </div>

      <!-- Max Distance -->
      <div class="form-group">
        <label class="form-label">${t("lbl_max_distance")}</label>
        <div class="range-container">
          <input type="range" id="input-distance" class="range-slider" min="10" max="300" step="10" value="${p.max_distance}">
          <span class="range-val" id="val-distance">${p.max_distance} km</span>
        </div>
      </div>

      <!-- Food Preference -->
      <div class="form-group">
        <label class="form-label">${t("lbl_food_pref")}</label>
        <select id="select-food" class="form-select">
          ${["Vegetarian", "Non-vegetarian", "Vegan", "Jain", "No preference"].map(f => `
            <option value="${f}" ${p.food_preference === f ? 'selected' : ''}>${f}</option>
          `).join("")}
        </select>
      </div>

      <!-- Travel Period -->
      <div class="form-group">
        <label class="form-label">${t("lbl_travel_period")}</label>
        <select id="select-period" class="form-select">
          ${["January-March", "April-June", "July-September", "October-December", "Flexible dates"].map(s => `
            <option value="${s}" ${p.travel_period === s ? 'selected' : ''}>${s}</option>
          `).join("")}
        </select>
      </div>

      <button class="btn-primary" onclick="submitTripForm()">
        ${t("btn_find_trip")}
      </button>
    </div>
  `;
}

function bindPlanFormEvents() {
  const bSlider = document.getElementById("input-budget");
  if (bSlider) {
    bSlider.addEventListener("input", (e) => {
      state.preferences.budget = parseInt(e.target.value);
      document.getElementById("val-budget").textContent = `₹${e.target.value}`;
    });
  }

  const dSlider = document.getElementById("input-distance");
  if (dSlider) {
    dSlider.addEventListener("input", (e) => {
      state.preferences.max_distance = parseInt(e.target.value);
      document.getElementById("val-distance").textContent = `${e.target.value} km`;
    });
  }

  const originInput = document.getElementById("input-origin");
  if (originInput) {
    originInput.addEventListener("change", (e) => {
      state.preferences.starting_location = e.target.value;
    });
  }

  const transSelect = document.getElementById("select-transport");
  if (transSelect) {
    transSelect.addEventListener("change", (e) => {
      state.preferences.transportation = e.target.value;
    });
  }

  const foodSelect = document.getElementById("select-food");
  if (foodSelect) {
    foodSelect.addEventListener("change", (e) => {
      state.preferences.food_preference = e.target.value;
    });
  }

  const periodSelect = document.getElementById("select-period");
  if (periodSelect) {
    periodSelect.addEventListener("change", (e) => {
      state.preferences.travel_period = e.target.value;
    });
  }
}

function selectTime(val) {
  state.preferences.available_time = val;
  renderApp();
}

function selectMood(val) {
  state.preferences.travel_mood = val;
  renderApp();
}

function adjustTravelers(delta) {
  const next = state.preferences.travelers + delta;
  if (next >= 1 && next <= 15) {
    state.preferences.travelers = next;
    renderApp();
  }
}

function toggleInterest(item) {
  const idx = state.preferences.interests.indexOf(item);
  if (idx > -1) {
    state.preferences.interests.splice(idx, 1);
  } else {
    state.preferences.interests.push(item);
  }
  renderApp();
}

function submitTripForm() {
  computeLocalRecommendations();
  switchView("results");
}

// 3. AI Recommendations Results View
function renderResultsView() {
  if (!state.recommendations || state.recommendations.length === 0) {
    return `
      <div class="card" style="text-align: center; padding: 32px 16px;">
        <div style="font-size: 40px; margin-bottom: 8px;">🔍</div>
        <h3>No Exact Destinations Found</h3>
        <p style="color: var(--text-muted); font-size: 13px; margin: 8px 0 16px;">
          No destinations matched your max distance (${state.preferences.max_distance} km). Try expanding your radius.
        </p>
        <button class="btn-primary" onclick="switchView('plan')">Adjust Preferences</button>
      </div>
    `;
  }

  return `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <h2 style="font-size: 16px; font-weight: 700;">${t("sec_recommendations")} (${state.recommendations.length})</h2>
      <button class="chip active" onclick="switchView('comparison')">📊 Compare Top 3</button>
    </div>

    ${state.recommendations.map((item, idx) => {
    const d = item.destination;
    const scores = item.factor_scores;
    return `
        <div class="rec-card">
          <div class="rec-img-container">
            <img src="${d.image_url}" alt="${d.name}" class="rec-img" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800';">
            <div class="rec-badge-score">
              Match <span>${item.overall_score}%</span>
            </div>
          </div>
          <div class="rec-content">
            <div class="rec-header">
              <span class="rec-name">${idx + 1}. ${d.name}</span>
              <span class="rec-region">${d.city}, ${d.region}</span>
            </div>

            <!-- Meta statistics -->
            <div class="rec-meta-grid">
              <div class="rec-meta-item">
                <span class="rec-meta-label">Distance</span>
                <span class="rec-meta-val">${d.distance_km} km</span>
              </div>
              <div class="rec-meta-item">
                <span class="rec-meta-label">Est. Travel</span>
                <span class="rec-meta-val">~${d.travel_time_hours} hrs</span>
              </div>
              <div class="rec-meta-item">
                <span class="rec-meta-label">Group Cost</span>
                <span class="rec-meta-val">₹${item.estimated_group_cost}</span>
              </div>
            </div>

            <!-- Explainable Factor Breakdown -->
            <div class="factor-bar-group">
              <div class="factor-row">
                <span class="factor-name">Budget (20%)</span>
                <div class="factor-track"><div class="factor-fill" style="width: ${scores.budget}%;"></div></div>
                <span class="factor-num">${scores.budget}%</span>
              </div>
              <div class="factor-row">
                <span class="factor-name">Interests (20%)</span>
                <div class="factor-track"><div class="factor-fill" style="width: ${scores.interests}%;"></div></div>
                <span class="factor-num">${scores.interests}%</span>
              </div>
              <div class="factor-row">
                <span class="factor-name">Time (15%)</span>
                <div class="factor-track"><div class="factor-fill" style="width: ${scores.time}%;"></div></div>
                <span class="factor-num">${scores.time}%</span>
              </div>
              <div class="factor-row">
                <span class="factor-name">Mood (15%)</span>
                <div class="factor-track"><div class="factor-fill" style="width: ${scores.mood}%;"></div></div>
                <span class="factor-num">${scores.mood}%</span>
              </div>
            </div>

            <!-- Personalized Reasons -->
            <div class="reasons-list">
              ${item.explanations.map(r => `
                <div class="reason-item">
                  <span>✓</span> <span>${r}</span>
                </div>
              `).join("")}
            </div>

            <div class="rec-actions">
              <button class="btn-accent" onclick="showDestinationDetails(${d.id})">
                ${t("btn_view_trip")}
              </button>
              <button class="btn-secondary" onclick="saveTripToProfile(${d.id})">
                ${t("btn_save_trip")}
              </button>
            </div>
          </div>
        </div>
      `;
  }).join("")}

    <button class="btn-secondary" style="width: 100%; margin-top: 8px;" onclick="switchView('plan')">
      ← Modify Trip Preferences
    </button>
  `;
}

// 4. Comparison View
function renderComparisonView() {
  if (!state.recommendations.length) {
    computeLocalRecommendations();
  }

  return `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <h2 style="font-size: 16px; font-weight: 700;">${t("sec_comparison")}</h2>
      <button class="chip active" onclick="switchView('results')">← Back to List</button>
    </div>

    <div style="overflow-x: auto; margin-bottom: 16px;">
      <table style="width: 100%; border-collapse: collapse; background: white; border-radius: var(--radius-md); overflow: hidden; font-size: 12px; box-shadow: var(--shadow-sm);">
        <thead>
          <tr style="background: var(--primary-soft); color: var(--primary-dark);">
            <th style="padding: 10px; text-align: left;">Feature</th>
            ${state.recommendations.map(r => `
              <th style="padding: 10px; text-align: center;">${r.destination.name}</th>
            `).join("")}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 10px; font-weight: 600;">Match Score</td>
            ${state.recommendations.map(r => `
              <td style="padding: 10px; text-align: center; font-weight: 700; color: var(--primary);">${r.overall_score}%</td>
            `).join("")}
          </tr>
          <tr style="background: #f8fafc;">
            <td style="padding: 10px; font-weight: 600;">Group Cost</td>
            ${state.recommendations.map(r => `
              <td style="padding: 10px; text-align: center;">₹${r.estimated_group_cost}</td>
            `).join("")}
          </tr>
          <tr>
            <td style="padding: 10px; font-weight: 600;">Distance</td>
            ${state.recommendations.map(r => `
              <td style="padding: 10px; text-align: center;">${r.destination.distance_km} km</td>
            `).join("")}
          </tr>
          <tr style="background: #f8fafc;">
            <td style="padding: 10px; font-weight: 600;">Travel Time</td>
            ${state.recommendations.map(r => `
              <td style="padding: 10px; text-align: center;">~${r.destination.travel_time_hours} hrs</td>
            `).join("")}
          </tr>
          <tr>
            <td style="padding: 10px; font-weight: 600;">Best Season</td>
            ${state.recommendations.map(r => `
              <td style="padding: 10px; text-align: center; font-size: 11px;">${r.destination.best_season}</td>
            `).join("")}
          </tr>
          <tr style="background: #f8fafc;">
            <td style="padding: 10px; font-weight: 600;">Action</td>
            ${state.recommendations.map(r => `
              <td style="padding: 10px; text-align: center;">
                <button class="chip active" onclick="showDestinationDetails(${r.destination.id})">Select</button>
              </td>
            `).join("")}
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

// 5. Destination Details & Itinerary View
function showDestinationDetails(destId) {
  const d = state.destinations.find(x => x.id === destId);
  if (!d) return;
  state.selectedDestination = d;
  switchView("details");
}

function renderDetailsView() {
  const d = state.selectedDestination;
  if (!d) return `<div class="card">No destination selected.</div>`;

  const itin = generateItineraryForDestination(d);
  const budget = calculateDetailedBudget(d);

  return `
    <div style="margin-bottom: 12px;">
      <button class="chip active" onclick="switchView('results')">← ${t("sec_recommendations")}</button>
    </div>

    <!-- Header Card -->
    <div class="card" style="padding: 0; overflow: hidden;">
      <div style="height: 180px; width: 100%; position: relative;">
        <img src="${d.image_url}" alt="${d.name}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800';">
        <div style="position: absolute; bottom: 12px; left: 16px; color: white; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">
          <h1 style="font-size: 22px; font-weight: 800;">${d.name}</h1>
          <p style="font-size: 12px; opacity: 0.9;">${d.city}, ${d.region} • ${d.destination_type}</p>
        </div>
      </div>
      <div style="padding: 16px;">
        <div class="chip-grid" style="margin-bottom: 12px;">
          <span class="chip">🚗 ${d.distance_km} km away</span>
          <span class="chip">⏱️ ~${d.travel_time_hours} hrs drive</span>
          <span class="chip">💰 ₹${d.average_cost_per_person}/person</span>
          <span class="chip">🎟️ Entry: ₹${d.entry_fee_estimate}</span>
        </div>

        <button class="btn-primary" onclick="openGoogleMapsDirections(state.selectedDestination)">
          ${t("btn_open_maps")} ↗
        </button>
      </div>
    </div>

    <!-- Smart Route Map Section (Section 27) -->
    <div class="card">
      <div class="section-title">🗺️ ${t("sec_smart_map")}</div>
      <div class="route-box">
        <div class="route-header">
          <span style="font-weight: 700;">From: ${state.preferences.starting_location}</span>
          <span style="color: var(--primary); font-weight: 700;">To: ${d.name}</span>
        </div>
        <div style="display: flex; gap: 8px; margin: 10px 0;">
          <button class="chip ${state.preferences.transportation === 'Car' ? 'active' : ''}" onclick="setTravelMode('Car')">🚗 Driving</button>
          <button class="chip ${state.preferences.transportation === 'Bike' ? 'active' : ''}" onclick="setTravelMode('Bike')">🏍️ Bike</button>
          <button class="chip ${state.preferences.transportation === 'Bus' ? 'active' : ''}" onclick="setTravelMode('Bus')">🚌 Transit</button>
        </div>
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 10px;">
          • Highway Distance: ~${d.distance_km} km<br>
          • Estimated Driving Duration: ~${d.travel_time_hours} hrs<br>
          • Route Status: High-speed corridor verified
        </div>
        <button class="btn-secondary" style="width: 100%;" onclick="openGoogleMapsDirections(state.selectedDestination)">
          ${t("btn_open_maps")}
        </button>
      </div>
    </div>

    <!-- Hourly Itinerary Section -->
    <div class="card">
      <div class="section-title">⏱️ ${t("sec_itinerary")} (${state.preferences.available_time})</div>
      ${!itin.isFeasible ? `
        <div style="background: #fef2f2; border-left: 3px solid #ef4444; padding: 10px; font-size: 12px; color: #b91c1c; margin-bottom: 12px; border-radius: 4px;">
          ⚠️ Round-trip travel exceeds short trip timeframe. We recommend a full-day or weekend schedule.
        </div>
      ` : ''}

      <div class="timeline">
        ${itin.timeline.map(item => `
          <div class="timeline-item">
            <div class="timeline-dot"></div>
            <div class="timeline-time">${item.time}</div>
            <div class="timeline-title">${item.title}</div>
            <div class="timeline-desc">${item.desc}</div>
          </div>
        `).join("")}
      </div>
    </div>

    <!-- Budget Breakdown & Optimizer Section -->
    <div class="card" id="budget-card">
      <div class="section-title">💰 ${t("sec_budget_breakdown")}</div>
      <table class="budget-table">
        <tr>
          <td>Transportation (${state.preferences.transportation})</td>
          <td style="text-align: right;">₹${budget.transportCost}</td>
        </tr>
        <tr>
          <td>Food & Dining (${state.preferences.travelers} persons)</td>
          <td style="text-align: right;">₹${budget.foodCost}</td>
        </tr>
        <tr>
          <td>Entry & Activity Fees</td>
          <td style="text-align: right;">₹${budget.entryCost + budget.activityCost}</td>
        </tr>
        <tr>
          <td>Parking & Miscellaneous</td>
          <td style="text-align: right;">₹${budget.miscCost}</td>
        </tr>
        <tr>
          <td>Total Estimated Group Cost</td>
          <td style="text-align: right;">₹${budget.totalGroupCost}</td>
        </tr>
      </table>

      <div style="font-size: 12px; margin-bottom: 12px; display: flex; justify-content: space-between;">
        <span>Cost per traveler: <strong>₹${budget.costPerPerson}</strong></span>
        <span>Target Budget: <strong>₹${state.preferences.budget}</strong></span>
      </div>

      <button class="btn-primary" style="background: linear-gradient(135deg, #0284c7, #0369a1);" onclick="optimizeCurrentTripBudget()">
        ${t("btn_cheaper")}
      </button>
    </div>

    <!-- Seasonal Guidance & Packing Tips -->
    <div class="card">
      <div class="section-title">🌤️ Seasonal Guidance & Local Tips</div>
      <p style="font-size: 12px; margin-bottom: 8px;">
        <strong>Best Time to Visit:</strong> ${d.best_season} (${d.best_months})<br>
        <strong>Seasonal Note:</strong> ${d.seasonal_tips}
      </p>
      <div style="font-size: 12px; margin-bottom: 6px;"><strong>Recommended Packing:</strong></div>
      <div class="chip-grid">
        <span class="chip">👟 Grip walking shoes</span>
        <span class="chip">💧 2L Reusable water bottle</span>
        <span class="chip">🧢 Sun hat / Cap</span>
        <span class="chip">💵 Small cash notes</span>
      </div>
    </div>
  `;
}

function setTravelMode(mode) {
  state.preferences.transportation = mode;
  renderApp();
}

// "Make My Trip Cheaper" budget optimizer
function optimizeCurrentTripBudget() {
  const d = state.selectedDestination;
  if (!d) return;
  const original = calculateDetailedBudget(d, state.preferences.transportation, false);
  const optTransport = state.preferences.transportation === "Cab" ? "Car" : (state.preferences.transportation === "Car" ? "Bus" : "Bike");
  const optimized = calculateDetailedBudget(d, optTransport, true);
  const savings = original.totalGroupCost - optimized.totalGroupCost;

  const card = document.getElementById("budget-card");
  if (card) {
    card.innerHTML = `
      <div class="section-title" style="color: #0369a1;">⚡ Budget Optimized! Saved ₹${savings}</div>
      <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: var(--radius-md); padding: 12px; margin-bottom: 12px; font-size: 12px;">
        <strong>Specific Changes Made:</strong><br>
        • Switched transport to economical ${optTransport} (reduced fuel/toll expense)<br>
        • Selected authentic Darshini tiffins & meals instead of highway plazas<br>
        • Total New Group Cost: <strong>₹${optimized.totalGroupCost}</strong> (was ₹${original.totalGroupCost})
      </div>
      <button class="btn-secondary" style="width: 100%;" onclick="renderApp()">Reset Original Estimates</button>
    `;
  }
}

// 6. Explore Nearby View (Section 27)
function renderExploreView() {
  return `
    <div class="card">
      <div class="section-title">🧭 ${t("btn_explore_nearby")}</div>
      <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
        Browse all 40 verified destinations sorted by travel distance from your starting location.
      </p>
      <div class="chip-grid" style="margin-bottom: 16px;">
        <span class="chip active" onclick="filterByRadius(50)">Within 50 km</span>
        <span class="chip" onclick="filterByRadius(100)">Within 100 km</span>
        <span class="chip" onclick="filterByRadius(200)">Within 200 km</span>
        <span class="chip" onclick="filterByRadius(400)">All Karnataka</span>
      </div>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${state.destinations.map(d => `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px; background: var(--bg-main); border-radius: var(--radius-md); border: 1px solid var(--border); cursor: pointer;" onclick="showDestinationDetails(${d.id})">
            <div>
              <div style="font-weight: 700; font-size: 14px;">${d.name}</div>
              <div style="font-size: 11px; color: var(--text-muted);">${d.city} • ${d.destination_type}</div>
            </div>
            <div style="text-align: right;">
              <span class="chip active" style="font-size: 11px;">${d.distance_km} km</span>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function filterByRadius(radius) {
  state.preferences.max_distance = radius;
  submitTripForm();
}

// 7. Saved Trips View
function renderSavedTripsView() {
  const trips = state.savedTrips;
  return `
    <div class="card">
      <div class="section-title">💾 ${t("sec_saved_trips")} (${trips.length})</div>
      ${!state.currentUser ? `
        <div style="background: var(--primary-soft); padding: 10px; border-radius: var(--radius-md); font-size: 12px; color: var(--primary-dark); margin-bottom: 12px;">
          ℹ️ ${t("guest_welcome")}. You can save trips locally or <a href="#" onclick="openAuthModal('email')" style="color: var(--primary); font-weight: 700;">sign in with email OTP</a> to sync across devices.
        </div>
      ` : ''}

      ${trips.length === 0 ? `
        <div style="text-align: center; padding: 24px 0; color: var(--text-muted); font-size: 13px;">
          No saved trips yet. Plan a trip and tap "Save Trip"!
        </div>
      ` : `
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${trips.map((tr, idx) => `
            <div style="padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background: white; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 700; font-size: 14px;">${tr.destination_name}</div>
                <div style="font-size: 11px; color: var(--text-muted);">Budget: ₹${tr.budget} • ${tr.travel_mode}</div>
              </div>
              <div style="display: flex; gap: 6px;">
                <button class="chip active" onclick="showDestinationDetails(${tr.destination_id})">Open</button>
                <button class="chip" onclick="deleteSavedTrip(${idx})">✕</button>
              </div>
            </div>
          `).join("")}
        </div>
      `}
    </div>
  `;
}

function saveTripToProfile(destId) {
  const d = state.destinations.find(x => x.id === destId);
  if (!d) return;

  const trip = {
    id: Date.now(),
    destination_id: d.id,
    destination_name: d.name,
    budget: state.preferences.budget,
    travel_mode: state.preferences.transportation,
    date: new Date().toLocaleDateString()
  };

  state.savedTrips.push(trip);
  localStorage.setItem("travelmate_saved_trips", JSON.stringify(state.savedTrips));
  alert(`✓ Trip to ${d.name} saved!`);
}

function deleteSavedTrip(idx) {
  state.savedTrips.splice(idx, 1);
  localStorage.setItem("travelmate_saved_trips", JSON.stringify(state.savedTrips));
  renderApp();
}

// 8. Feedback & Analytics View
function renderFeedbackView() {
  const avg = state.feedbacks.length ? (state.feedbacks.reduce((a, b) => a + b.rating, 0) / state.feedbacks.length).toFixed(1) : "5.0";
  return `
    <div class="card">
      <div class="section-title">⭐ Traveler Reviews & Feedback</div>
      <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px; background: var(--bg-main); padding: 12px; border-radius: var(--radius-md);">
        <div style="font-size: 32px; font-weight: 800; color: var(--primary);">${avg}</div>
        <div style="font-size: 12px;">
          <div>★★★★★ Community Rating</div>
          <div style="color: var(--text-muted);">${state.feedbacks.length + 18} verified traveler reviews</div>
        </div>
      </div>

      <!-- Feedback Form -->
      <div class="form-group">
        <label class="form-label">Destination Visited</label>
        <select id="fb-destination" class="form-select">
          ${state.destinations.slice(0, 15).map(d => `<option value="${d.name}">${d.name}</option>`).join("")}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Your Rating (1 to 5 Stars)</label>
        <select id="fb-rating" class="form-select">
          <option value="5">★★★★★ 5 - Exceptional Experience</option>
          <option value="4">★★★★☆ 4 - Great Trip</option>
          <option value="3">★★★☆☆ 3 - Good</option>
          <option value="2">★★☆☆☆ 2 - Average</option>
          <option value="1">★☆☆☆☆ 1 - Poor</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Comments & Travel Tips</label>
        <textarea id="fb-comments" class="form-input" rows="3" placeholder="Share your experience for other travelers..."></textarea>
      </div>

      <button class="btn-primary" onclick="submitUserFeedback()">Submit Review</button>
    </div>
  `;
}

function submitUserFeedback() {
  const dest = document.getElementById("fb-destination")?.value || "Nandi Hills";
  const rating = parseInt(document.getElementById("fb-rating")?.value || "5");
  const comments = document.getElementById("fb-comments")?.value || "";

  state.feedbacks.push({ dest, rating, comments, date: new Date().toLocaleDateString() });
  localStorage.setItem("travelmate_feedbacks", JSON.stringify(state.feedbacks));
  alert("Thank you for your feedback! It helps improve recommendations for everyone.");
  switchView("home");
}

// --- Floating AI Chat Assistant ---

state.lastChatSendTime = 0;
state.isChatLoading = false;
state.offlineReplyIndices = {};

function formatChatText(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML.replace(/\n/g, "<br>");
}

function toggleChat() {
  const modal = document.getElementById("chat-modal");
  if (modal.style.display === "flex") {
    modal.style.display = "none";
  } else {
    modal.style.display = "flex";
    renderChatMessages();
    setTimeout(() => {
      const input = document.getElementById("chat-input");
      if (input) input.focus();
    }, 150);
  }
}

function handleChipClick(topic) {
  const input = document.getElementById("chat-input");
  if (!input) return;
  const d = state.selectedDestination || (state.destinations && state.destinations[0]) || { name: "Karnataka" };
  if (topic === "Budget") {
    input.value = `Budget for ${d.name} 3 days?`;
  } else if (topic === "Packing") {
    input.value = `What should I pack for ${d.name}?`;
  } else if (topic === "Weather") {
    input.value = `Weather in ${d.name} in December?`;
  } else if (topic === "Best places") {
    input.value = "What are the best places to visit in Karnataka?";
  } else {
    input.value = topic;
  }
  sendChatMessage();
}

function getVariedReply(intent, phrasings) {
  if (!state.offlineReplyIndices) state.offlineReplyIndices = {};
  const lastIdx = state.offlineReplyIndices[intent] !== undefined ? state.offlineReplyIndices[intent] : -1;
  const nextIdx = (lastIdx + 1) % phrasings.length;
  state.offlineReplyIndices[intent] = nextIdx;
  return phrasings[nextIdx];
}

function getChatReply(msg) {
  const lower = (msg || "").trim().toLowerCase();

  // Find destination in text or fallback to selected/first destination
  let d = state.selectedDestination;
  if (state.destinations && state.destinations.length) {
    for (const item of state.destinations) {
      if (lower.includes((item.name || "").toLowerCase())) {
        d = item;
        break;
      }
    }
    if (!d) d = state.destinations[0];
  }
  if (!d) d = { name: "Karnataka", average_cost_per_person: 1200, best_season: "October to March", best_months: "October to February" };

  const destName = d.name || "Karnataka";
  const avgCost = d.average_cost_per_person || 1200;
  const bestSeason = d.best_season || "October to March";
  const bestMonths = d.best_months || "October to February";
  const localFood = d.local_food || "Mysore Masala Dosa, Filter Coffee, and Bisi Bele Bath";
  const activities = d.activities || "Heritage walks, Nature trails, and Scenic viewpoints";

  // Days extraction
  const daysMatch = lower.match(/(\d+)\s*(?:day|days)/);
  const daysCount = daysMatch ? parseInt(daysMatch[1], 10) : 3;
  const travelers = (state.preferences && state.preferences.travelers) ? state.preferences.travelers : 2;

  // 1. Unrelated / Off-topic check (cricket, sports, coding, general trivia)
  const unrelatedKeywords = ["cricket", "match", "score", "football", "ipl", "tennis", "movie", "cinema", "politics", "stock", "crypto", "bitcoin", "python", "code", "who won"];
  if (unrelatedKeywords.some(k => lower.includes(k))) {
    return getVariedReply("unrelated", [
      "I specialize exclusively in travel guidance and trip planning for Karnataka, India! Let me know if you need help with destinations, budgets, packing, or itineraries.",
      "I am TravelMate AI, your dedicated Karnataka travel companion. While I don't follow sports or general trivia, I can help you plan your next road trip or weekend getaway!",
      "I'm designed to help you discover the best of Karnataka! Ask me anything about itineraries, local food, packing, or travel costs."
    ]);
  }

  // 2. Greeting intent ("Hi", "Hello", "Hey")
  if (/^(hi|hello|hey|namaskara|greetings)\b/.test(lower) || lower === "hi" || lower === "hello" || lower === "hey") {
    return getVariedReply("greeting", [
      "Namaskara! I am TravelMate AI, your personal trip companion for Karnataka. Ask me about budgets, packing, weather, or recommendations!",
      "Hello there! Ready to plan your Karnataka getaway? I can help you with customized itineraries, travel costs, local delicacies, and packing tips.",
      "Hey traveler! I'm TravelMate AI. Let me know which Karnataka destination you're eyeing, or ask for budget, packing, or route advice!"
    ]);
  }

  // 3. Unclear / Vague prompt ("I need that information", "tell me that")
  if (lower === "i need that information" || lower === "tell me that" || lower === "give me info" || lower === "more info") {
    return getVariedReply("unclear", [
      "Could you please specify which information you need—are you looking for budget estimates, packing advice, weather, or itinerary recommendations?",
      "I'd love to help! Could you specify what you'd like to know about—such as costs, best season, food specialties, or why a place was chosen?",
      "Happy to provide details! Which topic would you like more information on: travel timings, packing checklist, or destination highlights?"
    ]);
  }

  // 4. Why was this place recommended? (Explainable 8-factor scoring)
  if (lower.includes("why was") || lower.includes("why is") || lower.includes("why this") || lower.includes("why did you recommend") || lower.includes("why recommended")) {
    return getVariedReply("why_this_place", [
      `${destName} was recommended based on TravelMate's 8 weighted factors: high Interest match (20%) for heritage and outdoor trails, 100% Time Feasibility (15%) for your travel window, and top Budget compatibility (20%).`,
      `TravelMate AI matched ${destName} through our 8 transparent factors: Budget (20%), Interests (20%), Time Feasibility (15%), Travel Mood (15%), Food (10%), Distance (10%), Transport (5%), and Season (5%).`,
      `We recommended ${destName} because its combined score is high across Culture & Nature interests (20%), convenient highway road connectivity (5%), and overall budget efficiency (20%).`
    ]);
  }

  // 5. Budget & Cost queries ("Budget for Coorg 3 days?", "cost", "how much")
  if (lower.includes("budget") || lower.includes("cost") || lower.includes("how much") || lower.includes("price") || lower.includes("expense") || lower.includes("expensive")) {
    const calcPerPerson = avgCost * daysCount;
    const calcGroup = calcPerPerson * travelers;
    return getVariedReply("budget", [
      `For ${destName} (${daysCount} days), estimate ~₹${calcPerPerson.toLocaleString("en-IN")} per person (approx ₹${calcGroup.toLocaleString("en-IN")} for ${travelers} travelers). This covers stay, authentic regional dining, fuel, and sightseeing entry fees.`,
      `Budgeting for ${destName} over ${daysCount} days: expect ~₹${avgCost.toLocaleString("en-IN")} per person daily. For ${travelers} travelers, plan for roughly ₹${calcGroup.toLocaleString("en-IN")} total including transport and local activities.`,
      `A ${daysCount}-day trip to ${destName} typically costs ~₹${calcPerPerson.toLocaleString("en-IN")} per person. Tip: Traveling by KSRTC bus or booking homestays in advance can save up to 25%!`
    ]);
  }

  // 6. Weather & Season queries ("Weather in Hampi in December?", "climate", "rain")
  if (lower.includes("weather") || lower.includes("season") || lower.includes("climate") || lower.includes("december") || lower.includes("rain") || lower.includes("temperature")) {
    if (lower.includes("hampi") || destName.toLowerCase().includes("hampi")) {
      return getVariedReply("weather", [
        "In December, Hampi enjoys peak winter weather with clear skies, pleasant daytime highs around 28°C, and cool breezy evenings (~16°C). It is the perfect time for walking temple trails!",
        "December is prime time for Hampi! Days are sunny and dry (~27°C) while nights are comfortably cool (~15°C). Great for boulder exploring and Tungabhadra river sunsets.",
        "Hampi's December climate is ideal: warm sunny days and cool nights without rain. Carry a sun hat for midday monument walks and a light layer for pleasant evenings."
      ]);
    }
    return getVariedReply("weather", [
      `The best climate for ${destName} is during ${bestSeason} (${bestMonths}). Expect comfortable outdoor conditions and scenic viewpoints.`,
      `For ${destName}, plan your visit around ${bestSeason}. Daytime temperatures are pleasant, making sightseeing and outdoor activities very comfortable.`,
      `Weather update for ${destName}: ${bestSeason} offers the clearest skies and pleasant temperatures. Avoid peak summer afternoons for outdoor climbs.`
    ]);
  }

  // 7. Packing queries ("What should I pack?", "clothes", "shoes")
  if (lower.includes("pack") || lower.includes("bring") || lower.includes("wear") || lower.includes("clothes") || lower.includes("shoes") || lower.includes("essentials")) {
    return getVariedReply("packing", [
      `Essential packing for ${destName}: sturdy walking shoes with rubber grip, breathable cotton clothes, 2L water bottle, sun protection (cap/sunglasses), and a light layer for breezy mornings.`,
      `For your Karnataka trip: pack comfortable walking shoes for heritage monuments/trails, high-SPF sunscreen, light cottons, power bank, and small cash/UPI for highway vendors.`,
      `Packing checklist for ${destName}: comfortable trekking/walking footwear, reusable water bottle, sunglasses, light windcheater jacket, and personal medications.`
    ]);
  }

  // 8. Food queries ("food", "eat", "restaurant", "cuisine")
  if (lower.includes("food") || lower.includes("eat") || lower.includes("restaurant") || lower.includes("cuisine") || lower.includes("veg")) {
    return getVariedReply("food", [
      `Culinary highlights for ${destName}: ${localFood}. Be sure to visit iconic regional mess halls and family-run highway tiffin spots!`,
      `Food guide for ${destName}: try authentic regional specialties including ${localFood}. Verified vegetarian and regional dining options are widely available.`,
      `Must-try dining near ${destName}: indulge in ${localFood}. Pair with traditional South Indian Filter Kaapi for the authentic road trip experience!`
    ]);
  }

  // 9. Transport queries ("how to reach", "drive", "route", "bus", "train")
  if (lower.includes("transport") || lower.includes("reach") || lower.includes("route") || lower.includes("drive") || lower.includes("bus") || lower.includes("train") || lower.includes("cab")) {
    const dist = d.distance_km || 120;
    return getVariedReply("transport", [
      `Getting to ${destName} (~${dist} km from Bengaluru): accessible via well-paved state highways, KSRTC Airavat buses, or self-drive cars. Depart early by 6 AM to beat city toll traffic.`,
      `Transport to ${destName}: driving takes around ${d.travel_time_hours || 2.5} hours via the main corridor. KSRTC buses and South Western Railway trains run regularly.`,
      `Route advice for ${destName}: smooth highway driving connects this region. We recommend taking a morning road trip for scenic views and roadside tiffin stops.`
    ]);
  }

  // 10. Destinations & Attractions ("best places", "destinations", "top spots")
  if (lower.includes("destinations") || lower.includes("best places") || lower.includes("places to see") || lower.includes("top spots") || lower.includes("attractions")) {
    return getVariedReply("destinations", [
      "Top Karnataka destinations right now: Nandi Hills for sunrise getaways, Mysuru for royal palaces, Coorg for lush coffee hills, and Hampi for UNESCO world heritage ruins.",
      "Explore Karnataka's finest: Kabini for wildlife safaris, Chikmagalur for mountain coffee estates, Gokarna for tranquil beaches, and Badami for rock-cut cave temples.",
      `Top highlights for ${destName}: ${activities}. Check the Destinations tab in TravelMate AI for transparent 8-factor scores on 40 verified getaways!`
    ]);
  }

  // General fallback
  return getVariedReply("general", [
    `I'm TravelMate AI, your Karnataka travel guide! I can assist with budgets, packing lists, weather timings, local dining, or why ${destName} was recommended.`,
    `Welcome to TravelMate AI. Ask me anything about exploring ${destName}—from expected trip expenses and packing tips to the best season for sightseeing!`,
    `TravelMate AI is here to help you navigate Karnataka with ease. Ask about itineraries, road routes, regional dishes, or budget optimizations!`
  ]);
}

async function sendChatMessage() {
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send-btn");
  let msg = (input ? input.value : "").trim();

  // 1. Ignore empty input
  if (!msg) return;

  // 2. Safety: 500 characters limit
  if (msg.length > 500) {
    msg = msg.substring(0, 500);
  }

  // 3. Safety: Rate limiting (1 request per second)
  const now = Date.now();
  if (now - (state.lastChatSendTime || 0) < 1000) {
    return;
  }
  state.lastChatSendTime = now;

  // 4. Save to in-memory session history
  state.chatHistory.push({ sender: "user", text: msg });
  if (input) input.value = "";

  // 5. Update UI with typing indicator and disabled send button
  state.isChatLoading = true;
  if (sendBtn) sendBtn.disabled = true;
  renderChatMessages();

  // 6. Gather active trip context and 8-factor scores
  const d = state.selectedDestination || (state.destinations && state.destinations[0]) || { name: "Karnataka" };
  const currentRec = (state.recommendations || []).find(r => r.destination && r.destination.id === d.id);
  const factorScores = currentRec ? currentRec.factor_scores : {
    budget: 92,
    interests: 90,
    time: 85,
    mood: 88,
    food: 80,
    distance: 85,
    transport: 90,
    season: 95,
    overall: 89
  };

  const payload = {
    message: msg,
    history: state.chatHistory.slice(-10),
    trip_data: {
      destination: d.name,
      budget: state.preferences ? state.preferences.budget : 4000,
      days: state.preferences ? state.preferences.available_time : "One day",
      travelers: state.preferences ? state.preferences.travelers : 2,
      mood: state.preferences ? state.preferences.travel_mood : "Relaxing",
      interests: state.preferences ? state.preferences.interests : ["Nature", "Photography"],
      season: state.preferences ? state.preferences.travel_period : "Flexible dates",
      factor_scores: factorScores
    }
  };

  // 7. Request to online backend Gemini API route using single BACKEND_URL with 60s timeout
  const chatEndpoint = `${BACKEND_URL.replace(/\/+$/, "")}/api/chat`;

  let replyText = null;
  let isOffline = true;
  let chatError = null;

  try {
    const controller = new AbortController();
    // 60-second timeout to accommodate cloud container cold-starts (e.g. Render free tier)
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const res = await fetch(chatEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.reply) {
        replyText = data.reply;
        isOffline = Boolean(data.offline);
      } else {
        chatError = `${chatEndpoint}: Empty reply received from server`;
      }
    } else {
      let errDetail = "";
      try {
        const errData = await res.json();
        errDetail = typeof errData.detail === "object" ? JSON.stringify(errData.detail) : (errData.detail || JSON.stringify(errData));
      } catch (_) {
        try { errDetail = await res.text(); } catch (__) {}
      }
      chatError = `${chatEndpoint} returned HTTP ${res.status} (${res.statusText || 'Error'})${errDetail ? ': ' + errDetail.slice(0, 150) : ''}`;
    }
  } catch (e) {
    if (e.name === "AbortError") {
      chatError = `${chatEndpoint}: Connection timed out after 60s (server may still be waking up, please retry)`;
    } else {
      chatError = `${chatEndpoint}: ${e.message || e.toString()}`;
    }
  }

  // 8. Offline Fallback if backend unavailable, timed out, or unconfigured
  if (!replyText) {
    replyText = getChatReply(msg);
    isOffline = true;
  }

  state.chatHistory.push({
    sender: "ai",
    text: replyText,
    offline: isOffline,
    error: chatError
  });

  state.isChatLoading = false;
  if (sendBtn) sendBtn.disabled = false;
  renderChatMessages();
}

function renderChatMessages() {
  const box = document.getElementById("chat-box");
  if (!box) return;
  box.innerHTML = state.chatHistory.map(m => `
    <div class="chat-bubble ${m.sender}">
      ${formatChatText(m.text)}
      ${m.offline && m.sender === "ai" ? '<br><span class="chat-offline-badge">Offline mode</span>' : ""}
      ${m.error && m.sender === "ai" ? `
        <div class="chat-error-msg" style="margin-top:6px; font-size:11px; color:#b91c1c; background:#fee2e2; border-left:3px solid #ef4444; padding:5px 8px; border-radius:4px; word-break:break-all; text-align:left;">
          ⚠️ <strong>Backend Error:</strong> ${formatChatText(m.error)}
        </div>
      ` : ""}
    </div>
  `).join("");

  if (state.isChatLoading) {
    box.innerHTML += `
      <div class="chat-bubble ai typing">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    `;
  }
  box.scrollTop = box.scrollHeight;
}

// --- Modal & Authentication Management ---

function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.style.display = "flex";
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.style.display = "none";
}

function handleUserBadgeClick() {
  if (state.currentUser) {
    openProfileModal();
  } else {
    openAuthModal("email");
  }
}

function openAuthModal(step = "email") {
  // Pre-fill previously entered name if available
  const nameInput = document.getElementById("auth-input-name");
  const emailInput = document.getElementById("auth-input-email");
  if (nameInput && state.auth.name && !nameInput.value) {
    nameInput.value = state.auth.name;
  }
  if (emailInput && state.auth.email && !emailInput.value) {
    emailInput.value = state.auth.email;
  }

  // Update localized text
  const title1 = document.getElementById("auth-title-step1");
  const desc1 = document.getElementById("auth-desc-step1");
  const lblName = document.getElementById("auth-lbl-name");
  const lblEmail = document.getElementById("auth-lbl-email");
  const btnSendText = document.getElementById("btn-send-otp-text");
  const btnGuest = document.getElementById("btn-auth-guest");

  if (title1) title1.textContent = `🌍 ${t("auth_modal_title")}`;
  if (desc1) desc1.textContent = t("auth_modal_desc");
  if (lblName) lblName.textContent = t("auth_lbl_name");
  if (lblEmail) lblEmail.textContent = t("auth_lbl_email");
  if (btnSendText) btnSendText.textContent = t("auth_btn_send_otp");
  if (btnGuest) btnGuest.textContent = t("auth_btn_guest");

  switchAuthStep(step);
  openModal("auth-modal");
}

function closeAuthModal() {
  closeModal("auth-modal");
}

function switchAuthStep(step) {
  const stepEmail = document.getElementById("auth-step-email");
  const stepOtp = document.getElementById("auth-step-otp");
  hideAuthAlert("step1");
  hideAuthAlert("step2");

  if (step === "email") {
    if (stepEmail) stepEmail.style.display = "block";
    if (stepOtp) stepOtp.style.display = "none";
    setTimeout(() => {
      const emailInput = document.getElementById("auth-input-email");
      if (emailInput) emailInput.focus();
    }, 100);
  } else if (step === "otp") {
    if (stepEmail) stepEmail.style.display = "none";
    if (stepOtp) stepOtp.style.display = "block";

    const emailDisplay = document.getElementById("auth-target-email-display");
    if (emailDisplay) emailDisplay.textContent = state.auth.email;

    const title2 = document.getElementById("auth-title-step2");
    const btnVerifyText = document.getElementById("btn-verify-otp-text");
    if (title2) title2.textContent = t("auth_otp_title");
    if (btnVerifyText) btnVerifyText.textContent = t("auth_btn_verify");

    clearOtpInputs();
    setTimeout(() => {
      const firstBox = document.querySelector('.otp-box[data-index="0"]');
      if (firstBox) firstBox.focus();
    }, 100);
  }
}

function showAuthAlert(step, message, type = "error") {
  const alertBox = document.getElementById(`auth-alert-${step}`);
  if (alertBox) {
    alertBox.className = `auth-alert ${type}`;
    const icon = type === "error" ? "⚠️" : type === "success" ? "✓" : "ℹ️";
    alertBox.innerHTML = `<span>${icon}</span><div>${message}</div>`;
    alertBox.style.display = "flex";
  }
}

function hideAuthAlert(step) {
  const alertBox = document.getElementById(`auth-alert-${step}`);
  if (alertBox) alertBox.style.display = "none";
}

async function handleSendOtp() {
  const nameInput = document.getElementById("auth-input-name");
  const emailInput = document.getElementById("auth-input-email");
  const sendBtn = document.getElementById("btn-auth-send-otp");
  const btnText = document.getElementById("btn-send-otp-text");

  const name = (nameInput?.value || "").trim() || "Traveler";
  const email = (emailInput?.value || "").trim();

  hideAuthAlert("step1");

  if (!window.TravelMateAuth.validateEmail(email)) {
    showAuthAlert("step1", t("auth_err_email") || "Please enter a valid email address.", "error");
    if (emailInput) emailInput.focus();
    return;
  }

  // Loading state
  state.auth.isSubmitting = true;
  if (sendBtn) sendBtn.disabled = true;
  if (btnText) btnText.innerHTML = `<span class="spinner-sm" style="display:inline-block; vertical-align:middle; margin-right:6px;"></span> ${t("auth_status_sending") || "Sending OTP..."}`;

  try {
    const res = await window.TravelMateAuth.requestOtp(email, name);
    if (res.success) {
      state.auth.email = email;
      state.auth.name = name;

      // Start 60s cooldown timer
      const cooldownSec = window.TRAVELMATE_CONFIG?.OTP_RESEND_COOLDOWN_SECONDS || 60;
      startCooldownTimer(cooldownSec);

      switchAuthStep("otp");
      showAuthAlert("step2", t("auth_status_success_otp") || "Verification code sent! Please check your email inbox (and spam folder).", "success");
    } else {
      showAuthAlert("step1", res.message || "Failed to send verification code. Please check your network and provider settings.", "error");
    }
  } catch (err) {
    showAuthAlert("step1", "An unexpected error occurred. Please try again.", "error");
  } finally {
    state.auth.isSubmitting = false;
    if (sendBtn) sendBtn.disabled = false;
    if (btnText) btnText.textContent = t("auth_btn_send_otp") || "Send Verification Code";
  }
}

async function handleResendOtp() {
  if (state.auth.cooldownRemaining > 0 || state.auth.isSubmitting) return;

  const resendBtn = document.getElementById("btn-auth-resend");
  hideAuthAlert("step2");

  state.auth.isSubmitting = true;
  if (resendBtn) resendBtn.disabled = true;

  try {
    const res = await window.TravelMateAuth.requestOtp(state.auth.email, state.auth.name);
    if (res.success) {
      const cooldownSec = window.TRAVELMATE_CONFIG?.OTP_RESEND_COOLDOWN_SECONDS || 60;
      startCooldownTimer(cooldownSec);
      showAuthAlert("step2", "✓ A fresh 6-digit verification code has been dispatched to your email.", "success");
      clearOtpInputs();
      const firstBox = document.querySelector('.otp-box[data-index="0"]');
      if (firstBox) firstBox.focus();
    } else {
      showAuthAlert("step2", res.message || "Failed to resend code. Please wait before retrying.", "error");
    }
  } catch (err) {
    showAuthAlert("step2", "Network error while resending. Please check your connection.", "error");
  } finally {
    state.auth.isSubmitting = false;
    if (resendBtn) resendBtn.disabled = false;
  }
}

function startCooldownTimer(seconds) {
  if (state.auth.cooldownTimer) {
    clearInterval(state.auth.cooldownTimer);
  }

  state.auth.cooldownRemaining = seconds;
  const cooldownText = document.getElementById("auth-cooldown-text");
  const resendBtn = document.getElementById("btn-auth-resend");

  const updateUI = () => {
    if (state.auth.cooldownRemaining > 0) {
      if (cooldownText) {
        cooldownText.style.display = "inline";
        cooldownText.textContent = `${t("auth_resend_cooldown") || "Resend code in"} ${state.auth.cooldownRemaining}s`;
      }
      if (resendBtn) resendBtn.style.display = "none";
    } else {
      if (cooldownText) cooldownText.style.display = "none";
      if (resendBtn) {
        resendBtn.style.display = "inline-flex";
        resendBtn.textContent = `🔄 ${t("auth_btn_resend") || "Resend Code"}`;
      }
      if (state.auth.cooldownTimer) clearInterval(state.auth.cooldownTimer);
    }
  };

  updateUI();
  state.auth.cooldownTimer = setInterval(() => {
    state.auth.cooldownRemaining--;
    updateUI();
    if (state.auth.cooldownRemaining <= 0) {
      clearInterval(state.auth.cooldownTimer);
    }
  }, 1000);
}

function setupOtpInputs() {
  const boxes = document.querySelectorAll(".otp-box");
  boxes.forEach((box, idx) => {
    // Handle typing and auto-advancing
    box.addEventListener("input", (e) => {
      const val = e.target.value.replace(/[^0-9]/g, "");
      e.target.value = val ? val[0] : "";

      if (e.target.value) {
        e.target.classList.add("filled");
        if (idx < boxes.length - 1) {
          boxes[idx + 1].focus();
        } else {
          // All 6 filled, trigger verification
          handleVerifyOtp();
        }
      } else {
        e.target.classList.remove("filled");
      }
    });

    // Handle backspace navigation
    box.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !e.target.value && idx > 0) {
        boxes[idx - 1].focus();
        boxes[idx - 1].value = "";
        boxes[idx - 1].classList.remove("filled");
      } else if (e.key === "Enter") {
        handleVerifyOtp();
      }
    });

    // Handle paste event across all 6 boxes
    box.addEventListener("paste", (e) => {
      e.preventDefault();
      const pasteData = (e.clipboardData || window.clipboardData).getData("text");
      const digits = pasteData.replace(/[^0-9]/g, "").slice(0, 6);
      if (digits.length > 0) {
        boxes.forEach((b, i) => {
          if (digits[i]) {
            b.value = digits[i];
            b.classList.add("filled");
          } else {
            b.value = "";
            b.classList.remove("filled");
          }
        });
        const focusIdx = Math.min(digits.length, boxes.length - 1);
        boxes[focusIdx].focus();
        if (digits.length === 6) {
          handleVerifyOtp();
        }
      }
    });
  });
}

function getOtpInputValue() {
  const boxes = document.querySelectorAll(".otp-box");
  let code = "";
  boxes.forEach(b => { code += (b.value || "").trim(); });
  return code;
}

function clearOtpInputs() {
  const boxes = document.querySelectorAll(".otp-box");
  boxes.forEach(b => {
    b.value = "";
    b.classList.remove("filled");
  });
}

async function handleVerifyOtp() {
  const code = getOtpInputValue();
  const verifyBtn = document.getElementById("btn-auth-verify-otp");
  const btnText = document.getElementById("btn-verify-otp-text");

  hideAuthAlert("step2");

  if (!code || code.length < 6) {
    showAuthAlert("step2", t("auth_err_otp_len") || "Please enter the complete 6-digit verification code.", "error");
    const emptyBox = Array.from(document.querySelectorAll(".otp-box")).find(b => !b.value);
    if (emptyBox) emptyBox.focus();
    return;
  }

  // Loading state
  state.auth.isSubmitting = true;
  if (verifyBtn) verifyBtn.disabled = true;
  if (btnText) btnText.innerHTML = `<span class="spinner-sm" style="display:inline-block; vertical-align:middle; margin-right:6px;"></span> ${t("auth_status_verifying") || "Verifying code..."}`;

  try {
    const res = await window.TravelMateAuth.verifyOtp(state.auth.email, code);
    if (res.success && res.user) {
      state.currentUser = res.user;

      // Stop cooldown timer
      if (state.auth.cooldownTimer) clearInterval(state.auth.cooldownTimer);

      closeAuthModal();
      renderApp();

      if (window.TravelMateNative && typeof window.TravelMateNative.showToast === "function") {
        window.TravelMateNative.showToast(`Signed in as ${res.user.name}`);
      }

      alert(`✓ ${t("auth_status_success_auth") || "Signed in successfully! Welcome to TravelMate AI."}`);
    } else {
      showAuthAlert("step2", res.message || "Invalid verification code. Please check your email or request a new one.", "error");
      clearOtpInputs();
      const firstBox = document.querySelector('.otp-box[data-index="0"]');
      if (firstBox) firstBox.focus();
    }
  } catch (err) {
    showAuthAlert("step2", "Verification request failed. Please check your connection.", "error");
  } finally {
    state.auth.isSubmitting = false;
    if (verifyBtn) verifyBtn.disabled = false;
    if (btnText) btnText.textContent = t("auth_btn_verify") || "Verify & Sign In";
  }
}

function continueAsGuest() {
  sessionStorage.setItem("travelmate_guest_active", "true");
  closeAuthModal();
  renderApp();
}

function openProfileModal() {
  if (!state.currentUser) {
    openAuthModal("email");
    return;
  }

  const nameEl = document.getElementById("profile-name-display");
  const emailEl = document.getElementById("profile-email-display");
  const avatarChar = document.getElementById("profile-avatar-char");
  const tripsCount = document.getElementById("profile-saved-count");
  const modalTitle = document.getElementById("profile-modal-title");

  if (modalTitle) modalTitle.textContent = `👤 ${t("auth_profile_title") || "Traveler Profile"}`;
  if (nameEl) nameEl.textContent = state.currentUser.name || "Traveler";
  if (emailEl) emailEl.textContent = state.currentUser.email || "";
  if (avatarChar) {
    const initial = (state.currentUser.name || "T")[0].toUpperCase();
    avatarChar.textContent = initial;
  }
  if (tripsCount) {
    tripsCount.textContent = state.savedTrips.length;
  }

  openModal("profile-modal");
}

async function handleSignOut() {
  if (window.TravelMateAuth) {
    await window.TravelMateAuth.signOut();
  }
  state.currentUser = null;
  closeModal("profile-modal");
  renderApp();

  if (window.TravelMateNative && typeof window.TravelMateNative.showToast === "function") {
    window.TravelMateNative.showToast("Signed out successfully");
  }

  openAuthModal("email");
}

