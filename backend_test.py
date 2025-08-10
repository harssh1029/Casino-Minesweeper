import requests
import sys
import json
from datetime import datetime

class MinesweeperAPITester:
    def __init__(self, base_url="https://79757a18-8b0a-4609-8f34-249bc4234c21.preview.emergentagent.com"):
        self.base_url = base_url
        self.user_id = None
        self.game_id = None
        self.tests_run = 0
        self.tests_passed = 0

    def run_test(self, name, method, endpoint, expected_status, data=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)

            print(f"   Status Code: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Expected {expected_status}, got {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)}")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error Response: {json.dumps(error_data, indent=2)}")
                except:
                    print(f"   Error Text: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_create_user(self):
        """Test user creation"""
        success, response = self.run_test(
            "Create User",
            "POST",
            "api/create-user",
            200
        )
        if success and 'user_id' in response:
            self.user_id = response['user_id']
            print(f"   Created user: {self.user_id}")
            return True
        return False

    def test_get_user(self):
        """Test getting user data"""
        if not self.user_id:
            print("❌ No user_id available for get user test")
            return False
            
        success, response = self.run_test(
            "Get User",
            "GET",
            f"api/user/{self.user_id}",
            200
        )
        return success

    def test_add_points_invalid(self):
        """Test adding points with invalid amount (less than 100)"""
        if not self.user_id:
            print("❌ No user_id available for add points test")
            return False
            
        success, response = self.run_test(
            "Add Points (Invalid - Less than 100)",
            "POST",
            "api/add-points",
            400,
            data={"user_id": self.user_id, "points": 50}
        )
        return success

    def test_add_points_valid(self):
        """Test adding valid points"""
        if not self.user_id:
            print("❌ No user_id available for add points test")
            return False
            
        success, response = self.run_test(
            "Add Points (Valid - 200 points)",
            "POST",
            "api/add-points",
            200,
            data={"user_id": self.user_id, "points": 200}
        )
        return success

    def test_start_free_trial_game(self):
        """Test starting a free trial game"""
        if not self.user_id:
            print("❌ No user_id available for start game test")
            return False
            
        success, response = self.run_test(
            "Start Free Trial Game",
            "POST",
            "api/start-game",
            200,
            data={"user_id": self.user_id, "bet_amount": 0}
        )
        if success and 'game_id' in response:
            self.game_id = response['game_id']
            print(f"   Started game: {self.game_id}")
            return True
        return False

    def test_click_safe_cell(self):
        """Test clicking a cell (hoping it's safe)"""
        if not self.game_id:
            print("❌ No game_id available for click cell test")
            return False
            
        success, response = self.run_test(
            "Click Cell (0,0)",
            "POST",
            "api/click-cell",
            200,
            data={"game_id": self.game_id, "row": 0, "col": 0}
        )
        return success

    def test_click_already_revealed_cell(self):
        """Test clicking an already revealed cell"""
        if not self.game_id:
            print("❌ No game_id available for click cell test")
            return False
            
        success, response = self.run_test(
            "Click Already Revealed Cell (0,0)",
            "POST",
            "api/click-cell",
            400,
            data={"game_id": self.game_id, "row": 0, "col": 0}
        )
        return success

    def test_get_game_state(self):
        """Test getting game state"""
        if not self.game_id:
            print("❌ No game_id available for get game test")
            return False
            
        success, response = self.run_test(
            "Get Game State",
            "GET",
            f"api/game/{self.game_id}",
            200
        )
        return success

    def test_cash_out(self):
        """Test cashing out from game"""
        if not self.game_id:
            print("❌ No game_id available for cash out test")
            return False
            
        success, response = self.run_test(
            "Cash Out",
            "POST",
            "api/cash-out",
            200,
            data={"game_id": self.game_id}
        )
        return success

    def test_start_paid_game(self):
        """Test starting a paid game"""
        if not self.user_id:
            print("❌ No user_id available for start paid game test")
            return False
            
        success, response = self.run_test(
            "Start Paid Game (50 points bet)",
            "POST",
            "api/start-game",
            200,
            data={"user_id": self.user_id, "bet_amount": 50}
        )
        if success and 'game_id' in response:
            self.game_id = response['game_id']
            print(f"   Started paid game: {self.game_id}")
            return True
        return False

    def test_insufficient_points_game(self):
        """Test starting game with insufficient points"""
        if not self.user_id:
            print("❌ No user_id available for insufficient points test")
            return False
            
        success, response = self.run_test(
            "Start Game with Insufficient Points (10000 points bet)",
            "POST",
            "api/start-game",
            400,
            data={"user_id": self.user_id, "bet_amount": 10000}
        )
        return success

def main():
    print("🎮 Starting Minesweeper API Tests")
    print("=" * 50)
    
    tester = MinesweeperAPITester()
    
    # Test sequence
    test_results = []
    
    # 1. User Management Tests
    test_results.append(tester.test_create_user())
    test_results.append(tester.test_get_user())
    
    # 2. Points Management Tests
    test_results.append(tester.test_add_points_invalid())
    test_results.append(tester.test_add_points_valid())
    
    # 3. Free Trial Game Tests
    test_results.append(tester.test_start_free_trial_game())
    test_results.append(tester.test_click_safe_cell())
    test_results.append(tester.test_click_already_revealed_cell())
    test_results.append(tester.test_get_game_state())
    test_results.append(tester.test_cash_out())
    
    # 4. Paid Game Tests
    test_results.append(tester.test_start_paid_game())
    test_results.append(tester.test_insufficient_points_game())
    
    # Print final results
    print("\n" + "=" * 50)
    print(f"📊 FINAL RESULTS")
    print(f"Tests Run: {tester.tests_run}")
    print(f"Tests Passed: {tester.tests_passed}")
    print(f"Success Rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())