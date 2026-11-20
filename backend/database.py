"""
Database management for TravelMate AI.
Handles SQLite connection, user accounts, authentication, feedback, and saved trips.
"""

import os
import sqlite3
import hashlib
import secrets
import json
from datetime import datetime
from typing import Optional, Dict, Any, List

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "travelmate.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str, salt: Optional[str] = None) -> str:
    """Hash password using SHA-256 with a unique salt."""
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.sha256((salt + password).encode('utf-8')).hexdigest()
    return f"{salt}${hashed}"

def verify_password(stored_hash: str, provided_password: str) -> bool:
    try:
        salt, _ = stored_hash.split("$", 1)
        expected = hash_password(provided_password, salt)
        return expected == stored_hash
    except Exception:
        return False

def init_db():
    """Initialize database tables safely without erasing existing data."""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Saved Trips table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS saved_trips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        destination_id INTEGER NOT NULL,
        destination_name TEXT NOT NULL,
        starting_location TEXT,
        budget REAL,
        travel_mode TEXT,
        travelers INTEGER,
        itinerary_json TEXT,
        cost_breakdown_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    """)
    
    # Feedback table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_name TEXT,
        destination_id INTEGER NOT NULL,
        destination_name TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
        comments TEXT,
        preferences_json TEXT,
        language TEXT DEFAULT 'en',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    conn.commit()
    conn.close()

# User Operations
def create_user(name: str, email: str, password: str) -> Dict[str, Any]:
    email = email.strip().lower()
    conn = get_connection()
    cursor = conn.cursor()
    try:
        pw_hash = hash_password(password)
        cursor.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            (name.strip(), email, pw_hash)
        )
        user_id = cursor.lastrowid
        conn.commit()
        return {"id": user_id, "name": name.strip(), "email": email}
    finally:
        conn.close()

def authenticate_user(email: str, password: str) -> Optional[Dict[str, Any]]:
    email = email.strip().lower()
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, name, email, password_hash FROM users WHERE email = ?", (email,))
        row = cursor.fetchone()
        if not row:
            return None
        if verify_password(row["password_hash"], password):
            return {"id": row["id"], "name": row["name"], "email": row["email"]}
        return None
    finally:
        conn.close()

def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, name, email, created_at FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        if row:
            return dict(row)
        return None
    finally:
        conn.close()

# Saved Trips Operations
def save_trip(user_id: int, trip_data: Dict[str, Any]) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        INSERT INTO saved_trips 
        (user_id, destination_id, destination_name, starting_location, budget, travel_mode, travelers, itinerary_json, cost_breakdown_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id,
            trip_data.get("destination_id", 0),
            trip_data.get("destination_name", "Trip"),
            trip_data.get("starting_location", "Bengaluru"),
            trip_data.get("budget", 0),
            trip_data.get("travel_mode", "Car"),
            trip_data.get("travelers", 1),
            json.dumps(trip_data.get("itinerary", [])),
            json.dumps(trip_data.get("cost_breakdown", {}))
        ))
        trip_id = cursor.lastrowid
        conn.commit()
        return trip_id
    finally:
        conn.close()

def get_user_trips(user_id: int) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT * FROM saved_trips WHERE user_id = ? ORDER BY created_at DESC", 
            (user_id,)
        )
        rows = cursor.fetchall()
        trips = []
        for r in rows:
            trip = dict(r)
            try:
                trip["itinerary"] = json.loads(trip["itinerary_json"]) if trip["itinerary_json"] else []
                trip["cost_breakdown"] = json.loads(trip["cost_breakdown_json"]) if trip["cost_breakdown_json"] else {}
            except Exception:
                trip["itinerary"] = []
                trip["cost_breakdown"] = {}
            trips.append(trip)
        return trips
    finally:
        conn.close()

def delete_user_trip(user_id: int, trip_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM saved_trips WHERE id = ? AND user_id = ?", (trip_id, user_id))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

# Feedback Operations
def save_feedback(data: Dict[str, Any]) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        INSERT INTO feedback 
        (user_id, user_name, destination_id, destination_name, rating, comments, preferences_json, language)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data.get("user_id"),
            data.get("user_name", "Traveler"),
            data.get("destination_id", 0),
            data.get("destination_name", ""),
            int(data.get("rating", 5)),
            data.get("comments", ""),
            json.dumps(data.get("preferences", {})),
            data.get("language", "en")
        ))
        fb_id = cursor.lastrowid
        conn.commit()
        return fb_id
    finally:
        conn.close()

def get_feedback_analytics() -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) as total, AVG(rating) as avg_rating FROM feedback")
        row = cursor.fetchone()
        total = row["total"] or 0
        avg_rating = round(row["avg_rating"], 1) if row["avg_rating"] is not None else 0.0

        # Rating distribution
        distribution = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        cursor.execute("SELECT rating, COUNT(*) as count FROM feedback GROUP BY rating")
        for r in cursor.fetchall():
            distribution[r["rating"]] = r["count"]

        # Most rated destinations
        cursor.execute("""
        SELECT destination_name, COUNT(*) as count, AVG(rating) as avg_rating 
        FROM feedback 
        GROUP BY destination_name 
        ORDER BY count DESC LIMIT 5
        """)
        top_destinations = [dict(r) for r in cursor.fetchall()]

        # Recent feedback
        cursor.execute("""
        SELECT id, user_name, destination_name, rating, comments, language, created_at 
        FROM feedback 
        ORDER BY created_at DESC LIMIT 10
        """)
        recent_feedback = [dict(r) for r in cursor.fetchall()]

        return {
            "total_reviews": total,
            "average_rating": avg_rating,
            "rating_distribution": distribution,
            "top_rated_destinations": top_destinations,
            "recent_feedback": recent_feedback
        }
    finally:
        conn.close()

# Auto-initialize DB on import
init_db()
