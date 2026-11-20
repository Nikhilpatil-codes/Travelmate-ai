"""
Comprehensive Automated Test Suite for TravelMate AI.
Covers:
1. Recommendation engine weighting & factor calculations
2. Constraints: distance exclusion, budget limits, time feasibility
3. Deterministic ranking & top-3 results
4. Itinerary generation & feasibility alerts
5. Budget calculations & 'Make My Trip Cheaper' optimization
6. SQLite feedback persistence & analytics
7. User authentication & password hashing security
8. Saved trips isolation & ownership verification
9. Route analysis and nearby exploration
"""

import os
import sys
import unittest

# Ensure backend directory is in python search path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pandas as pd
from database import (
    init_db, create_user, authenticate_user,
    save_trip, get_user_trips, delete_user_trip,
    save_feedback, get_feedback_analytics, verify_password
)
from recommendation import (
    load_destinations, get_recommendations,
    calculate_budget_score, calculate_interest_score,
    calculate_time_score, calculate_distance_score
)
from itinerary import generate_itinerary
from budget import calculate_budget, optimize_budget
from chatbot import process_query
from routes_service import analyze_route, explore_near_me
from email_service import (
    get_sender_address,
    get_email_service_status,
    build_test_email_html,
    send_email_via_resend
)

class TestTravelMateCore(unittest.TestCase):

    def setUp(self):
        init_db()

    # --- 1. Dataset Verification ---
    def test_destination_dataset_integrity(self):
        df = load_destinations()
        self.assertGreaterEqual(len(df), 38, "Dataset must contain at least ~40 unique destinations")
        # Check required columns
        required_cols = [
            "id", "name", "city", "region", "distance_km", "travel_time_hours",
            "average_cost_per_person", "recommended_duration_hours",
            "activities", "interests", "mood_compatibility", "transport_options",
            "best_season", "best_months", "latitude", "longitude"
        ]
        for col in required_cols:
            self.assertIn(col, df.columns, f"Missing required column {col}")
        # Verify no duplicate IDs
        self.assertEqual(len(df["id"].unique()), len(df), "Destination IDs must be unique")

    # --- 2. Recommendation Engine Tests ---
    def test_weighted_scoring_and_ranking(self):
        prefs = {
            "starting_location": "Bengaluru",
            "budget": 3000.0,
            "available_time": "One day",
            "travelers": 2,
            "transportation": "Car",
            "travel_mood": "Adventure",
            "interests": ["Adventure", "Mountains"],
            "max_distance": 100.0,
            "food_preference": "Vegetarian"
        }
        res = get_recommendations(prefs, limit=3)
        self.assertEqual(res["status"], "success")
        recs = res["recommendations"]
        self.assertLessEqual(len(recs), 3)
        self.assertGreater(len(recs), 0)
        
        # Verify scores are bounded 0-100 and sorted descending
        for i in range(len(recs) - 1):
            self.assertGreaterEqual(recs[i]["overall_score"], recs[i+1]["overall_score"])
            self.assertTrue(0.0 <= recs[i]["overall_score"] <= 100.0)
            self.assertTrue(len(recs[i]["explanations"]) >= 2, "Must contain 2-4 personalized reasons")

    def test_distance_exclusion_constraint(self):
        # Strict 40 km limit should exclude destinations > 40 km (like Mysore, Coorg, Hampi)
        prefs = {
            "starting_location": "Bengaluru",
            "budget": 5000.0,
            "available_time": "One day",
            "travelers": 2,
            "max_distance": 35.0
        }
        res = get_recommendations(prefs)
        for r in res["recommendations"]:
            self.assertLessEqual(r["destination"]["distance_km"], 35.0)

    def test_no_eligible_destinations(self):
        # Unrealistic constraint: max distance 5 km
        prefs = {
            "starting_location": "Bengaluru",
            "budget": 500.0,
            "available_time": "2-3 hours",
            "travelers": 1,
            "max_distance": 5.0
        }
        res = get_recommendations(prefs)
        self.assertEqual(len(res["recommendations"]), 0)
        self.assertEqual(res["status"], "no_eligible_destinations")

    def test_budget_scoring_penalty(self):
        # Estimated group cost well within budget -> 100 score
        score_under, _, _ = calculate_budget_score(500.0, 2, 3000.0)
        self.assertEqual(score_under, 100.0)
        # Estimated group cost exceeding budget -> penalty applied
        score_over, _, _ = calculate_budget_score(2500.0, 2, 2000.0)
        self.assertLess(score_over, 70.0)

    # --- 3. Budget Calculator & Optimizer Tests ---
    def test_budget_calculation_group_and_person(self):
        # 2 travelers, Car, 50 km distance
        b = calculate_budget(distance_km=50.0, entry_fee=20.0, travelers=2, transport_mode="Car", user_budget=3000.0)
        self.assertEqual(b["cost_per_person"] * 2, b["total_group_cost"])
        self.assertGreater(b["transport_cost"], 0)
        self.assertGreater(b["food_cost"], 0)

    def test_make_my_trip_cheaper_optimizer(self):
        # Optimize from expensive Cab to economical alternative
        opt = optimize_budget(
            distance_km=80.0, entry_fee=30.0, travelers=2,
            current_transport="Cab", user_budget=2000.0, supported_transports="Bike, Car, Bus"
        )
        self.assertLess(opt["optimized_cost"], opt["original_cost"])
        self.assertGreater(opt["total_savings"], 0)
        self.assertTrue(len(opt["specific_changes"]) > 0)

    # --- 4. Itinerary Generator Tests ---
    def test_itinerary_timeline_and_feasibility(self):
        df = load_destinations()
        dest = df[df["name"] == "Nandi Hills"].iloc[0].to_dict()
        itin = generate_itinerary(dest, available_time="One day", transport_mode="Car")
        self.assertTrue(itin["is_feasible"])
        self.assertTrue(len(itin["timeline"]) >= 5)
        # Check timeline structure
        first_step = itin["timeline"][0]
        self.assertIn("time", first_step)
        self.assertIn("title", first_step)
        self.assertIn("icon", first_step)

    def test_infeasible_itinerary_detection(self):
        # Hampi is 340 km / 6.5 hrs one-way from Bengaluru; 2-3 hours available time must trigger warning
        df = load_destinations()
        hampi = df[df["name"] == "Hampi"].iloc[0].to_dict()
        itin = generate_itinerary(hampi, available_time="2-3 hours", transport_mode="Car")
        self.assertFalse(itin["is_feasible"], "340 km trip cannot be feasible in 2-3 hours")
        self.assertIn("exceeds your 2-3 hours window", itin["feasibility_note"])

    # --- 5. Security & Authentication Tests ---
    def test_authentication_and_password_hashing(self):
        test_email = f"tester_{os.getpid()}@example.com"
        user = create_user("Test Traveler", test_email, "SecurePassword123")
        self.assertIn("id", user)
        self.assertEqual(user["email"], test_email)
        
        # Verify valid login
        logged_in = authenticate_user(test_email, "SecurePassword123")
        self.assertIsNotNone(logged_in)
        self.assertEqual(logged_in["id"], user["id"])
        
        # Verify invalid password fails
        bad_login = authenticate_user(test_email, "WrongPassword")
        self.assertIsNone(bad_login)

    def test_saved_trips_user_isolation(self):
        email_a = f"alice_{os.getpid()}@example.com"
        email_b = f"bob_{os.getpid()}@example.com"
        user_a = create_user("Alice", email_a, "PassA123")
        user_b = create_user("Bob", email_b, "PassB123")
        
        # Alice saves a trip
        trip_id = save_trip(user_a["id"], {
            "destination_id": 1,
            "destination_name": "Nandi Hills",
            "budget": 2000.0,
            "travel_mode": "Bike",
            "travelers": 1
        })
        
        # Alice can view her trip
        alice_trips = get_user_trips(user_a["id"])
        self.assertEqual(len(alice_trips), 1)
        self.assertEqual(alice_trips[0]["destination_name"], "Nandi Hills")
        
        # Bob cannot view Alice's trips
        bob_trips = get_user_trips(user_b["id"])
        self.assertEqual(len(bob_trips), 0)
        
        # Bob cannot delete Alice's trip
        delete_success = delete_user_trip(user_b["id"], trip_id)
        self.assertFalse(delete_success)

    # --- 6. Feedback & Analytics Tests ---
    def test_feedback_persistence_and_analytics(self):
        save_feedback({
            "destination_id": 1,
            "destination_name": "Nandi Hills",
            "rating": 5,
            "comments": "Stunning sunrise and misty clouds!",
            "language": "en"
        })
        save_feedback({
            "destination_id": 3,
            "destination_name": "Ramanagara",
            "rating": 4,
            "comments": "Great rock climbing trail.",
            "language": "en"
        })
        analytics = get_feedback_analytics()
        self.assertGreaterEqual(analytics["total_reviews"], 2)
        self.assertGreaterEqual(analytics["average_rating"], 1.0)
        self.assertIn(5, analytics["rating_distribution"])

    # --- 7. Route Analysis & Geolocation Tests ---
    def test_route_analysis_and_google_maps_url(self):
        route = analyze_route(
            origin_name="Bengaluru",
            origin_lat=12.9716,
            origin_lon=77.5946,
            dest_name="Nandi Hills",
            dest_lat=13.3702,
            dest_lon=77.6835,
            mode="Driving"
        )
        self.assertGreater(route["distance_km"], 30.0)
        self.assertIn("google.com/maps/dir", route["google_maps_url"])
        self.assertEqual(route["mode"], "Driving")

    def test_explore_near_me(self):
        df = load_destinations()
        dests = df.to_dict(orient="records")
        nearby = explore_near_me(user_lat=12.9716, user_lon=77.5946, radius_km=50.0, destinations=dests)
        self.assertGreater(len(nearby), 0)
        for d in nearby:
            self.assertLessEqual(d["distance_from_user_km"], 50.0)

    # --- 8. AI Chat Assistant Tests ---
    def test_chat_assistant_offline_domain_knowledge(self):
        res = process_query("What is the cost breakdown?", {
            "selected_destination": {"name": "Nandi Hills"},
            "budget_breakdown": {"total_group_cost": 1500, "cost_per_person": 750, "travelers_count": 2}
        })
        self.assertIn("1,500", res["reply"])
        self.assertEqual(res["source"], "rule_based_engine")

    def test_chat_assistant_varied_intents(self):
        queries = [
            "Hi",
            "Budget for Coorg 3 days?",
            "What should I pack?",
            "Weather in Hampi in December?",
            "Why was Mysuru recommended?",
            "I need that information",
            "Who won the cricket match?"
        ]
        replies = []
        for q in queries:
            res = process_query(q)
            self.assertTrue(len(res["reply"]) > 10)
            self.assertIn(res["source"], ["rule_based_engine", "gemini-2.0-flash"])
            self.assertIsInstance(res["offline"], bool)
            replies.append(res["reply"])
        # Ensure all replies are unique and distinct
        self.assertEqual(len(set(replies)), len(queries), "Every query must receive a distinct, relevant answer")

    def test_chat_assistant_no_duplicate_consecutive_replies(self):
        # Calling the same intent twice should alternate and never repeat the exact same response
        res1 = process_query("Hi")
        res2 = process_query("Hi")
        self.assertNotEqual(res1["reply"], res2["reply"], "Chatbot must never return the same reply twice in a row")

    # --- 9. Resend Email Service Tests (Development & Testing) ---
    def test_resend_email_service_defaults(self):
        sender = get_sender_address()
        self.assertIn("onboarding@resend.dev", sender, "Default sender must use onboarding@resend.dev")
        status = get_email_service_status()
        self.assertIn("resend_configured", status)
        self.assertIn("development_mode", status)
        self.assertFalse(status["custom_domain_required"], "Development mode must not require a custom domain")

    def test_resend_html_template_generation(self):
        html = build_test_email_html("developer@example.com", test_type="Viva Test")
        self.assertIn("TravelMate AI", html)
        self.assertIn("onboarding@resend.dev", html)
        self.assertIn("developer@example.com", html)

    def test_resend_missing_api_key_graceful_response(self):
        # When RESEND_API_KEY is not set or placeholder, send_email_via_resend must return clean error
        old_val = os.environ.get("RESEND_API_KEY")
        try:
            if "RESEND_API_KEY" in os.environ:
                del os.environ["RESEND_API_KEY"]
            res = send_email_via_resend("test@example.com", "Test", "<p>Test</p>")
            self.assertFalse(res["success"])
            self.assertEqual(res["error_code"], "missing_api_key")
            self.assertIn("RESEND_API_KEY is not configured", res["message"])
        finally:
            if old_val:
                os.environ["RESEND_API_KEY"] = old_val

if __name__ == "__main__":
    unittest.main()
