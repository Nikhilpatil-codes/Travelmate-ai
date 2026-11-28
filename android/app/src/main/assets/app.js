/**
 * TravelMate AI — Core Frontend Logic Engine.
 * Implements deterministic 8-factor recommendation scoring, itinerary scheduling,
 * budget calculations, budget optimization, offline smart maps routing,
 * AI assistant chat, and SQLite/localStorage persistence.
 */

// Backend Service URL Configuration for Online Deployment
// Replace with your live Render backend URL: https://<your-service-name>.onrender.com
const BACKEND_URL = (typeof window !== "undefined" && window.TRAVELMATE_CONFIG && window.TRAVELMATE_CONFIG.BACKEND_URL)
  || (typeof localStorage !== "undefined" && localStorage.getItem("https://travelmate-ai-backend-650h.onrender.com"))
  || "https://travelmate-ai-khv0.onrender.com";

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
  destinations: (typeof DESTINATIONS !== "undefined" && Array.isArray(DESTINATIONS)) ? DESTINATIONS : [],
  exploreRadius: "all",
  exploreViewMode: "list", // "list" or "map"
  exploreCategory: "all",
  exploreSearchQuery: "",
  wizardStep: 1, // 1: Where, 2: Budget, 3: Interests, 4: Preferences
  selectedReviewStars: 5,
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

// Available Travel Moods & Interests (Aligned with DESTINATIONS dataset)
const ALL_MOODS = ["Relaxing", "Adventure", "Photography", "Family", "Friends", "Spiritual", "Romantic", "Nature"];
const ALL_INTERESTS = [
  "Nature", "Mountains", "Photography", "Adventure", "Parks", "Wildlife",
  "Heritage", "History", "Temples", "Waterfalls", "Beaches", "Architecture"
];

