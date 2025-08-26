#!/usr/bin/env python3
"""
Backend API Testing Script for Go VV PWA
Tests all FastAPI endpoints using the Kubernetes ingress prefix '/api'
"""

import requests
import json
import sys
from datetime import datetime
import os
from pathlib import Path

# Load environment variables to get the backend URL
def load_env_file(file_path):
    env_vars = {}
    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    # Remove quotes if present
                    value = value.strip('"\'')
                    env_vars[key] = value
    return env_vars

# Get backend URL from frontend/.env
frontend_env = load_env_file('/app/frontend/.env')
BACKEND_URL = frontend_env.get('REACT_APP_BACKEND_URL', 'http://localhost:8001')

print(f"Testing backend at: {BACKEND_URL}")
print("=" * 60)

# Test results storage
test_results = []

def log_test(test_name, success, details):
    """Log test results"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status} {test_name}")
    if details:
        print(f"   Details: {details}")
    test_results.append({
        'test': test_name,
        'success': success,
        'details': details
    })
    print()

def test_health_endpoint():
    """Test 1: GET /api/health"""
    try:
        response = requests.get(f"{BACKEND_URL}/api/health", timeout=10)
        
        if response.status_code != 200:
            log_test("Health Endpoint", False, f"Expected status 200, got {response.status_code}")
            return False
            
        data = response.json()
        
        # Check expected structure: {success:true,data:{status:"ok"}}
        if not data.get('success'):
            log_test("Health Endpoint", False, f"Expected success=true, got {data.get('success')}")
            return False
            
        if not data.get('data', {}).get('status') == 'ok':
            log_test("Health Endpoint", False, f"Expected data.status='ok', got {data.get('data', {}).get('status')}")
            return False
            
        log_test("Health Endpoint", True, f"Response: {data}")
        return True
        
    except Exception as e:
        log_test("Health Endpoint", False, f"Request failed: {str(e)}")
        return False

def test_create_activity():
    """Test 2: POST /api/activities"""
    try:
        payload = {
            "name": "Test Ride",
            "distance_km": 2.5,
            "duration_sec": 600,
            "avg_kmh": 15.0,
            "start_time": "2025-07-01T10:00:00Z",
            "path": [
                {"lat": 37.77, "lng": -122.41, "t": 1720000000},
                {"lat": 37.7705, "lng": -122.409, "t": 1720000060}
            ],
            "notes": "unit test",
            "private": False
        }
        
        response = requests.post(
            f"{BACKEND_URL}/api/activities", 
            json=payload,
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("Create Activity", False, f"Expected status 200, got {response.status_code}. Response: {response.text}")
            return None
            
        data = response.json()
        
        if not data.get('success'):
            log_test("Create Activity", False, f"Expected success=true, got {data.get('success')}")
            return None
            
        activity = data.get('data', {}).get('activity')
        if not activity:
            log_test("Create Activity", False, "No activity in response data")
            return None
            
        if not activity.get('id'):
            log_test("Create Activity", False, "Activity missing id field")
            return None
            
        if not activity.get('points_earned'):
            log_test("Create Activity", False, "Activity missing points_earned field")
            return None
            
        log_test("Create Activity", True, f"Created activity with id: {activity.get('id')}, points: {activity.get('points_earned')}")
        return activity.get('id')
        
    except Exception as e:
        log_test("Create Activity", False, f"Request failed: {str(e)}")
        return None

def test_list_activities():
    """Test 3: GET /api/activities?limit=10"""
    try:
        response = requests.get(f"{BACKEND_URL}/api/activities?limit=10", timeout=10)
        
        if response.status_code != 200:
            log_test("List Activities", False, f"Expected status 200, got {response.status_code}")
            return False
            
        data = response.json()
        
        if not data.get('success'):
            log_test("List Activities", False, f"Expected success=true, got {data.get('success')}")
            return False
            
        items = data.get('data', {}).get('items', [])
        if len(items) < 1:
            log_test("List Activities", False, f"Expected items array length >= 1, got {len(items)}")
            return False
            
        # Check that dates are ISO strings
        for item in items:
            for date_field in ['start_time', 'created_at', 'updated_at']:
                if date_field in item:
                    date_value = item[date_field]
                    if not isinstance(date_value, str):
                        log_test("List Activities", False, f"Expected {date_field} to be ISO string, got {type(date_value)}")
                        return False
                    # Try to parse as ISO date
                    try:
                        datetime.fromisoformat(date_value.replace('Z', '+00:00'))
                    except:
                        log_test("List Activities", False, f"Invalid ISO date format for {date_field}: {date_value}")
                        return False
                        
        log_test("List Activities", True, f"Found {len(items)} activities with valid ISO dates")
        return True
        
    except Exception as e:
        log_test("List Activities", False, f"Request failed: {str(e)}")
        return False

def test_get_activity(activity_id):
    """Test 4: GET /api/activities/{id}"""
    if not activity_id:
        log_test("Get Activity", False, "No activity ID provided from create test")
        return False
        
    try:
        response = requests.get(f"{BACKEND_URL}/api/activities/{activity_id}", timeout=10)
        
        if response.status_code != 200:
            log_test("Get Activity", False, f"Expected status 200, got {response.status_code}")
            return False
            
        data = response.json()
        
        if not data.get('success'):
            log_test("Get Activity", False, f"Expected success=true, got {data.get('success')}")
            return False
            
        activity = data.get('data', {}).get('activity')
        if not activity:
            log_test("Get Activity", False, "No activity in response data")
            return False
            
        # Verify the activity matches expected fields
        expected_fields = ['id', 'name', 'distance_km', 'duration_sec', 'avg_kmh', 'start_time', 'points_earned']
        for field in expected_fields:
            if field not in activity:
                log_test("Get Activity", False, f"Activity missing expected field: {field}")
                return False
                
        if activity['id'] != activity_id:
            log_test("Get Activity", False, f"Activity ID mismatch: expected {activity_id}, got {activity['id']}")
            return False
            
        log_test("Get Activity", True, f"Retrieved activity {activity_id} with all expected fields")
        return True
        
    except Exception as e:
        log_test("Get Activity", False, f"Request failed: {str(e)}")
        return False

def test_contact_endpoint():
    """Test 5: POST /api/contact"""
    try:
        payload = {
            "email": "user@example.com",
            "subject": "Hello",
            "message": "Test"
        }
        
        response = requests.post(
            f"{BACKEND_URL}/api/contact",
            json=payload,
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        if response.status_code != 200:
            log_test("Contact Endpoint", False, f"Expected status 200, got {response.status_code}")
            return False
            
        data = response.json()
        
        # Expect success=false with TODO message unless EMAIL env is set
        if data.get('success') != False:
            log_test("Contact Endpoint", False, f"Expected success=false (no EMAIL config), got {data.get('success')}")
            return False
            
        message = data.get('message', '')
        if 'TODO' not in message:
            log_test("Contact Endpoint", False, f"Expected TODO message, got: {message}")
            return False
            
        log_test("Contact Endpoint", True, f"Correctly returned success=false with TODO message: {message}")
        return True
        
    except Exception as e:
        log_test("Contact Endpoint", False, f"Request failed: {str(e)}")
        return False

def main():
    """Run all tests in order"""
    print("Starting Backend API Tests")
    print("=" * 60)
    
    # Test 1: Health endpoint
    health_ok = test_health_endpoint()
    
    # Test 2: Create activity
    activity_id = test_create_activity()
    
    # Test 3: List activities
    list_ok = test_list_activities()
    
    # Test 4: Get specific activity
    get_ok = test_get_activity(activity_id)
    
    # Test 5: Contact endpoint
    contact_ok = test_contact_endpoint()
    
    # Summary
    print("=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for result in test_results if result['success'])
    total = len(test_results)
    
    for result in test_results:
        status = "✅" if result['success'] else "❌"
        print(f"{status} {result['test']}")
    
    print(f"\nPassed: {passed}/{total}")
    
    if passed == total:
        print("🎉 All tests passed!")
        return 0
    else:
        print("❌ Some tests failed!")
        return 1

if __name__ == "__main__":
    sys.exit(main())