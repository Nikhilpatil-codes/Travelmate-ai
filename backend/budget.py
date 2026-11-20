"""
Budget Calculator & Optimizer ("Make My Trip Cheaper") for TravelMate AI.
Calculates realistic transportation, food, entry, and miscellaneous expenses.
Provides transparent optimization by shifting transport, food, and activities.
"""

from typing import Dict, Any, List

# Round-trip transport calculation rates (per km)
TRANSPORT_RATES = {
    "Bike": {"rate_per_km": 2.5, "per_person": False, "toll_base": 0.0, "desc": "Two-wheeler fuel (est. 45 km/l)"},
    "Car": {"rate_per_km": 7.0, "per_person": False, "toll_base": 180.0, "desc": "Hatchback/Sedan petrol + highway toll"},
    "Cab": {"rate_per_km": 14.0, "per_person": False, "toll_base": 250.0, "desc": "Outstation cab fare (driver batta + toll)"},
    "Bus": {"rate_per_km": 2.0, "per_person": True, "toll_base": 0.0, "desc": "KSRTC / private express bus fare"},
    "Train": {"rate_per_km": 1.2, "per_person": True, "toll_base": 0.0, "desc": "Indian Railways unreserved/express fare"},
    "Public transport": {"rate_per_km": 1.8, "per_person": True, "toll_base": 0.0, "desc": "Combined state transport & metro"},
    "Public Transport": {"rate_per_km": 1.8, "per_person": True, "toll_base": 0.0, "desc": "Combined state transport & metro"}
}

def calculate_budget(
    distance_km: float,
    entry_fee: float,
    travelers: int = 2,
    transport_mode: str = "Car",
    user_budget: float = 4000.0,
    food_standard: str = "standard"  # "budget", "standard", "premium"
) -> Dict[str, Any]:
    travelers = max(1, travelers)
    round_trip_dist = distance_km * 2.0
    
    # Transport calculation
    t_info = TRANSPORT_RATES.get(transport_mode, TRANSPORT_RATES["Car"])
    if t_info["per_person"]:
        transport_cost = round_trip_dist * t_info["rate_per_km"] * travelers + t_info["toll_base"]
    else:
        # Group vehicle (shared across passengers)
        transport_cost = round_trip_dist * t_info["rate_per_km"] + t_info["toll_base"]
    
    # Food calculation per person
    food_rates = {
        "budget": 250.0,    # Local mess / darshini tiffin
        "standard": 450.0,  # Clean highway restaurant / thali
        "premium": 800.0    # Resort buffet / specialty dining
    }
    per_person_food = food_rates.get(food_standard, 450.0)
    food_cost = per_person_food * travelers
    
    # Entry and activity
    entry_cost = entry_fee * travelers
    activity_fees = 150.0 * travelers  # Trek pass / guide / boating estimate
    
    # Parking & Miscellaneous
    misc_cost = 200.0 if not t_info["per_person"] else 100.0
    
    total_group_cost = round(transport_cost + food_cost + entry_cost + activity_fees + misc_cost, 0)
    cost_per_person = round(total_group_cost / travelers, 0)
    
    diff = user_budget - total_group_cost
    status = "within_budget" if diff >= 0 else "over_budget"
    
    return {
        "transport_cost": round(transport_cost, 0),
        "transport_mode_used": transport_mode,
        "transport_notes": t_info["desc"],
        "food_cost": round(food_cost, 0),
        "entry_cost": round(entry_cost, 0),
        "activity_cost": round(activity_fees, 0),
        "misc_cost": round(misc_cost, 0),
        "total_group_cost": total_group_cost,
        "cost_per_person": cost_per_person,
        "user_target_budget": user_budget,
        "budget_variance": round(diff, 0),
        "status": status,
        "travelers_count": travelers
    }

def optimize_budget(
    distance_km: float,
    entry_fee: float,
    travelers: int = 2,
    current_transport: str = "Car",
    user_budget: float = 4000.0,
    supported_transports: str = "Bike, Car, Bus, Train"
) -> Dict[str, Any]:
    """
    'Make My Trip Cheaper' function.
    Finds cheaper alternative transport, optimizes food, adjusts optional costs.
    """
    original = calculate_budget(
        distance_km, entry_fee, travelers, current_transport, user_budget, food_standard="standard"
    )
    
    changes_made = []
    
    # 1. Transport mode optimization
    supported_list = [t.strip() for t in supported_transports.split(",")]
    optimized_transport = current_transport
    
    # Transport hierarchy from expensive to affordable for the given group size
    if current_transport == "Cab":
        if "Car" in supported_list:
            optimized_transport = "Car"
            changes_made.append("Switched from private Cab to self-drive/shared Car (saves driver batta & surge)")
        elif "Bus" in supported_list:
            optimized_transport = "Bus"
            changes_made.append("Switched from Cab to State Express Bus")
    elif current_transport == "Car" and travelers <= 2:
        if "Bike" in supported_list:
            optimized_transport = "Bike"
            changes_made.append("Switched to Two-Wheeler ride (saves ~60% fuel and zero highway tolls)")
        elif "Bus" in supported_list:
            optimized_transport = "Bus"
            changes_made.append("Switched to State Express Bus transit")
    elif current_transport == "Car" and travelers > 2:
        if "Train" in supported_list:
            optimized_transport = "Train"
            changes_made.append("Opted for scenic rail travel (economical group ticketing)")
        elif "Bus" in supported_list:
            optimized_transport = "Bus"
            changes_made.append("Opted for KSRTC semi-deluxe bus")

    # 2. Food optimization: local tiffins & darshinis instead of luxury highway stops
    optimized_food_standard = "budget"
    changes_made.append("Recommended authentic local eateries / Darshini tiffins instead of highway food plazas")

    # Recalculate with optimized parameters
    optimized = calculate_budget(
        distance_km, entry_fee, travelers, optimized_transport, user_budget, food_standard=optimized_food_standard
    )
    
    # Shave optional activity costs (e.g., self-guided audio tour instead of paid private guide)
    optimized["activity_cost"] = round(optimized["activity_cost"] * 0.5, 0)
    optimized["total_group_cost"] = round(
        optimized["transport_cost"] + optimized["food_cost"] + 
        optimized["entry_cost"] + optimized["activity_cost"] + optimized["misc_cost"], 0
    )
    optimized["cost_per_person"] = round(optimized["total_group_cost"] / travelers, 0)
    optimized["budget_variance"] = round(user_budget - optimized["total_group_cost"], 0)
    optimized["status"] = "within_budget" if optimized["budget_variance"] >= 0 else "over_budget"
    
    savings = original["total_group_cost"] - optimized["total_group_cost"]
    
    return {
        "original_cost": original["total_group_cost"],
        "optimized_cost": optimized["total_group_cost"],
        "total_savings": max(0.0, round(savings, 0)),
        "savings_percentage": round((savings / original["total_group_cost"]) * 100.0, 1) if original["total_group_cost"] > 0 else 0.0,
        "original_breakdown": original,
        "optimized_breakdown": optimized,
        "specific_changes": changes_made,
        "impact_note": "Saves money without compromising sightseeing safety or core destination experience."
    }
