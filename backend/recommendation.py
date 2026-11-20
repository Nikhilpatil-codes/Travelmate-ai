"""
Explainable Content-Based Recommendation Engine for TravelMate AI.
Computes deterministic multi-factor compatibility scores (0-100) using 8 weighted factors:
1. Budget compatibility (20%)
2. Interest compatibility (20%)
3. Time compatibility (15%)
4. Travel mood (15%)
5. Food compatibility (10%)
6. Distance compatibility (10%)
7. Transportation (5%)
8. Seasonal suitability (5%)
"""

import os
import math
import pandas as pd
import numpy as np
from typing import Dict, Any, List, Tuple

DATASET_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "destinations.csv")

# Time mappings to max feasible trip hours
TIME_MAPPINGS = {
    "2-3 hours": 3.0,
    "2–3 hours": 3.0,
    "Half day": 6.0,
    "One day": 14.0,
    "Weekend": 48.0
}

# Season mappings for months
SEASON_MONTHS_MAP = {
    "January-March": ["January", "February", "March"],
    "January–March": ["January", "February", "March"],
    "April-June": ["April", "May", "June"],
    "April–June": ["April", "May", "June"],
    "July-September": ["July", "August", "September"],
    "July–September": ["July", "August", "September"],
    "October-December": ["October", "November", "December"],
    "October–December": ["October", "November", "December"],
    "Flexible dates": ["All"]
}

def load_destinations() -> pd.DataFrame:
    if not os.path.exists(DATASET_PATH):
        raise FileNotFoundError(f"Destination dataset not found at {DATASET_PATH}")
    df = pd.read_csv(DATASET_PATH)
    # Ensure proper data types
    df["id"] = df["id"].astype(int)
    df["distance_km"] = df["distance_km"].astype(float)
    df["travel_time_hours"] = df["travel_time_hours"].astype(float)
    df["average_cost_per_person"] = df["average_cost_per_person"].astype(float)
    df["recommended_duration_hours"] = df["recommended_duration_hours"].astype(float)
    df["entry_fee_estimate"] = df["entry_fee_estimate"].astype(float)
    df["latitude"] = df["latitude"].astype(float)
    df["longitude"] = df["longitude"].astype(float)
    return df

def calculate_budget_score(dest_cost_per_person: float, num_travelers: int, total_budget: float) -> Tuple[float, float, str]:
    """Calculate budget score and explainable detail."""
    # Estimated group cost = (cost_per_person * travelers)
    estimated_group_cost = dest_cost_per_person * num_travelers
    
    if total_budget <= 0:
        return 50.0, estimated_group_cost, "Budget not specified"
    
    ratio = estimated_group_cost / total_budget
    if ratio <= 0.8:
        # Well within budget
        score = 100.0
        reason = f"Comfortably within budget (est. ₹{int(estimated_group_cost)} vs ₹{int(total_budget)} budget)"
    elif ratio <= 1.0:
        # Fits nicely within budget
        score = 90.0 + (1.0 - ratio) * 50.0  # 90 to 100
        reason = f"Fits your total budget of ₹{int(total_budget)}"
    elif ratio <= 1.25:
        # Slightly above budget (gradual penalty)
        penalty = (ratio - 1.0) / 0.25 * 50.0
        score = max(40.0, 90.0 - penalty)
        reason = f"Slightly above target budget by ₹{int(estimated_group_cost - total_budget)}"
    else:
        # Significantly over budget
        over_ratio = (ratio - 1.25)
        score = max(0.0, 40.0 - over_ratio * 30.0)
        reason = f"Exceeds target budget (est. ₹{int(estimated_group_cost)})"
        
    return min(100.0, max(0.0, score)), estimated_group_cost, reason

def calculate_interest_score(user_interests: List[str], dest_interests_str: str, dest_activities_str: str) -> Tuple[float, List[str]]:
    """Calculate interest compatibility score."""
    if not user_interests:
        return 70.0, []
        
    dest_features = [item.strip().lower() for item in dest_interests_str.split(",") + dest_activities_str.split(",")]
    matched = []
    
    for interest in user_interests:
        interest_clean = interest.strip().lower()
        if any(interest_clean in feat or feat in interest_clean for feat in dest_features):
            matched.append(interest)
            
    if not matched:
        return 20.0, []
        
    match_ratio = len(matched) / len(user_interests)
    score = min(100.0, match_ratio * 100.0)
    return score, matched