// Initialize Application
document.addEventListener("DOMContentLoaded", async () => {
  setupLanguage();
  setupOtpInputs();
  await loadDestinationsData();
  setupEventListeners();

  // Support direct URL query parameters (e.g. ?guest=1&view=explore)
  const params = new URLSearchParams(window.location.search);
  if (params.get("guest") === "1" || params.get("guest") === "true") {
    sessionStorage.setItem("travelmate_guest_active", "true");
  }
  const viewParam = params.get("view");
  if (viewParam) {
    state.currentView = viewParam;
    if (params.get("step")) state.wizardStep = parseInt(params.get("step")) || 1;
    if (params.get("mode")) state.exploreViewMode = params.get("mode");
    if (params.get("radius")) state.exploreRadius = parseInt(params.get("radius")) || params.get("radius");
    if (params.get("budget")) state.preferences.budget = parseInt(params.get("budget"));
    if (viewParam === "results") {
      computeLocalRecommendations();
    }
    if (viewParam === "saved" && state.savedTrips.length === 0 && state.destinations.length > 0) {
      const d = state.destinations[0];
      state.savedTrips.push({
        id: Date.now(),
        destination_id: d.id,
        destination_name: d.name,
        district: d.district,
        cost_per_person: d.costPerPersonINR,
        budget: state.preferences.budget,
        travel_mode: state.preferences.transportation,
        date: new Date().toLocaleDateString()
      });
      localStorage.setItem("travelmate_saved_trips", JSON.stringify(state.savedTrips));
    }
  }

  // Initialize seed reviews if localStorage empty
  if (!state.feedbacks || state.feedbacks.length === 0) {
    state.feedbacks = [
      {
        id: "fb_1",
        name: "Ananya Rao",
        destination: "Nandi Hills",
        rating: 5,
        date: "15 Nov 2026",
        comment: "Spectacular sunrise cloud bed view! The itinerary timings were spot-on."
      },
      {
        id: "fb_2",
        name: "Karthik Gowda",
        destination: "Coorg (Madikeri)",
        rating: 5,
        date: "10 Nov 2026",
        comment: "Coffee plantation homestay was peaceful and the Abbey Falls visit matched our adventure mood."
      },
      {
        id: "fb_3",
        name: "Sneha Patil",
        destination: "Hampi",
        rating: 4,
        date: "2 Nov 2026",
        comment: "Incredible historical stone architecture. The sunset from Hemakuta hill was magical."
      }
    ];
    localStorage.setItem("travelmate_feedbacks", JSON.stringify(state.feedbacks));
  }

  // Startup flow handled natively with smooth zoom animation

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

// Load Dest Dataset (Single Source of Truth: DESTINATIONS)
function loadDestinationsData() {
  let loaded = null;
  if (typeof DESTINATIONS !== "undefined" && Array.isArray(DESTINATIONS) && DESTINATIONS.length > 0) {
    loaded = DESTINATIONS;
  } else if (typeof window !== "undefined" && window.DESTINATIONS && Array.isArray(window.DESTINATIONS) && window.DESTINATIONS.length > 0) {
    loaded = window.DESTINATIONS;
  } else if (typeof globalThis !== "undefined" && globalThis.DESTINATIONS && Array.isArray(globalThis.DESTINATIONS) && globalThis.DESTINATIONS.length > 0) {
    loaded = globalThis.DESTINATIONS;
  }

  if (loaded && loaded.length > 0) {
    state.destinations = loaded;
    console.log(`[TravelMate] Successfully loaded ${state.destinations.length} destinations directly from bundled DESTINATIONS dataset.`);
  } else {
    console.error("[TravelMate] CRITICAL: DESTINATIONS array not found or 0 loaded!");
    state.destinations = [];
  }
}

// Karnataka Reference Cities for Haversine Distance
const CITY_COORDINATES = {
  "bengaluru": { lat: 12.9716, lng: 77.5946 },
  "bangalore": { lat: 12.9716, lng: 77.5946 },
  "mysuru": { lat: 12.2958, lng: 76.6394 },
  "mysore": { lat: 12.2958, lng: 76.6394 },
  "mangaluru": { lat: 12.9141, lng: 74.8560 },
  "mangalore": { lat: 12.9141, lng: 74.8560 },
  "hubballi": { lat: 15.3647, lng: 75.1240 },
  "hubli": { lat: 15.3647, lng: 75.1240 },
  "belagavi": { lat: 15.8497, lng: 74.4977 },
  "belgaum": { lat: 15.8497, lng: 74.4977 },
  "shivamogga": { lat: 13.9299, lng: 75.5681 },
  "shimoga": { lat: 13.9299, lng: 75.5681 },
  "hassan": { lat: 13.0033, lng: 76.1004 },
  "udupi": { lat: 13.3409, lng: 74.7421 },
  "chikkamagaluru": { lat: 13.3161, lng: 75.7720 },
  "chikmagalur": { lat: 13.3161, lng: 75.7720 }
};

// Haversine formula to compute great-circle distance in kilometers
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function getOriginCoords() {
  if (state.preferences.has_custom_loc) {
    return { lat: state.preferences.user_lat, lng: state.preferences.user_lon };
  }
  const cityKey = (state.preferences.starting_location || "").trim().toLowerCase();
  return CITY_COORDINATES[cityKey] || { lat: 12.9716, lng: 77.5946 };
}

function getDestinationDistance(d) {
  if (!d || typeof d.lat !== "number" || typeof d.lng !== "number") return 0;
  const origin = getOriginCoords();
  return haversineDistanceKm(origin.lat, origin.lng, d.lat, d.lng);
}

function formatBestMonths(months) {
  if (!months || !months.length) return "Year-round";
  if (months.length === 12) return "Year-round";
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months.map(m => monthNames[m - 1]).join(", ");
}

// Clean coloured category / initial placeholder SVG (Never broken icon)
function getDestPlaceholderSvg(name, interests = []) {
  const letter = (name || "T").charAt(0).toUpperCase();
  let icon = "📍";
  const tags = (interests || []).join(" ").toLowerCase();
  if (tags.includes("mountain") || tags.includes("hill") || tags.includes("trek")) icon = "⛰️";
  else if (tags.includes("waterfall") || tags.includes("beach") || tags.includes("lake") || tags.includes("river")) icon = "🌊";
  else if (tags.includes("wildlife") || tags.includes("safari")) icon = "🐅";
  else if (tags.includes("temple") || tags.includes("heritage") || tags.includes("historical")) icon = "🏛️";
  else if (tags.includes("park") || tags.includes("garden") || tags.includes("nature")) icon = "🌿";
  else if (tags.includes("palace") || tags.includes("fort")) icon = "🏰";

  const gradients = [
    ["#065f46", "#10b981"],
    ["#1e40af", "#3b82f6"],
    ["#9a3412", "#f97316"],
    ["#6b21a8", "#a855f7"],
    ["#0f766e", "#14b8a6"],
    ["#854d0e", "#eab308"]
  ];
  const pair = gradients[letter.charCodeAt(0) % gradients.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260">
    <defs>
      <linearGradient id="g_${letter}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${pair[0]}"/>
        <stop offset="100%" stop-color="${pair[1]}"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g_${letter})"/>
    <circle cx="200" cy="100" r="50" fill="rgba(255,255,255,0.18)"/>
    <text x="200" y="110" font-size="44" text-anchor="middle" dominant-baseline="middle">${icon}</text>
    <text x="200" y="175" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="19" font-weight="700" fill="#ffffff" text-anchor="middle">${name}</text>
    <text x="200" y="205" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="12" fill="rgba(255,255,255,0.85)" text-anchor="middle">Karnataka, India</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function handleImageError(imgEl, destId) {
  if (!imgEl) return;
  imgEl.onerror = null;
  const d = state.destinations.find(x => String(x.id) === String(destId));
  const name = d ? d.name : "Karnataka";
  const interests = d ? (d.interests || []) : [];
  imgEl.src = getDestPlaceholderSvg(name, interests);
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

  const timeHoursMap = {
    "2-3 hours": 3,
    "Half day": 6,
    "One day": 14,
    "Weekend": 48
  };

  const periodMonthsMap = {
    "January-March": [1, 2, 3],
    "April-June": [4, 5, 6],
    "July-September": [7, 8, 9],
    "October-December": [10, 11, 12],
    "Flexible dates": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  };

  const scored = [];

  for (const d of state.destinations) {
    // 1. Distance Calculation & Max Distance Filter
    const destDist = getDestinationDistance(d);
    if (destDist > p.max_distance) {
      continue; // Strict filter on Max Distance
    }
    const distScore = Math.max(30, Math.round(100 - (destDist / p.max_distance) * 50));
    const distReason = `${destDist} km away (within your ${p.max_distance} km limit)`;

    // 2. Budget Score (costPerPersonINR x travelers vs budget)
    const estGroupCost = (d.costPerPersonINR || 500) * p.travelers;
    let budgetScore = 100;
    let budgetReason = `Comfortably fits budget: ₹${estGroupCost} for ${p.travelers} traveler${p.travelers > 1 ? "s" : ""} (₹${d.costPerPersonINR}/person)`;
    if (estGroupCost > p.budget) {
      const overRatio = estGroupCost / p.budget;
      budgetScore = Math.max(10, Math.round(100 - (overRatio - 1.0) * 100));
      budgetReason = `Exceeds budget by ₹${estGroupCost - p.budget} (Total est. ₹${estGroupCost})`;
    } else if (p.budget - estGroupCost > p.budget * 0.4) {
      budgetReason = `Budget-friendly: ₹${estGroupCost} vs ₹${p.budget} limit`;
    }

    // 3. Interests Score (matched to d.interests)
    const dInterests = Array.isArray(d.interests) ? d.interests : [];
    let matchedInterests = [];
    let interestScore = 75;
    let interestReason = "Scenic local experience";
    if (p.interests && p.interests.length > 0) {
      matchedInterests = p.interests.filter(userInt =>
        dInterests.some(di => di.toLowerCase().includes(userInt.toLowerCase()) || userInt.toLowerCase().includes(di.toLowerCase()))
      );
      interestScore = Math.round((matchedInterests.length / p.interests.length) * 100);
      if (matchedInterests.length > 0) {
        interestReason = `Matches interests: ${matchedInterests.slice(0, 3).join(", ")}`;
      } else {
        interestScore = 30;
        interestReason = `Features ${dInterests.slice(0, 2).join(", ")}`;
      }
    }

    // 4. Available Time Score (recommendedTime vs available_time)
    const userHours = timeHoursMap[p.available_time] || 14;
    const destHours = timeHoursMap[d.recommendedTime] || 14;
    let timeScore = 100;
    let timeReason = `Recommended duration (${d.recommendedTime}) aligns with your ${p.available_time} window`;
    if (d.recommendedTime === p.available_time) {
      timeScore = 100;
    } else if (destHours <= userHours) {
      timeScore = 90;
      timeReason = `Comfortably completed (${d.recommendedTime}) in ${p.available_time}`;
    } else {
      timeScore = Math.max(20, Math.round(100 - ((destHours - userHours) / destHours) * 80));
      timeReason = `Recommended for ${d.recommendedTime}, slightly exceeds ${p.available_time}`;
    }

    // 5. Travel Mood Score (moods vs travel_mood)
    const dMoods = Array.isArray(d.moods) ? d.moods : [];
    const moodMatch = dMoods.some(m => m.toLowerCase() === p.travel_mood.toLowerCase());
    const moodScore = moodMatch ? 100 : 40;
    const moodReason = moodMatch
      ? `Ideal match for a ${p.travel_mood.toLowerCase()} mood`
      : `Atmosphere leans towards ${dMoods.slice(0, 2).join(" & ") || "Scenic"}`;

    // 6. Food Preference Score (vegFriendly & foodOptions)
    let foodScore = 80;
    let foodReason = "Food readily available";
    const isVegUser = ["Vegetarian", "Vegan", "Jain"].includes(p.food_preference);
    if (isVegUser) {
      if (d.vegFriendly) {
        foodScore = d.foodOptions === "easy" ? 100 : 85;
        foodReason = `Vegetarian-friendly with ${d.foodOptions} food options`;
      } else {
        foodScore = d.foodOptions === "easy" ? 55 : 30;
        foodReason = `Limited dedicated vegetarian options (${d.foodOptions})`;
      }
    } else {
      foodScore = d.foodOptions === "easy" ? 100 : 75;
      foodReason = d.foodOptions === "easy" ? "Abundant local dining options nearby" : "Limited dining nearby, carry snacks";
    }

    // 7. Transport Score (transport vs transportation)
    const dTransport = Array.isArray(d.transport) ? d.transport : [];
    let transMatch = dTransport.some(t => t.toLowerCase() === p.transportation.toLowerCase());
    if (!transMatch && p.transportation === "Public transport") {
      transMatch = dTransport.some(t => ["bus", "train"].includes(t.toLowerCase()));
    }
    if (!transMatch && p.transportation === "Cab") {
      transMatch = dTransport.some(t => t.toLowerCase() === "car");
    }
    const transScore = transMatch ? 100 : 50;
    const transReason = transMatch
      ? `Easily accessible via ${p.transportation}`
      : `Best reached via ${dTransport.join(" or ") || "private vehicle"}`;

    // 8. Travel Period / Season Score (bestMonths vs travel_period)
    const targetMonths = periodMonthsMap[p.travel_period] || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const dMonths = Array.isArray(d.bestMonths) ? d.bestMonths : [];
    let seasonScore = 90;
    let seasonReason = `Optimal season: ${formatBestMonths(dMonths)}`;
    if (p.travel_period === "Flexible dates") {
      seasonScore = 95;
      seasonReason = `Flexible dates: prime months are ${formatBestMonths(dMonths)}`;
    } else {
      const overlap = targetMonths.filter(m => dMonths.includes(m));
      if (overlap.length > 0) {
        seasonScore = 100;
        seasonReason = `Peak season in ${p.travel_period} (${formatBestMonths(overlap)})`;
      } else {
        seasonScore = 40;
        seasonReason = `Off-peak in ${p.travel_period} (best: ${formatBestMonths(dMonths)})`;
      }
    }

    // Weighted Overall Score
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

    const explanations = [
      budgetReason,
      interestReason,
      distReason,
      moodReason
    ];

    const estTravelHours = (destDist / 45).toFixed(1);

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
      distance_km: destDist,
      estimated_group_cost: estGroupCost,
      cost_per_person: d.costPerPersonINR,
      estimated_travel_time_hours: estTravelHours,
      matched_interests: matchedInterests,
      explanations: explanations
    });
  }

  // Deterministic Ranking: score DESC, distance ASC, name ASC
  scored.sort((a, b) => {
    if (b.overall_score !== a.overall_score) return b.overall_score - a.overall_score;
    if (a.distance_km !== b.distance_km) return a.distance_km - b.distance_km;
    return a.destination.name.localeCompare(b.destination.name);
  });

  state.recommendations = scored.slice(0, 3);
}

// --- Itinerary Scheduling ---
function generateItineraryForDestination(dest) {
  const p = state.preferences;
  const dist = getDestinationDistance(dest);
  const travelTime = Math.max(0.5, (dist / 45));
  const activities = Array.isArray(dest.interests) ? dest.interests : ["Sightseeing", "Nature walk"];
  const localFood = dest.foodOptions === "easy" ? "Authentic local Karnataka cuisine & Filter Coffee" : "Regional snack & packed meal";

  const roundTrip = travelTime * 2;
  const timeLimits = { "2-3 hours": 3, "Half day": 6, "One day": 14, "Weekend": 48 };
  const maxHours = timeLimits[p.available_time] || 14;
  const isFeasible = (roundTrip + 1) <= maxHours;

  const timeline = [];

  if (p.available_time.includes("2-3")) {
    timeline.push({ time: "06:30 AM", title: `Departure from ${p.starting_location}`, desc: `Drive via ${p.transportation} (~${dist} km)`, type: "travel" });
    timeline.push({ time: "07:45 AM", title: `Arrive at ${dest.name}`, desc: `${activities[0] || "Explore scenic views"} in ${dest.district}`, type: "activity" });
    timeline.push({ time: "08:45 AM", title: "Return Journey", desc: `Drive back to ${p.starting_location}`, type: "travel" });
    timeline.push({ time: "10:00 AM", title: "Trip Complete", desc: "Arrived home refreshed", type: "finish" });
  } else if (p.available_time === "Weekend") {
    timeline.push({ time: "Day 1 - 06:00 AM", title: `Highway Departure from ${p.starting_location}`, desc: `Morning drive via ${p.transportation} to ${dest.district}`, type: "travel" });
    timeline.push({ time: "Day 1 - 10:30 AM", title: `Check-in & Refreshments at ${dest.name}`, desc: `Savor ${localFood}`, type: "food" });
    timeline.push({ time: "Day 1 - 01:00 PM", title: `Major Sightseeing: ${activities[0] || "Exploration"}`, desc: dest.description, type: "activity" });
    timeline.push({ time: "Day 1 - 05:00 PM", title: "Sunset Point & Photography", desc: "Scenic vantage point and leisure time", type: "leisure" });
    timeline.push({ time: "Day 2 - 07:00 AM", title: `Morning Experience: ${activities[1] || "Nature walk"}`, desc: "Fresh morning atmosphere", type: "activity" });
    timeline.push({ time: "Day 2 - 02:00 PM", title: "Return Journey", desc: `Head back to ${p.starting_location}`, type: "travel" });
  } else {
    // Standard One-Day or Half-Day Schedule
    timeline.push({ time: "06:00 AM", title: `Departure from ${p.starting_location}`, desc: `Beat highway traffic via ${p.transportation} (~${dist} km)`, type: "travel" });
    timeline.push({ time: "08:15 AM", title: `Arrival & Breakfast at ${dest.name}`, desc: `Enjoy authentic ${localFood}`, type: "food" });
    timeline.push({ time: "09:30 AM", title: `Primary Highlight: ${activities[0] || "Exploration"}`, desc: dest.description, type: "activity" });
    timeline.push({ time: "01:00 PM", title: "Traditional Lunch", desc: `Lunch in ${dest.district} (${dest.vegFriendly ? 'Pure veg available' : 'Regional dining'})`, type: "food" });
    timeline.push({ time: "02:30 PM", title: `Secondary Activity: ${activities[1] || "Photography & heritage walk"}`, desc: "Leisure sightseeing", type: "activity" });
    timeline.push({ time: "05:00 PM", title: "Sunset & Evening Tea", desc: "Unwind with local snacks and scenic views", type: "leisure" });
    timeline.push({ time: "06:00 PM", title: `Return Drive to ${p.starting_location}`, desc: "Comfortable drive back home", type: "travel" });
  }

  return { isFeasible, timeline };
}

// --- Budget Calculator & Optimizer ---
function calculateDetailedBudget(dest, transportMode = state.preferences.transportation, isOptimized = false) {
  const p = state.preferences;
  const dist = getDestinationDistance(dest);
  const roundTrip = dist * 2;
  const baseCost = dest.costPerPersonINR || 500;

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
  const foodPerPerson = isOptimized ? 250 : (dest.foodOptions === "easy" ? 400 : 250);
  const foodCost = foodPerPerson * p.travelers;
  const activityCost = (isOptimized ? Math.round(baseCost * 0.7) : baseCost) * p.travelers;
  const miscCost = 150;

  const total = Math.round(transportCost + foodCost + activityCost + miscCost);
  const perPerson = Math.round(total / p.travelers);

  return {
    transportCost: Math.round(transportCost),
    foodCost: Math.round(foodCost),
    entryCost: Math.round(activityCost),
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
  if (!dest) return;
  const origin = state.preferences.has_custom_loc
    ? `${state.preferences.user_lat},${state.preferences.user_lon}`
    : encodeURIComponent(state.preferences.starting_location);

  const destination = `${dest.lat},${dest.lng}`;
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
        state.preferences.starting_location = `GPS Location (${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)})`;
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

  // View transition animation
  container.className = "container view-animated";

  // Sync active navigation item with currentView
  document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
  const currentNav = document.getElementById(`nav-${state.currentView}`);
  if (currentNav) currentNav.classList.add("active");

  // Update unified header labels
  const userNameEl = document.getElementById("header-user-name");
  const avatarIconEl = document.getElementById("header-avatar-icon");
  if (userNameEl) {
    if (state.currentUser) {
      userNameEl.textContent = state.currentUser.name || "Explorer";
      if (avatarIconEl) avatarIconEl.textContent = "⭐";
    } else {
      userNameEl.textContent = "Guest";
      if (avatarIconEl) avatarIconEl.textContent = "👤";
    }
  }

  // Legacy header compatibility
  const brandTag = document.getElementById("brand-tagline");
  if (brandTag) brandTag.textContent = t("tagline");

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
      if (state.exploreViewMode === "map") {
        setTimeout(initExploreMap, 60);
      }
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

// Header Menu & Modal Helpers
function openMenuSheet() {
  const modal = document.getElementById("menu-modal");
  if (modal) modal.style.display = "flex";
  const accTitle = document.getElementById("menu-account-title");
  const accDesc = document.getElementById("menu-account-desc");
  if (state.currentUser) {
    if (accTitle) accTitle.textContent = `👤 ${state.currentUser.name} (Verified)`;
    if (accDesc) accDesc.textContent = state.currentUser.email;
  } else {
    if (accTitle) accTitle.textContent = "👤 Sign In / Register";
    if (accDesc) accDesc.textContent = "Sign in with Supabase Email OTP";
  }
}

function handleMenuAccountClick() {
  if (state.currentUser) {
    openModal("profile-modal");
  } else {
    openAuthModal("email");
  }
}

function openIntelligenceModal() {
  const modal = document.getElementById("intelligence-modal");
  if (modal) modal.style.display = "flex";
}

// 1. Home View
function renderHomeView() {
  const escapes = state.destinations.slice(0, 6);
  const currMonth = new Date().getMonth() + 1;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const currMonthName = monthNames[currMonth - 1];

  // Trending this season destinations
  const trending = state.destinations.filter(d => Array.isArray(d.bestMonths) && d.bestMonths.includes(currMonth)).slice(0, 8);

  return `
    <!-- Full-Width Karnataka Hero Card -->
    <div class="hero-karnataka">
      <div class="hero-karnataka-badge">📍 Explore Karnataka</div>
      <h1 class="hero-karnataka-title">Karnataka Weekend & Day Trips</h1>
      <p class="hero-karnataka-desc">
        Deterministic recommendations matched to your real budget, available time, and interests across 40 iconic destinations.
      </p>
      <button class="hero-karnataka-cta" onclick="switchView('plan')">
        <span>✨ Start Planning</span> <span>➔</span>
      </button>
    </div>

    <!-- Quick Action Navigation Tiles -->
    <div class="quick-actions-grid">
      <div class="quick-action-tile" onclick="switchView('plan')">
        <div class="quick-action-icon">🧭</div>
        <div class="quick-action-label">Plan Trip</div>
      </div>
      <div class="quick-action-tile" onclick="setExploreRadius(50); switchView('explore');">
        <div class="quick-action-icon">📍</div>
        <div class="quick-action-label">Near Me</div>
      </div>
      <div class="quick-action-tile" onclick="switchView('saved')">
        <div class="quick-action-icon">💾</div>
        <div class="quick-action-label">Saved</div>
      </div>
      <div class="quick-action-tile" onclick="switchView('feedback')">
        <div class="quick-action-icon">⭐</div>
        <div class="quick-action-label">Reviews</div>
      </div>
    </div>

    <!-- Compact "How it Works" Bottom Sheet Trigger Card -->
    <div class="how-it-works-card" onclick="openIntelligenceModal()">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 24px;">💡</span>
        <div>
          <div style="font-weight: 700; font-size: 13px; color: var(--text-main);">How TravelMate Works</div>
          <div style="font-size: 11px; color: var(--text-muted);">8-Factor deterministic scoring model</div>
        </div>
      </div>
      <span style="color: var(--primary); font-size: 12px; font-weight: 700;">Learn more →</span>
    </div>

    <!-- Trending This Season Section -->
    ${trending.length > 0 ? `
      <div class="trending-header-row">
        <div class="section-title" style="margin-bottom: 0;">🔥 Trending in ${currMonthName}</div>
        <span style="font-size: 11px; color: var(--primary); font-weight: 700;">Best Season</span>
      </div>
      <div class="trending-scroll-container">
        ${trending.map(d => `
          <div class="trending-card" onclick="showDestinationDetails('${d.id}')">
            <div class="trending-img-wrap">
              <img src="${d.image}" alt="${d.name}" class="trending-img" onerror="handleImageError(this, '${d.id}')">
              <span class="trending-badge">${currMonthName}</span>
            </div>
            <div class="trending-body">
              <div class="trending-name">${d.name}</div>
              <div class="trending-district">📍 ${d.district}</div>
              <div class="trending-cost">₹${d.costPerPersonINR}/person</div>
            </div>
          </div>
        `).join("")}
      </div>
      <div style="margin-bottom: 18px;"></div>
    ` : ''}

    <!-- Popular Karnataka Escapes Showcase -->
    <div class="section-title">🌟 Popular Karnataka Escapes</div>
    <div class="dest-cards-grid">
      ${escapes.map(d => {
    const dist = getDestinationDistance(d);
    return `
          <div class="dest-card" onclick="showDestinationDetails('${d.id}')">
            <div class="dest-card-img-wrap">
              <img src="${d.image}" alt="${d.name}" class="dest-card-img" onerror="handleImageError(this, '${d.id}')">
              <div class="dest-card-dist-badge">📍 ${dist} km away</div>
            </div>
            <div class="dest-card-body">
              <div class="dest-card-title">${d.name}</div>
              <div class="dest-card-subtitle">${d.district} • ${d.recommendedTime}</div>
              <div class="chip-grid" style="margin: 6px 0;">
                ${(d.interests || []).slice(0, 3).map(i => `<span class="chip" style="font-size:10px; padding:2px 6px;">${i}</span>`).join("")}
              </div>
              <div class="dest-card-footer">
                <span class="dest-card-cost">₹${d.costPerPersonINR} <span style="font-size: 10px; font-weight: normal; color: var(--text-muted);">/person</span></span>
                <span class="chip active" style="font-size: 11px;">View Details →</span>
              </div>
            </div>
          </div>
        `;
  }).join("")}
    </div>

    <button class="btn-primary" style="margin-top: 14px;" onclick="switchView('plan')">
      ${t("btn_plan_my_trip")}
    </button>
  `;
}

// 2. Plan Your Trip 4-Step Wizard View
function setWizardStep(step) {
  if (step >= 1 && step <= 4) {
    state.wizardStep = step;
    renderApp();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function setTransportChoice(mode) {
  state.preferences.transportation = mode;
  renderApp();
}

function setFoodChoice(food) {
  state.preferences.food_preference = food;
  renderApp();
}

function setPeriodChoice(period) {
  state.preferences.travel_period = period;
  renderApp();
}

function renderPlanView() {
  const p = state.preferences;
  const step = state.wizardStep || 1;

  const stepTitles = {
    1: "Step 1 of 4 • Where & Max Distance",
    2: "Step 2 of 4 • Budget & Available Time",
    3: "Step 3 of 4 • Travel Mood & Interests",
    4: "Step 4 of 4 • Transport & Food Choices"
  };

  return `
    <!-- 4-Step Wizard Progress Card -->
    <div class="wizard-progress-card">
      <div class="wizard-step-header">
        <span class="wizard-step-title">🧭 ${stepTitles[step]}</span>
        <span class="wizard-step-count">${step}/4</span>
      </div>
      <div class="wizard-bar-track">
        <div class="wizard-bar-fill" style="width: ${(step / 4) * 100}%;"></div>
      </div>
    </div>

    <!-- Step 1: Starting Location & Distance -->
    ${step === 1 ? `
      <div class="card">
        <div class="section-title">📍 Where Are You Starting From?</div>
        
        <div class="form-group">
          <label class="form-label">${t("lbl_starting_location")}</label>
          <input type="text" id="input-origin" class="form-input" value="${p.starting_location}" placeholder="e.g. Bengaluru, Mysuru, Hubballi...">
          <button id="btn-location-detect" class="loc-btn" onclick="useCurrentLocation()">
            ${p.has_custom_loc ? t("btn_location_active") : t("btn_use_location")}
          </button>
        </div>

        <div class="form-group" style="margin-top: 18px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <label class="form-label" style="margin-bottom: 0;">${t("lbl_max_distance")}</label>
            <span style="font-weight: 800; color: var(--primary-dark); font-size: 14px;" id="val-distance">${p.max_distance} km</span>
          </div>
          <div class="range-container">
            <input type="range" id="input-distance" class="range-slider" min="15" max="450" step="10" value="${p.max_distance}">
          </div>
          <small style="color: var(--text-muted); font-size: 11px;">Calculated using great-circle Haversine formula from origin</small>
        </div>

        <div class="wizard-nav-btns">
          <button class="btn-primary" style="width: 100%;" onclick="setWizardStep(2)">
            Next: Budget & Time ➔
          </button>
        </div>
      </div>
    ` : ''}

    <!-- Step 2: Budget & Available Time -->
    ${step === 2 ? `
      <div class="card">
        <div class="section-title">💰 Group Budget & Duration</div>

        <!-- Number of Travelers -->
        <div class="form-group">
          <label class="form-label">${t("lbl_travelers")}</label>
          <div style="display: flex; align-items: center; gap: 14px; background: var(--surface-subtle); padding: 8px 14px; border-radius: var(--radius-md); border: 1px solid var(--border);">
            <button class="chip" onclick="adjustTravelers(-1)" style="font-size: 16px; padding: 4px 14px; font-weight: 800;">-</button>
            <span style="font-weight: 800; font-size: 18px; color: var(--text-main);" id="val-travelers">${p.travelers}</span>
            <button class="chip" onclick="adjustTravelers(1)" style="font-size: 16px; padding: 4px 14px; font-weight: 800;">+</button>
            <span style="color: var(--text-muted); font-size: 12px; margin-left: auto;">traveler(s) in group</span>
          </div>
        </div>

        <!-- Budget Slider with Large Display -->
        <div class="form-group" style="text-align: center; margin-top: 14px;">
          <label class="form-label" style="text-align: center;">Total Group Budget</label>
          <div class="budget-huge-display" id="val-budget">₹${p.budget.toLocaleString()}</div>
          <div class="range-container">
            <input type="range" id="input-budget" class="range-slider" min="500" max="25000" step="250" value="${p.budget}">
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-top: 4px;">
            <span>₹500 (Budget)</span>
            <span>₹25,000 (Luxury)</span>
          </div>
        </div>

        <!-- Available Time Chips -->
        <div class="form-group" style="margin-top: 16px;">
          <label class="form-label">${t("lbl_time_avail")}</label>
          <div class="chip-grid">
            ${["2-3 hours", "Half day", "One day", "Weekend"].map(opt => `
              <span class="chip ${p.available_time === opt ? 'active' : ''}" onclick="selectTime('${opt}')">${opt}</span>
            `).join("")}
          </div>
        </div>

        <div class="wizard-nav-btns">
          <button class="btn-secondary" style="flex: 1;" onclick="setWizardStep(1)">← Back</button>
          <button class="btn-primary" style="flex: 2;" onclick="setWizardStep(3)">Next: Interests ➔</button>
        </div>
      </div>
    ` : ''}

    <!-- Step 3: Interests & Travel Mood -->
    ${step === 3 ? `
      <div class="card">
        <div class="section-title">✨ Mood & Activities</div>

        <!-- Travel Mood Chips -->
        <div class="form-group">
          <label class="form-label">${t("lbl_travel_mood")}</label>
          <div class="chip-grid">
            ${ALL_MOODS.map(m => `
              <span class="chip ${p.travel_mood === m ? 'active' : ''}" onclick="selectMood('${m}')">${m}</span>
            `).join("")}
          </div>
        </div>

        <!-- Interests Multi-select -->
        <div class="form-group" style="margin-top: 16px;">
          <label class="form-label">${t("lbl_interests")} (Tap to select multiple)</label>
          <div>
            ${ALL_INTERESTS.map(item => `
              <span class="interest-tag ${p.interests.includes(item) ? 'selected' : ''}" onclick="toggleInterest('${item}')">
                ${p.interests.includes(item) ? '✓ ' : '+ '}${item}
              </span>
            `).join("")}
          </div>
        </div>

        <div class="wizard-nav-btns">
          <button class="btn-secondary" style="flex: 1;" onclick="setWizardStep(2)">← Back</button>
          <button class="btn-primary" style="flex: 2;" onclick="setWizardStep(4)">Next: Preferences ➔</button>
        </div>
      </div>
    ` : ''}

    <!-- Step 4: Transport & Food Preferences -->
    ${step === 4 ? `
      <div class="card">
        <div class="section-title">🚗 Transport & Dining Preferences</div>

        <!-- Transportation Icon Chips -->
        <div class="form-group">
          <label class="form-label">${t("lbl_transport")} Mode</label>
          <div class="icon-choice-grid">
            ${[
        { id: "Car", icon: "🚗", label: "Car" },
        { id: "Bike", icon: "🏍️", label: "Bike" },
        { id: "Bus", icon: "🚌", label: "Bus" },
        { id: "Train", icon: "🚂", label: "Train" },
        { id: "Cab", icon: "🚕", label: "Cab" },
        { id: "Public transport", icon: "🚊", label: "Public" }
      ].map(m => `
              <button type="button" class="icon-choice-btn ${p.transportation === m.id ? 'active' : ''}" onclick="setTransportChoice('${m.id}')">
                <span style="font-size: 20px;">${m.icon}</span>
                <span>${m.label}</span>
              </button>
            `).join("")}
          </div>
        </div>

        <!-- Food Preference Icon Chips -->
        <div class="form-group" style="margin-top: 16px;">
          <label class="form-label">${t("lbl_food_pref")}</label>
          <div class="icon-choice-grid">
            ${[
        { id: "Vegetarian", icon: "🥗", label: "Pure Veg" },
        { id: "Non-vegetarian", icon: "🍗", label: "Non-Veg" },
        { id: "Vegan", icon: "🌱", label: "Vegan" },
        { id: "Jain", icon: "🍲", label: "Jain Food" },
        { id: "No preference", icon: "🍽️", label: "Any Food" }
      ].map(f => `
              <button type="button" class="icon-choice-btn ${p.food_preference === f.id ? 'active' : ''}" onclick="setFoodChoice('${f.id}')">
                <span style="font-size: 20px;">${f.icon}</span>
                <span>${f.label}</span>
              </button>
            `).join("")}
          </div>
        </div>

        <!-- Travel Period -->
        <div class="form-group" style="margin-top: 16px;">
          <label class="form-label">${t("lbl_travel_period")}</label>
          <div class="chip-grid">
            ${["January-March", "April-June", "July-September", "October-December", "Flexible dates"].map(s => `
              <span class="chip ${p.travel_period === s ? 'active' : ''}" onclick="setPeriodChoice('${s}')">${s}</span>
            `).join("")}
          </div>
        </div>

        <div class="wizard-nav-btns" style="margin-top: 20px;">
          <button class="btn-secondary" style="flex: 1;" onclick="setWizardStep(3)">← Back</button>
          <button class="btn-primary" style="flex: 2; background: linear-gradient(135deg, #059669, #047857);" onclick="submitTripForm()">
            ✨ Find My Trip ➔
          </button>
        </div>
      </div>
    ` : ''}
  `;
}

function bindPlanFormEvents() {
  const bSlider = document.getElementById("input-budget");
  if (bSlider) {
    bSlider.addEventListener("input", (e) => {
      state.preferences.budget = parseInt(e.target.value);
      const valEl = document.getElementById("val-budget");
      if (valEl) valEl.textContent = `₹${parseInt(e.target.value).toLocaleString()}`;
    });
  }

  const dSlider = document.getElementById("input-distance");
  if (dSlider) {
    dSlider.addEventListener("input", (e) => {
      state.preferences.max_distance = parseInt(e.target.value);
      const valEl = document.getElementById("val-distance");
      if (valEl) valEl.textContent = `${e.target.value} km`;
    });
  }

  const originInput = document.getElementById("input-origin");
  if (originInput) {
    originInput.addEventListener("change", (e) => {
      state.preferences.starting_location = e.target.value;
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
  const n = (state.destinations && Array.isArray(state.destinations)) ? state.destinations.length : 0;
  if (n === 0) {
    return `
      <div class="card" style="text-align: center; padding: 32px 16px;">
        <div style="background: #ef4444; color: #ffffff; padding: 16px; border-radius: 12px; font-weight: 800; font-size: 15px; margin-bottom: 12px; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);">
          Unable to load destinations
        </div>
        <p style="color: var(--text-muted); font-size: 13px; margin: 8px 0 16px;">
          Please check your connection and reload the app.
        </p>
        <button class="btn-primary" onclick="switchView('home')">Return Home</button>
      </div>
    `;
  }

  if (!state.recommendations || state.recommendations.length === 0) {
    const origin = getOriginCoords();
    const sortedByDist = [...state.destinations].map(d => ({ ...d, dist: getDestinationDistance(d) })).sort((a,b) => a.dist - b.dist);
    const closest = sortedByDist[0];
    return `
      <div class="card" style="text-align: center; padding: 32px 16px;">
        <div style="font-size: 40px; margin-bottom: 8px;">🔍</div>
        <h3>No Exact Destinations Found Within ${state.preferences.max_distance} km</h3>
        <p style="color: var(--text-muted); font-size: 13px; margin: 8px 0 16px; line-height: 1.5;">
          All <strong>${n}</strong> destinations are loaded, but none are within your chosen limit (${state.preferences.max_distance} km) from origin (<strong>${origin.lat.toFixed(2)}, ${origin.lng.toFixed(2)}</strong>).<br>
          The closest destination is <strong>${closest.name}</strong> (${closest.dist} km away).
        </p>
        <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
          <button class="btn-accent" style="width: auto; padding: 12px 20px;" onclick="state.preferences.max_distance = ${Math.max(closest.dist + 20, 300)}; submitTripForm();">
            Expand Radius to ${Math.max(closest.dist + 20, 300)} km
          </button>
          <button class="btn-primary" style="width: auto; padding: 12px 20px;" onclick="switchView('plan')">Adjust Preferences</button>
        </div>
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
            <img src="${d.image}" alt="${d.name}" class="rec-img" onerror="handleImageError(this, '${d.id}')">
            <div class="rec-badge-score">
              Match <span>${item.overall_score}%</span>
            </div>
          </div>
          <div class="rec-content">
            <div class="rec-header">
              <span class="rec-name">${idx + 1}. ${d.name}</span>
              <span class="rec-region">${d.district}</span>
            </div>

            <!-- Meta statistics -->
            <div class="rec-meta-grid">
              <div class="rec-meta-item">
                <span class="rec-meta-label">Distance</span>
                <span class="rec-meta-val">${item.distance_km} km</span>
              </div>
              <div class="rec-meta-item">
                <span class="rec-meta-label">Est. Travel</span>
                <span class="rec-meta-val">~${item.estimated_travel_time_hours} hrs</span>
              </div>
              <div class="rec-meta-item">
                <span class="rec-meta-label">Group Cost</span>
                <span class="rec-meta-val">₹${item.estimated_group_cost}</span>
              </div>
            </div>

            <!-- Explainable 8-Factor Breakdown -->
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
              <div class="factor-row">
                <span class="factor-name">Food (10%)</span>
                <div class="factor-track"><div class="factor-fill" style="width: ${scores.food}%;"></div></div>
                <span class="factor-num">${scores.food}%</span>
              </div>
              <div class="factor-row">
                <span class="factor-name">Distance (10%)</span>
                <div class="factor-track"><div class="factor-fill" style="width: ${scores.distance}%;"></div></div>
                <span class="factor-num">${scores.distance}%</span>
              </div>
              <div class="factor-row">
                <span class="factor-name">Transport (5%)</span>
                <div class="factor-track"><div class="factor-fill" style="width: ${scores.transportation}%;"></div></div>
                <span class="factor-num">${scores.transportation}%</span>
              </div>
              <div class="factor-row">
                <span class="factor-name">Season (5%)</span>
                <div class="factor-track"><div class="factor-fill" style="width: ${scores.season}%;"></div></div>
                <span class="factor-num">${scores.season}%</span>
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

            <!-- Day-Wise Suggested Itinerary Timeline -->
            ${(() => {
        const itin = generateItineraryForDestination(d);
        return `
                <div style="margin: 12px 0; background: var(--surface-subtle); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border);">
                  <div style="font-weight: 800; font-size: 12px; color: var(--primary-dark); margin-bottom: 8px;">
                    🗓️ Day-Wise Suggested Schedule (${d.recommendedTime})
                  </div>
                  <div class="itinerary-timeline-v2" style="display: flex; flex-direction: column; gap: 8px;">
                    ${(itin.timeline || []).slice(0, 4).map(step => `
                      <div style="display: flex; gap: 8px; font-size: 11px; align-items: flex-start;">
                        <span style="font-weight: 700; color: var(--text-muted); min-width: 62px;">${step.time}</span>
                        <div><strong>${step.title}</strong> — <span style="color: var(--text-muted);">${step.desc}</span></div>
                      </div>
                    `).join("")}
                  </div>
                </div>
              `;
      })()}

            <!-- Actions: Save, WhatsApp, Google Maps, Details -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px;">
              <button class="btn-primary" style="padding: 9px;" onclick="saveTripToProfile('${d.id}')">
                💾 Save Trip
              </button>
              <button class="btn-whatsapp" style="padding: 9px;" onclick="shareTripOnWhatsApp('${d.id}')">
                💬 WhatsApp
              </button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">
              <button class="btn-maps" style="padding: 9px;" onclick="openGoogleMapsDirections('${d.id}')">
                🗺️ Google Maps
              </button>
              <button class="btn-secondary" style="padding: 9px;" onclick="showDestinationDetails('${d.id}')">
                📖 Full Details
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

// WhatsApp Share and Google Maps Navigation Handlers
function shareTripOnWhatsApp(destId) {
  const d = state.destinations.find(x => String(x.id) === String(destId));
  if (!d) return;
  const p = state.preferences;
  const dist = getDestinationDistance(d);
  const text = encodeURIComponent(
    `🧭 *TravelMate AI Karnataka Trip Plan*\n\n` +
    `📍 *${d.name}* (${d.district})\n` +
    `🚗 Distance: ~${dist} km from ${p.starting_location}\n` +
    `⏱️ Recommended Duration: ${d.recommendedTime}\n` +
    `💰 Est. Cost: ₹${d.costPerPersonINR}/person (Group: ₹${d.costPerPersonINR * p.travelers})\n` +
    `☀️ Best Season: ${formatBestMonths(d.bestMonths)}\n\n` +
    `🗺️ Directions: https://www.google.com/maps/dir/?api=1&origin=${p.starting_location}&destination=${d.lat},${d.lng}\n\n` +
    `Planned with TravelMate AI — Karnataka Smart Travel Companion!`
  );
  window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
}

function openGoogleMapsDirections(destId) {
  let d = typeof destId === "object" ? destId : state.destinations.find(x => String(x.id) === String(destId));
  if (!d) d = state.selectedDestination;
  if (!d) return;
  const origin = getOriginCoords();
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${d.lat},${d.lng}`;
  window.open(mapsUrl, "_blank");
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
              <td style="padding: 10px; text-align: center;">${r.distance_km} km</td>
            `).join("")}
          </tr>
          <tr style="background: #f8fafc;">
            <td style="padding: 10px; font-weight: 600;">Travel Time</td>
            ${state.recommendations.map(r => `
              <td style="padding: 10px; text-align: center;">~${r.estimated_travel_time_hours} hrs</td>
            `).join("")}
          </tr>
          <tr>
            <td style="padding: 10px; font-weight: 600;">Best Season</td>
            ${state.recommendations.map(r => `
              <td style="padding: 10px; text-align: center; font-size: 11px;">${formatBestMonths(r.destination.bestMonths)}</td>
            `).join("")}
          </tr>
          <tr style="background: #f8fafc;">
            <td style="padding: 10px; font-weight: 600;">Action</td>
            ${state.recommendations.map(r => `
              <td style="padding: 10px; text-align: center;">
                <button class="chip active" onclick="showDestinationDetails('${r.destination.id}')">Select</button>
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
  const d = state.destinations.find(x => String(x.id) === String(destId));
  if (!d) return;
  state.selectedDestination = d;
  switchView("details");
}

function renderDetailsView() {
  const d = state.selectedDestination;
  if (!d) return `<div class="card">No destination selected.</div>`;

  const dist = getDestinationDistance(d);
  const itin = generateItineraryForDestination(d);
  const budget = calculateDetailedBudget(d);

  return `
    <div style="margin-bottom: 12px;">
      <button class="chip active" onclick="switchView('results')">← ${t("sec_recommendations")}</button>
    </div>

    <!-- Header Card -->
    <div class="card" style="padding: 0; overflow: hidden;">
      <div style="height: 180px; width: 100%; position: relative;">
        <img src="${d.image}" alt="${d.name}" style="width: 100%; height: 100%; object-fit: cover;" onerror="handleImageError(this, '${d.id}')">
        <div style="position: absolute; bottom: 12px; left: 16px; right: 16px; color: white; text-shadow: 0 2px 4px rgba(0,0,0,0.85);">
          <h1 style="font-size: 22px; font-weight: 800; line-height: 1.2;">${d.name}</h1>
          <p style="font-size: 12px; opacity: 0.95;">${d.district}, Karnataka • ${d.recommendedTime}</p>
        </div>
      </div>
      <div style="padding: 16px;">
        <p style="font-size: 13px; color: var(--text-main); margin-bottom: 12px; line-height: 1.5;">${d.description}</p>
        <div class="chip-grid" style="margin-bottom: 12px;">
          <span class="chip">🚗 ${dist} km away</span>
          <span class="chip">⏱️ ${d.recommendedTime}</span>
          <span class="chip">💰 ₹${d.costPerPersonINR}/person</span>
          <span class="chip">${d.vegFriendly ? '🥗 Pure Veg Options' : '🍗 Mixed Dining'}</span>
          <span class="chip">🍽️ ${d.foodOptions === 'easy' ? 'Easy Dining' : 'Limited Food'}</span>
        </div>

        <div style="display: flex; gap: 8px;">
          <button class="btn-primary" style="flex: 2;" onclick="openGoogleMapsDirections(state.selectedDestination)">
            ${t("btn_open_maps")} ↗
          </button>
          <button class="btn-secondary" style="flex: 1;" onclick="saveTripToProfile('${d.id}')">
            💾 Save
          </button>
        </div>
      </div>
    </div>

    <!-- Smart Route Section -->
    <div class="card">
      <div class="section-title">🗺️ Route & Navigation</div>
      <div class="route-box">
        <div class="route-header">
          <span style="font-weight: 700;">From: ${state.preferences.starting_location}</span>
          <span style="color: var(--primary); font-weight: 700;">To: ${d.name} (${d.district})</span>
        </div>
        <div style="display: flex; gap: 8px; margin: 10px 0;">
          <button class="chip ${state.preferences.transportation === 'Car' ? 'active' : ''}" onclick="setTravelMode('Car')">🚗 Driving</button>
          <button class="chip ${state.preferences.transportation === 'Bike' ? 'active' : ''}" onclick="setTravelMode('Bike')">🏍️ Bike</button>
          <button class="chip ${state.preferences.transportation === 'Bus' ? 'active' : ''}" onclick="setTravelMode('Bus')">🚌 Transit</button>
        </div>
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 10px;">
          • Haversine Distance: ~${dist} km<br>
          • Recommended Modes: ${(d.transport || []).join(", ") || "Car, Bus"}<br>
          • Mood Vibe: ${(d.moods || []).join(", ") || "Scenic"}
        </div>
        <button class="btn-secondary" style="width: 100%;" onclick="openGoogleMapsDirections(state.selectedDestination)">
          Open GPS Navigation
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

    <!-- Budget Breakdown Section -->
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
          <td>Sightseeing & Entry Fees</td>
          <td style="text-align: right;">₹${budget.entryCost}</td>
        </tr>
        <tr>
          <td>Parking & Miscellaneous</td>
          <td style="text-align: right;">₹${budget.miscCost}</td>
        </tr>
        <tr style="font-weight: 700; border-top: 2px solid var(--border);">
          <td>Total Estimated Group Cost</td>
          <td style="text-align: right; color: var(--primary-dark);">₹${budget.totalGroupCost}</td>
        </tr>
      </table>

      <div style="font-size: 12px; margin: 12px 0; display: flex; justify-content: space-between;">
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
        <strong>Best Months to Visit:</strong> ${formatBestMonths(d.bestMonths)}<br>
        <strong>Interests & Activities:</strong> ${(d.interests || []).join(", ")}
      </p>
      <div style="font-size: 12px; margin-bottom: 6px;"><strong>Recommended Packing:</strong></div>
      <div class="chip-grid">
        <span class="chip">👟 Grip walking shoes</span>
        <span class="chip">💧 Reusable water bottle</span>
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

// 6. Explore Nearby View with List/Map Toggle, Search & Category Filters
let exploreMapInstance = null;

function setExploreViewMode(mode) {
  state.exploreViewMode = mode;
  renderApp();
}

function setExploreCategory(cat) {
  state.exploreCategory = cat;
  renderApp();
}

function handleExploreSearch(query) {
  state.exploreSearchQuery = query;
  renderApp();
}

function initExploreMap() {
  const mapEl = document.getElementById("explore-map");
  if (!mapEl) return;

  if (typeof L === "undefined") {
    mapEl.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted);">Leaflet library loading...</div>`;
    return;
  }

  // Teardown previous instance if exists
  if (exploreMapInstance) {
    try {
      exploreMapInstance.remove();
    } catch (e) { }
    exploreMapInstance = null;
  }

  const origin = getOriginCoords();
  exploreMapInstance = L.map("explore-map", {
    zoomControl: true,
    scrollWheelZoom: false
  }).setView([origin.lat, origin.lng], 8);

  const tileLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "© OpenStreetMap contributors"
  });

  tileLayer.on("tileerror", () => {
    const banner = document.getElementById("map-offline-banner");
    if (banner) banner.style.display = "flex";
  });

  tileLayer.addTo(exploreMapInstance);

  // User location marker
  const userIcon = L.divIcon({
    className: "user-loc-icon",
    html: `<div style="background:#059669; color:#fff; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.3); font-size:14px;">📍</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
  L.marker([origin.lat, origin.lng], { icon: userIcon })
    .addTo(exploreMapInstance)
    .bindPopup(`<strong>Your Origin:</strong><br>${state.preferences.starting_location}`);

  // Get current filtered places
  const currentFiltered = getFilteredExploreDestinations();

  // Destination markers
  currentFiltered.forEach(d => {
    if (typeof d.lat !== "number" || typeof d.lng !== "number") return;
    const marker = L.marker([d.lat, d.lng]).addTo(exploreMapInstance);
    const popupContent = `
      <div style="font-family: inherit; min-width: 150px;">
        <div style="font-weight: 800; font-size: 13px; color: #065f46;">${d.name}</div>
        <div style="font-size: 11px; color: #64748b;">📍 ${d.district} • ${d.distance} km</div>
        <div style="font-size: 11px; font-weight: 700; margin: 4px 0;">₹${d.costPerPersonINR}/person</div>
        <button style="background:#059669; color:#fff; border:none; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;" onclick="showDestinationDetails('${d.id}')">View Details ➔</button>
      </div>
    `;
    marker.bindPopup(popupContent);
  });
}

function getFilteredExploreDestinations() {
  const radius = state.exploreRadius || "all";
  const cat = state.exploreCategory || "all";
  const search = (state.exploreSearchQuery || "").trim().toLowerCase();

  return state.destinations
    .map(d => ({
      ...d,
      distance: getDestinationDistance(d)
    }))
    .filter(d => {
      // Radius filter
      if (radius !== "all" && d.distance > radius) return false;
      // Category filter
      if (cat !== "all") {
        const tags = (d.interests || []).concat(d.moods || []).join(" ").toLowerCase();
        const catKey = cat.toLowerCase();
        if (catKey === "historical" || catKey === "heritage") {
          if (!tags.includes("historic") && !tags.includes("heritage")) return false;
        } else if (!tags.includes(catKey)) {
          return false;
        }
      }
      // Search filter
      if (search) {
        const text = `${d.name} ${d.district} ${d.description || ""}`.toLowerCase();
        if (!text.includes(search)) return false;
      }
      return true;
    })
    .sort((a, b) => a.distance - b.distance);
}

function renderExploreView() {
  const n = (state.destinations && Array.isArray(state.destinations)) ? state.destinations.length : 0;
  const radius = state.exploreRadius || "all";
  const cat = state.exploreCategory || "all";
  const filtered = getFilteredExploreDestinations();

  const CATEGORIES = [
    { id: "all", label: "All" },
    { id: "Nature", label: "🌿 Nature" },
    { id: "Mountains", label: "⛰️ Mountains" },
    { id: "Historical", label: "🏛️ Heritage / History" },
    { id: "Waterfalls", label: "🌊 Waterfalls" },
    { id: "Wildlife", label: "🐅 Wildlife" },
    { id: "Adventure", label: "🧗 Adventure" },
    { id: "Temples", label: "🛕 Temples" },
    { id: "Parks", label: "🌳 Parks" }
  ];

  return `
    <div class="card">
      <!-- Top Bar with List/Map Segmented Toggle -->
      <div class="explore-top-bar">
        <div class="section-title" style="margin-bottom: 0;">🧭 ${t("btn_explore_nearby")}</div>
        <div class="view-toggle">
          <button class="view-toggle-btn ${state.exploreViewMode === 'list' ? 'active' : ''}" onclick="setExploreViewMode('list')">📋 List</button>
          <button class="view-toggle-btn ${state.exploreViewMode === 'map' ? 'active' : ''}" onclick="setExploreViewMode('map')">🗺️ Map</button>
        </div>
      </div>

      <!-- Search Input Bar -->
      <div class="search-box-wrap">
        <span class="search-box-icon">🔍</span>
        <input type="text" id="explore-search-input" class="search-box-input" placeholder="Search by destination, district, or tag..." value="${state.exploreSearchQuery || ''}" oninput="handleExploreSearch(this.value)">
      </div>

      <!-- Category Filter Chips -->
      <div class="filter-chips-scroll">
        ${CATEGORIES.map(c => `
          <button type="button" class="chip ${cat === c.id ? 'active' : ''}" style="white-space: nowrap; font-size: 11px;" onclick="setExploreCategory('${c.id}')">
            ${c.label}
          </button>
        `).join("")}
      </div>

      <!-- Distance Radius Filter Chips -->
      <div class="chip-grid" style="margin-bottom: 14px;">
        <span class="chip ${radius === 50 ? 'active' : ''}" onclick="setExploreRadius(50)">Within 50 km</span>
        <span class="chip ${radius === 100 ? 'active' : ''}" onclick="setExploreRadius(100)">Within 100 km</span>
        <span class="chip ${radius === 200 ? 'active' : ''}" onclick="setExploreRadius(200)">Within 200 km</span>
        <span class="chip ${radius === 'all' ? 'active' : ''}" onclick="setExploreRadius('all')">All Karnataka</span>
      </div>

      <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
        Showing <strong>${filtered.length}</strong> of <strong>${state.destinations.length}</strong> destinations sorted by proximity from <strong>${state.preferences.starting_location}</strong>.
      </p>

      <!-- Map View Container -->
      ${state.exploreViewMode === 'map' ? `
        <div id="map-offline-banner" class="map-offline-banner" style="display: none;">
          ⚠️ Offline Mode: Showing local marker coordinates. Internet required for OpenStreetMap tiles.
        </div>
        <div id="explore-map"></div>
        <p style="font-size: 11px; color: var(--text-muted); text-align: center;">
          Tap any marker on the map to view destination distance and trip details.
        </p>
      ` : `
        <!-- List View -->
        ${n === 0 ? `
          <div style="background: #fee2e2; border: 2px solid #ef4444; color: #b91c1c; padding: 20px 16px; border-radius: 12px; text-align: center; margin: 16px 0;">
            <div style="font-size: 28px; margin-bottom: 6px;">🚨</div>
            <div style="font-weight: 800; font-size: 15px;">Unable to load destinations</div>
            <div style="font-size: 12px; margin-top: 4px;">Please return home or refresh the app.</div>
          </div>
        ` : filtered.length === 0 ? `
          <div style="text-align: center; padding: 28px 16px; color: var(--text-muted); font-size: 13px;">
            <div style="font-size: 24px; margin-bottom: 8px;">📍</div>
            <div style="font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
              All ${n} destinations loaded, but none are within ${radius} km of your location.
            </div>
            <p style="font-size: 12px; margin-bottom: 14px;">
              Try tapping "All Karnataka" to view all 40 destinations sorted by proximity.
            </p>
            <button class="chip active" style="padding: 6px 16px; font-size: 12px;" onclick="setExploreRadius('all')">Show All Karnataka Places</button>
          </div>
        ` : `
          <div class="dest-cards-list">
            ${filtered.map(d => `
              <div class="dest-card" onclick="showDestinationDetails('${d.id}')">
                <div class="dest-card-img-wrap">
                  <img src="${d.image}" alt="${d.name}" class="dest-card-img" onerror="handleImageError(this, '${d.id}')">
                  <div class="dest-card-dist-badge">📍 ${d.distance} km away</div>
                </div>
                <div class="dest-card-body">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                    <div>
                      <div class="dest-card-title">${d.name}</div>
                      <div class="dest-card-subtitle">${d.district} • ${d.recommendedTime}</div>
                    </div>
                    <span class="badge-season">☀️ Best: ${formatBestMonths(d.bestMonths).split(',')[0]}</span>
                  </div>
                  <p style="font-size: 12px; color: var(--text-muted); margin: 6px 0;">${d.description}</p>
                  <div class="chip-grid" style="margin: 6px 0;">
                    ${(d.interests || []).slice(0, 3).map(i => `<span class="chip" style="font-size: 10px; padding: 2px 6px;">${i}</span>`).join("")}
                  </div>
                  <div class="dest-card-footer">
                    <span class="dest-card-cost">₹${d.costPerPersonINR} <span style="font-size: 10px; font-weight: normal; color: var(--text-muted);">/person</span></span>
                    <button class="chip active" style="font-size: 11px;" onclick="event.stopPropagation(); showDestinationDetails('${d.id}')">View Details →</button>
                  </div>
                </div>
              </div>
            `).join("")}
          </div>
        `}
      `}
    </div>
  `;
}

function setExploreRadius(radius) {
  state.exploreRadius = radius;
  renderApp();
}

// 7. Saved Trips View with Illustrated Empty State & Actions
function renderSavedTripsView() {
  const trips = state.savedTrips;
  return `
    <div class="card">
      <div class="section-title">💾 ${t("sec_saved_trips")} (${trips.length})</div>
      ${!state.currentUser ? `
        <div style="background: var(--primary-soft); padding: 10px; border-radius: var(--radius-md); font-size: 12px; color: var(--primary-dark); margin-bottom: 12px;">
          ℹ️ Trips are securely saved in your local device storage and accessible offline.
        </div>
      ` : ''}

      ${trips.length === 0 ? `
        <!-- Illustrated Empty State -->
        <div class="empty-state-wrap">
          <div class="empty-state-icon">🎒</div>
          <div class="empty-state-title">No Saved Trips Yet</div>
          <div class="empty-state-desc">
            Explore 40 scenic Karnataka escapes or build a personalized itinerary, then tap "Save Trip" to keep your favorites handy!
          </div>
          <button class="btn-primary" onclick="switchView('plan')">
            🧭 Plan a Trip
          </button>
        </div>
      ` : `
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${trips.map((tr, idx) => `
            <div class="saved-trip-card">
              <div style="flex: 1;">
                <div style="font-weight: 700; font-size: 14px;">${tr.destination_name}</div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                  📍 ${tr.district || 'Karnataka'} • ₹${tr.cost_per_person || tr.budget}/person • Mode: ${tr.travel_mode || 'Car'}
                </div>
                <div style="font-size: 10px; color: var(--text-muted);">Saved on ${tr.date || 'Recent'}</div>
              </div>
              <div style="display: flex; gap: 6px; align-items: center;">
                <button class="chip active" onclick="showDestinationDetails('${tr.destination_id}')">Open</button>
                <button class="chip" style="color: #25d366; border-color: #86efac;" onclick="shareTripOnWhatsApp('${tr.destination_id}')" title="Share on WhatsApp">💬</button>
                <button class="chip" style="color: #dc2626; border-color: #fca5a5;" onclick="deleteSavedTrip(${idx})" title="Delete Trip">✕</button>
              </div>
            </div>
          `).join("")}
        </div>
      `}
    </div>
  `;
}

function saveTripToProfile(destId) {
  const d = state.destinations.find(x => String(x.id) === String(destId));
  if (!d) return;

  const trip = {
    id: Date.now(),
    destination_id: d.id,
    destination_name: d.name,
    district: d.district,
    cost_per_person: d.costPerPersonINR,
    budget: state.preferences.budget,
    travel_mode: state.preferences.transportation,
    date: new Date().toLocaleDateString()
  };

  state.savedTrips.push(trip);
  localStorage.setItem("travelmate_saved_trips", JSON.stringify(state.savedTrips));
  alert(`✓ Trip to ${d.name} saved!`);
  renderApp();
}

function deleteSavedTrip(idx) {
  state.savedTrips.splice(idx, 1);
  localStorage.setItem("travelmate_saved_trips", JSON.stringify(state.savedTrips));
  renderApp();
}

// 8. Reviews View with Interactive Tappable Stars & Dynamic Stored Reviews
function setReviewStars(stars) {
  state.selectedReviewStars = stars;
  const starsContainer = document.getElementById("star-rating-selector");
  if (starsContainer) {
    starsContainer.querySelectorAll(".star-btn").forEach((btn, i) => {
      btn.classList.toggle("active", i < stars);
    });
  }
}

function renderFeedbackView() {
  const reviews = state.feedbacks || [];
  const avg = reviews.length ? (reviews.reduce((a, b) => a + (Number(b.rating) || 5), 0) / reviews.length).toFixed(1) : "5.0";
  const starsCount = Math.round(Number(avg));
  const starsDisplay = "★".repeat(starsCount) + "☆".repeat(5 - starsCount);

  return `
    <div class="card">
      <div class="section-title">⭐ Traveler Reviews & Community Ratings</div>

      <!-- Real Dynamic Community Rating Banner (Computed Strictly from Stored Reviews) -->
      <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px; background: var(--surface-subtle); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border);">
        <div style="font-size: 36px; font-weight: 900; color: var(--primary-dark);">${avg}</div>
        <div style="font-size: 12px;">
          <div style="color: #f59e0b; font-size: 15px; font-weight: 700; letter-spacing: 2px;">${starsDisplay}</div>
          <div style="color: var(--text-muted); margin-top: 2px;">Based on ${reviews.length} traveler reviews</div>
        </div>
      </div>

      <!-- Add Review Form -->
      <div class="section-title" style="font-size: 14px; margin-top: 14px;">✍️ Write a Review</div>

      <div class="form-group">
        <label class="form-label">Destination Visited (${state.destinations.length} Available)</label>
        <select id="fb-destination" class="form-select">
          ${state.destinations.map(d => `<option value="${d.name}">${d.name} (${d.district})</option>`).join("")}
        </select>
      </div>

      <!-- Tappable Star Rating -->
      <div class="form-group">
        <label class="form-label">Your Rating</label>
        <div class="star-rating-select" id="star-rating-selector">
          ${[1, 2, 3, 4, 5].map(s => `
            <span class="star-btn ${s <= (state.selectedReviewStars || 5) ? 'active' : ''}" onclick="setReviewStars(${s})">★</span>
          `).join("")}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Your Name</label>
        <input type="text" id="fb-user-name" class="form-input" placeholder="e.g. Priyanshu, Rohan..." value="${state.currentUser ? state.currentUser.name : ''}">
      </div>

      <div class="form-group">
        <label class="form-label">Review & Travel Tips</label>
        <textarea id="fb-comments" class="form-input" rows="3" placeholder="Share your experience, best photo spots, or food recommendations..."></textarea>
      </div>

      <button class="btn-primary" onclick="submitUserFeedback()">
        Post Community Review
      </button>

      <!-- Dynamic Community Reviews List -->
      <div class="section-title" style="font-size: 14px; margin-top: 24px;">💬 Recent Community Reviews (${reviews.length})</div>
      <div style="margin-top: 10px;">
        ${reviews.map(rev => {
    const rStars = "★".repeat(rev.rating || 5) + "☆".repeat(5 - (rev.rating || 5));
    return `
            <div class="review-item-card">
              <div class="review-item-header">
                <span class="review-item-user">${rev.name || 'Anonymous Traveler'}</span>
                <span class="review-item-date">${rev.date || 'Recent'}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span class="review-item-dest">📍 ${rev.destination || rev.dest || 'Karnataka'}</span>
                <span style="color: #f59e0b; font-size: 12px; letter-spacing: 1px;">${rStars}</span>
              </div>
              <p class="review-item-text">${rev.comment || rev.comments || 'Great experience!'}</p>
            </div>
          `;
  }).join("")}
      </div>
    </div>
  `;
}

function submitUserFeedback() {
  const dest = document.getElementById("fb-destination")?.value || (state.destinations[0] && state.destinations[0].name) || "Nandi Hills";
  const name = document.getElementById("fb-user-name")?.value.trim() || (state.currentUser ? state.currentUser.name : "Fellow Traveler");
  const comment = document.getElementById("fb-comments")?.value.trim();
  const rating = state.selectedReviewStars || 5;

  if (!comment) {
    alert("Please write a short comment about your experience.");
    return;
  }

  const newReview = {
    id: "rev_" + Date.now(),
    name: name,
    destination: dest,
    rating: rating,
    comment: comment,
    date: new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
  };

  state.feedbacks.unshift(newReview);
  localStorage.setItem("travelmate_feedbacks", JSON.stringify(state.feedbacks));
  alert(`✓ Thank you ${name}! Your review for ${dest} has been published.`);
  renderApp();
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
  if (!d) d = { name: "Karnataka", costPerPersonINR: 600, bestMonths: [10, 11, 12, 1, 2] };

  const destName = d.name || "Karnataka";
  const avgCost = d.costPerPersonINR || 600;
  const bestSeason = formatBestMonths(d.bestMonths) || "October to March";
  const bestMonths = formatBestMonths(d.bestMonths) || "October to February";
  const localFood = d.foodOptions === "easy" ? "Mysore Masala Dosa, Filter Coffee, and Bisi Bele Bath" : "Regional snacks and tiffins";
  const activities = Array.isArray(d.interests) ? d.interests.join(", ") : "Heritage walks, Nature trails, and Scenic viewpoints";

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
    const dist = getDestinationDistance(d) || 120;
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
  const currentRec = (state.recommendations || []).find(r => r.destination && String(r.destination.id) === String(d.id));
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
        try { errDetail = await res.text(); } catch (__) { }
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

