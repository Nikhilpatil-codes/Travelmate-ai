export interface Destination {
  id: number;
  name: string;
  city: string;
  region: string;
  distance_km: number;
  travel_time_hours: number;
  average_cost_per_person: number;
  recommended_duration_hours: number;
  destination_type: string;
  activities: string;
  interests: string;
  mood_compatibility: string;
  food_options: string;
  dietary_availability: string;
  popular_cuisine: string;
  local_food: string;
  transport_options: string;
  best_season: string;
  best_months: string;
  seasonal_activities: string;
  seasonal_tips: string;
  entry_fee_estimate: number;
  image_url: string;
  latitude: number;
  longitude: number;
}

export interface RecommendationFactorScores {
  budget: number;
  interests: number;
  time: number;
  mood: number;
  food: number;
  distance: number;
  transportation: number;
  season: number;
}

export interface RecommendationItem {
  destination: Destination;
  overall_score: number;
  factor_scores: RecommendationFactorScores;
  estimated_group_cost: number;
  cost_per_person: number;
  estimated_travel_time_hours: number;
  total_trip_duration_hours: number;
  matched_interests: string[];
  explanations: string[];
}

export interface ItineraryStep {
  time: string;
  title: string;
  description: string;
  duration: string;
  icon: string;
  type: string;
}

export interface ItineraryData {
  destination_name: string;
  available_time: string;
  is_feasible: boolean;
  feasibility_note: string;
  total_estimated_duration_hours: number;
  timeline: ItineraryStep[];
}

export interface BudgetBreakdown {
  transport_cost: number;
  transport_mode_used: string;
  transport_notes: string;
  food_cost: number;
  entry_cost: number;
  activity_cost: number;
  misc_cost: number;
  total_group_cost: number;
  cost_per_person: number;
  user_target_budget: number;
  budget_variance: number;
  status: string;
  travelers_count: number;
}

export interface BudgetOptimization {
  original_cost: number;
  optimized_cost: number;
  total_savings: number;
  savings_percentage: number;
  original_breakdown: BudgetBreakdown;
  optimized_breakdown: BudgetBreakdown;
  specific_changes: string[];
  impact_note: string;
}

export interface RouteAnalysis {
  origin: { name: string; latitude: number; longitude: number };
  destination: { name: string; latitude: number; longitude: number };
  mode: string;
  distance_km: number;
  duration_minutes: number;
  duration_formatted: string;
  google_maps_url: string;
  alternative_routes: Array<{
    route_name: string;
    distance_km: number;
    duration: string;
    summary: string;
  }>;
  is_live_service: boolean;
  estimation_note: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface SavedTrip {
  id: number;
  user_id: number;
  destination_id: number;
  destination_name: string;
  starting_location: string;
  budget: number;
  travel_mode: string;
  travelers: number;
  itinerary: ItineraryStep[];
  cost_breakdown: Partial<BudgetBreakdown>;
  created_at: string;
}

export interface UserPreferences {
  starting_location: string;
  budget: number;
  available_time: string;
  travelers: number;
  transportation: string;
  travel_mood: string;
  interests: string[];
  max_distance: number;
  food_preference: string;
  cuisine_interest: string;
  travel_period: string;
  user_lat?: number;
  user_lon?: number;
}