def calculate_time_score(available_time_str: str, travel_time_hours: float, recommended_duration: float) -> Tuple[float, float, str]:
    """Calculate time feasibility considering round-trip travel + stay duration."""
    max_hours = TIME_MAPPINGS.get(available_time_str, 14.0)
    # Total round trip journey time
    round_trip_travel = travel_time_hours * 2.0
    total_needed = round_trip_travel + min(recommended_duration, max_hours * 0.6)
    
    if total_needed <= max_hours:
        # Fully feasible within timeframe
        score = 100.0
        reason = f"Trip duration ({total_needed:.1f} hrs incl. round-trip) easily fits your {available_time_str} window"
    elif total_needed <= max_hours * 1.25:
        # Feasible with slight rush
        score = max(50.0, 100.0 - (total_needed - max_hours) / (max_hours * 0.25) * 45.0)
        reason = f"Feasible for {available_time_str} with focused stops ({total_needed:.1f} hrs total)"
    else:
        # Infeasible or very rushed
        score = max(10.0, 50.0 - (total_needed - max_hours * 1.25) * 10.0)
        reason = f"Requires ~{total_needed:.1f} hrs, which exceeds the {available_time_str} duration"
        
    return min(100.0, max(0.0, score)), total_needed, reason

def calculate_mood_score(user_mood: str, dest_mood_str: str) -> float:
    if not user_mood or user_mood.lower() == "any":
        return 80.0
    dest_moods = [m.strip().lower() for m in dest_mood_str.split(",")]
    if user_mood.lower() in dest_moods:
        return 100.0
    return 35.0

def calculate_food_score(dietary_pref: str, cuisine_pref: str, dest_dietary: str, dest_cuisine: str) -> float:
    score = 70.0
    dest_dietary_lower = dest_dietary.lower()
    dest_cuisine_lower = dest_cuisine.lower()
    
    # Dietary check
    if dietary_pref and dietary_pref.lower() != "no preference":
        d_pref = dietary_pref.lower()
        if d_pref in dest_dietary_lower:
            score += 20.0
        elif d_pref == "jain" and "jain" not in dest_dietary_lower:
            score -= 30.0
        elif d_pref == "vegan" and "vegan" not in dest_dietary_lower:
            score -= 20.0
            
    # Cuisine check
    if cuisine_pref and cuisine_pref.lower() != "no preference":
        c_pref = cuisine_pref.lower()
        if c_pref in dest_cuisine_lower:
            score += 10.0
            
    return min(100.0, max(10.0, score))

def calculate_distance_score(dest_distance: float, max_distance: float) -> Tuple[float, bool]:
    """Calculate distance score and check eligibility."""
    if max_distance <= 0:
        max_distance = 300.0
        
    if dest_distance > max_distance:
        # Hard exclusion or severe penalty
        return 0.0, False
        
    # Destinations within max distance get scaled score
    ratio = dest_distance / max_distance
    score = 100.0 - (ratio * 30.0)  # Closer destinations get slightly higher convenience score
    return min(100.0, max(50.0, score)), True

def calculate_transport_score(user_transport: str, dest_transport_str: str) -> float:
    if not user_transport or user_transport.lower() == "any":
        return 90.0
    dest_transports = [t.strip().lower() for t in dest_transport_str.split(",")]
    u_trans = user_transport.strip().lower()
    
    # Normalize aliases
    if u_trans in ["public transport", "public"]:
        if "bus" in dest_transports or "train" in dest_transports:
            return 100.0
            
    if u_trans in dest_transports:
        return 100.0
    return 40.0

def calculate_season_score(travel_period: str, best_season: str, best_months: str) -> Tuple[float, str]:
    if not travel_period or travel_period in ["Flexible dates", "Flexible"]:
        return 90.0, "Suitable year-round with flexible dates"
        
    months = SEASON_MONTHS_MAP.get(travel_period, [])
    dest_months = [m.strip() for m in best_months.split(",")]
    
    overlap = set(months).intersection(set(dest_months))
    if overlap:
        score = 95.0
        reason = f"Ideal timing ({', '.join(list(overlap)[:2])} matches {best_season})"
    else:
        score = 50.0
        reason = f"Off-peak period for this destination (Best season: {best_season})"
        
    return score, reason

