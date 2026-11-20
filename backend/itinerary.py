"""
Personalized Itinerary Generator for TravelMate AI.
Generates realistic, time-aware, vertical-timeline travel itineraries
accounting for departure, outbound travel, destination activities, meals, rest, and return journey.
"""

from typing import Dict, Any, List

def format_time(hour_float: float) -> str:
    """Format floating point hours from midnight into 12-hour AM/PM string."""
    h = int(hour_float) % 24
    m = int(round((hour_float - int(hour_float)) * 60))
    if m >= 60:
        h += 1
        m -= 60
    period = "AM" if h < 12 else "PM"
    display_h = h if 1 <= h <= 12 else (h - 12 if h > 12 else 12)
    return f"{display_h:02d}:{m:02d} {period}"

def generate_itinerary(
    destination: Dict[str, Any],
    starting_location: str = "Bengaluru",
    available_time: str = "One day",
    transport_mode: str = "Car",
    food_preference: str = "No preference",
    travelers: int = 2
) -> Dict[str, Any]:
    """
    Generate chronological timeline items with time, activity, duration, icon, and tips.
    """
    dest_name = destination.get("name", "Destination")
    travel_time = float(destination.get("travel_time_hours", 2.0))
    rec_duration = float(destination.get("recommended_duration_hours", 4.0))
    activities_str = str(destination.get("activities", "Sightseeing, Photography"))
    activities_list = [a.strip() for a in activities_str.split(",") if a.strip()]
    local_food = str(destination.get("local_food", "Traditional tiffin, Filter coffee"))
    
    # Calculate feasibility
    round_trip_travel = travel_time * 2.0
    
    # Max allowed hours based on available_time
    time_budget_map = {
        "2-3 hours": 3.0,
        "2–3 hours": 3.0,
        "Half day": 6.0,
        "One day": 14.0,
        "Weekend": 48.0
    }
    max_hours = time_budget_map.get(available_time, 14.0)
    
    # Determine feasibility status
    is_feasible = True
    feasibility_note = "Your selected timeframe allows a relaxed, enjoyable visit."
    
    if round_trip_travel + 1.0 > max_hours:
        is_feasible = False
        feasibility_note = (
            f"Alert: Round-trip travel alone requires ~{round_trip_travel:.1f} hours, which exceeds "
            f"your {available_time} window ({max_hours:.0f} hours). We recommend a full-day or weekend trip."
        )

    timeline: List[Dict[str, Any]] = []
    
    if available_time in ["2-3 hours", "2–3 hours"]:
        # Quick Express Outing
        current_time = 6.5  # 06:30 AM
        timeline.append({
            "time": format_time(current_time),
            "title": f"Departure from {starting_location}",
            "description": f"Depart early by {transport_mode} to avoid city traffic.",
            "duration": f"{travel_time:.1f} hrs",
            "icon": "navigation",
            "type": "travel"
        })
        current_time += travel_time
        timeline.append({
            "time": format_time(current_time),
            "title": f"Arrive at {dest_name}",
            "description": f"Scenic stop & quick exploration: {activities_list[0] if activities_list else 'Sightseeing'}.",
            "duration": "1.0 hr",
            "icon": "camera",
            "type": "activity"
        })
        current_time += 1.0
        timeline.append({
            "time": format_time(current_time),
            "title": "Return Journey",
            "description": f"Drive back to {starting_location}.",
            "duration": f"{travel_time:.1f} hrs",
            "icon": "home",
            "type": "travel"
        })
        current_time += travel_time
        timeline.append({
            "time": format_time(current_time),
            "title": f"Back in {starting_location}",
            "description": "Trip successfully concluded.",
            "duration": "0 mins",
            "icon": "check-circle",
            "type": "finish"
        })

    elif available_time == "Half day":
        # 6-Hour Outing
        current_time = 6.0  # 06:00 AM
        timeline.append({
            "time": format_time(current_time),
            "title": f"Early Departure from {starting_location}",
            "description": f"Start journey via {transport_mode} for a pleasant morning ride.",
            "duration": f"{travel_time:.1f} hrs",
            "icon": "navigation",
            "type": "travel"
        })
        current_time += travel_time
        
        timeline.append({
            "time": format_time(current_time),
            "title": f"Morning Breakfast & Arrival at {dest_name}",
            "description": f"Enjoy breakfast ({local_food.split(',')[0] if local_food else 'South Indian tiffin'}).",
            "duration": "45 mins",
            "icon": "coffee",
            "type": "food"
        })
        current_time += 0.75
        
        main_act = activities_list[0] if activities_list else "Explore highlights"
        timeline.append({
            "time": format_time(current_time),
            "title": f"Main Exploration: {main_act}",
            "description": f"Discover the iconic viewpoints and attractions of {dest_name}.",
            "duration": "2.0 hrs",
            "icon": "map-pin",
            "type": "activity"
        })
        current_time += 2.0
        
        timeline.append({
            "time": format_time(current_time),
            "title": "Refreshment & Local Specialties",
            "description": f"Tender coconut / light snack before returning.",
            "duration": "30 mins",
            "icon": "utensils",
            "type": "food"
        })
        current_time += 0.5
        
        timeline.append({
            "time": format_time(current_time),
            "title": "Return Travel",
            "description": f"Head back to {starting_location}.",
            "duration": f"{travel_time:.1f} hrs",
            "icon": "home",
            "type": "travel"
        })
        current_time += travel_time
        
        timeline.append({
            "time": format_time(current_time),
            "title": "Arrival Home",
            "description": f"Reach {starting_location} refreshed.",
            "duration": "0 mins",
            "icon": "check-circle",
            "type": "finish"
        })

    elif available_time == "Weekend":
        # Multi-day Weekend Getaway
        current_time = 6.0
        timeline.append({
            "time": "Day 1 - 06:00 AM",
            "title": f"Weekend Departure from {starting_location}",
            "description": f"Hit the highway via {transport_mode} towards {dest_name}.",
            "duration": f"{travel_time:.1f} hrs",
            "icon": "navigation",
            "type": "travel"
        })
        current_time += travel_time
        
        timeline.append({
            "time": "Day 1 - 10:30 AM",
            "title": "Check-in / Morning Refreshment",
            "description": f"Check into local stay / homestay. Taste {local_food.split(',')[0]}.",
            "duration": "1.5 hrs",
            "icon": "home",
            "type": "stay"
        })
        
        timeline.append({
            "time": "Day 1 - 12:30 PM",
            "title": f"Major Sightseeing: {activities_list[0] if activities_list else 'Nature Trails'}",
            "description": f"Experience primary highlights and photo points.",
            "duration": "3.0 hrs",
            "icon": "camera",
            "type": "activity"
        })
        
        timeline.append({
            "time": "Day 1 - 04:30 PM",
            "title": "Sunset View & Evening Stroll",
            "description": f"Sunset viewpoint and local bazaar walk.",
            "duration": "2.0 hrs",
            "icon": "sunset",
            "type": "leisure"
        })
        
        timeline.append({
            "time": "Day 1 - 08:00 PM",
            "title": "Traditional Dinner & Campfire",
            "description": f"Dinner suited for {food_preference} preference with local hospitality.",
            "duration": "1.5 hrs",
            "icon": "utensils",
            "type": "food"
        })
        
        timeline.append({
            "time": "Day 2 - 06:30 AM",
            "title": "Morning Trek or Sunrise Exploration",
            "description": f"Early morning nature walk: {activities_list[1] if len(activities_list) > 1 else 'Panoramic viewpoints'}.",
            "duration": "2.5 hrs",
            "icon": "sun",
            "type": "activity"
        })
        
        timeline.append({
            "time": "Day 2 - 11:30 AM",
            "title": "Local Shopping & Souvenirs",
            "description": "Purchase regional specialties, spices, or handicrafts.",
            "duration": "1.5 hrs",
            "icon": "shopping-bag",
            "type": "shopping"
        })
        
        timeline.append({
            "time": "Day 2 - 02:00 PM",
            "title": f"Return Drive to {starting_location}",
            "description": f"Leisurely drive back via highway.",
            "duration": f"{travel_time:.1f} hrs",
            "icon": "home",
            "type": "travel"
        })
        
        timeline.append({
            "time": "Day 2 - Evening",
            "title": f"Safe Return in {starting_location}",
            "description": "Weekend getaway completed with memorable experiences.",
            "duration": "0 mins",
            "icon": "check-circle",
            "type": "finish"
        })

    else:
        # Default: Full One-Day Trip
        current_time = 6.0  # 06:00 AM
        timeline.append({
            "time": format_time(current_time),
            "title": f"Departure from {starting_location}",
            "description": f"Depart by {transport_mode}. Early start beats highway bottleneck.",
            "duration": f"{travel_time:.1f} hrs",
            "icon": "navigation",
            "type": "travel"
        })
        current_time += travel_time
        
        # En-route or on-arrival breakfast
        timeline.append({
            "time": format_time(current_time),
            "title": "Arrival & Traditional Breakfast",
            "description": f"Enjoy fresh regional breakfast ({local_food.split(',')[0] if local_food else 'Hot Idli/Vada'}).",
            "duration": "45 mins",
            "icon": "coffee",
            "type": "food"
        })
        current_time += 0.75
        
        # Morning Primary Attraction
        act1 = activities_list[0] if activities_list else "Sightseeing"
        timeline.append({
            "time": format_time(current_time),
            "title": f"Primary Highlight: {act1}",
            "description": f"Explore {dest_name}'s key sights while the weather is pleasant.",
            "duration": "2.5 hrs",
            "icon": "camera",
            "type": "activity"
        })
        current_time += 2.5
        
        # Lunch
        timeline.append({
            "time": format_time(current_time),
            "title": "Local Lunch Experience",
            "description": f"Authentic lunch compliant with {food_preference} preference.",
            "duration": "1.0 hr",
            "icon": "utensils",
            "type": "food"
        })
        current_time += 1.0
        
        # Afternoon Activity / Relaxation
        act2 = activities_list[1] if len(activities_list) > 1 else (activities_list[0] if activities_list else "Nature Walk")
        timeline.append({
            "time": format_time(current_time),
            "title": f"Secondary Exploration: {act2}",
            "description": f"Relaxed stroll, photography, or temple/nature visit.",
            "duration": "2.0 hrs",
            "icon": "compass",
            "type": "activity"
        })
        current_time += 2.0
        
        # Evening snack & tea
        timeline.append({
            "time": format_time(current_time),
            "title": "Evening Tea & Scenic Sunset",
            "description": "Unwind with evening tea/coffee and capture sunset views.",
            "duration": "45 mins",
            "icon": "sunset",
            "type": "leisure"
        })
        current_time += 0.75
        
        # Return journey
        timeline.append({
            "time": format_time(current_time),
            "title": f"Commence Return Drive to {starting_location}",
            "description": f"Drive back comfortably via {transport_mode}.",
            "duration": f"{travel_time:.1f} hrs",
            "icon": "home",
            "type": "travel"
        })
        current_time += travel_time
        
        timeline.append({
            "time": format_time(current_time),
            "title": f"Arrival Back in {starting_location}",
            "description": "Safe arrival home. Hope you enjoyed the journey!",
            "duration": "0 mins",
            "icon": "check-circle",
            "type": "finish"
        })

    return {
        "destination_name": dest_name,
        "available_time": available_time,
        "is_feasible": is_feasible,
        "feasibility_note": feasibility_note,
        "total_estimated_duration_hours": round(round_trip_travel + rec_duration, 1),
        "timeline": timeline
    }