def get_recommendations(preferences: Dict[str, Any], limit: int = 3) -> Dict[str, Any]:
    """
    Main recommendation function.
    Returns:
    - recommendations: list of top scored destinations with detailed explanations
    - total_eligible: count of destinations meeting hard constraints
    - preferences_used: echo of preferences
    """
    df = load_destinations()
    
    start_location = preferences.get("starting_location", "Bengaluru").strip()
    total_budget = float(preferences.get("budget", 4000.0))
    available_time = preferences.get("available_time", "One day")
    num_travelers = max(1, int(preferences.get("travelers", 2)))
    transport_mode = preferences.get("transportation", "Car")
    travel_mood = preferences.get("travel_mood", "Relaxing")
    user_interests = preferences.get("interests", ["Nature", "Photography"])
    max_distance = float(preferences.get("max_distance", 200.0))
    dietary_pref = preferences.get("food_preference", "No preference")
    cuisine_pref = preferences.get("cuisine_interest", "No preference")
    travel_period = preferences.get("travel_period", "Flexible dates")
    
    # Weights definition (Section 12 of specification)
    WEIGHTS = {
        "budget": 0.20,
        "interests": 0.20,
        "time": 0.15,
        "mood": 0.15,
        "food": 0.10,
        "distance": 0.10,
        "transportation": 0.05,
        "season": 0.05
    }
    
    scored_destinations = []
    
    for _, row in df.iterrows():
        # Check distance eligibility
        dist_score, is_eligible = calculate_distance_score(row["distance_km"], max_distance)
        if not is_eligible:
            continue
            
        budget_score, group_cost, budget_reason = calculate_budget_score(
            row["average_cost_per_person"], num_travelers, total_budget
        )
        
        interest_score, matched_interests = calculate_interest_score(
            user_interests, str(row["interests"]), str(row["activities"])
        )
        
        time_score, total_time_needed, time_reason = calculate_time_score(
            available_time, row["travel_time_hours"], row["recommended_duration_hours"]
        )
        
        mood_score = calculate_mood_score(travel_mood, str(row["mood_compatibility"]))
        
        food_score = calculate_food_score(
            dietary_pref, cuisine_pref, str(row["dietary_availability"]), str(row["popular_cuisine"])
        )
        
        transport_score = calculate_transport_score(transport_mode, str(row["transport_options"]))
        
        season_score, season_reason = calculate_season_score(
            travel_period, str(row["best_season"]), str(row["best_months"])
        )
        
        # Weighted overall score
        overall_score = (
            budget_score * WEIGHTS["budget"] +
            interest_score * WEIGHTS["interests"] +
            time_score * WEIGHTS["time"] +
            mood_score * WEIGHTS["mood"] +
            food_score * WEIGHTS["food"] +
            dist_score * WEIGHTS["distance"] +
            transport_score * WEIGHTS["transportation"] +
            season_score * WEIGHTS["season"]
        )
        
        # Build 2-4 personalized explainable reasons
        explanations = []
        if matched_interests:
            explanations.append(f"Matches your interest in {', '.join(matched_interests[:3])}")
        explanations.append(budget_reason)
        explanations.append(time_reason)
        if mood_score >= 90.0:
            explanations.append(f"Ideal fit for a {travel_mood.lower()} trip with friends or family")
        elif season_score >= 85.0:
            explanations.append(season_reason)
            
        destination_dict = row.to_dict()
        scored_destinations.append({
            "destination": destination_dict,
            "overall_score": round(overall_score, 1),
            "factor_scores": {
                "budget": round(budget_score, 1),
                "interests": round(interest_score, 1),
                "time": round(time_score, 1),
                "mood": round(mood_score, 1),
                "food": round(food_score, 1),
                "distance": round(dist_score, 1),
                "transportation": round(transport_score, 1),
                "season": round(season_score, 1)
            },
            "estimated_group_cost": round(group_cost, 0),
            "cost_per_person": round(group_cost / num_travelers, 0),
            "estimated_travel_time_hours": row["travel_time_hours"],
            "total_trip_duration_hours": round(total_time_needed, 1),
            "matched_interests": matched_interests,
            "explanations": explanations[:4]
        })
        
    # Deterministic sorting: overall_score DESC, distance_km ASC, id ASC
    scored_destinations.sort(
        key=lambda x: (
            -x["overall_score"], 
            x["destination"]["distance_km"], 
            x["destination"]["id"]
        )
    )
    
    top_results = scored_destinations[:limit]
    
    return {
        "recommendations": top_results,
        "total_eligible": len(scored_destinations),
        "total_evaluated": len(df),
        "origin_used": start_location,
        "status": "success" if top_results else "no_eligible_destinations"
    }
