from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient
import os
import uuid
import random
from datetime import datetime
from typing import List, Optional

app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/')
client = MongoClient(MONGO_URL)
db = client.minesweeper_db

# Collections
users_collection = db.users
games_collection = db.games

# Pydantic models
class User(BaseModel):
    user_id: str
    points: int = 1000  # Start with 1000 points for demo
    free_trials_left: int = 3
    total_games: int = 0
    total_winnings: int = 0
    created_at: datetime

class GameStart(BaseModel):
    user_id: str
    bet_amount: int

class GameAction(BaseModel):
    game_id: str
    row: int
    col: int

class CashOut(BaseModel):
    game_id: str

class AddPoints(BaseModel):
    user_id: str
    points: int

class Game(BaseModel):
    game_id: str
    user_id: str
    bet_amount: int
    current_multiplier: float
    current_winnings: int
    mines: List[List[int]]
    revealed: List[List[bool]]
    is_active: bool
    is_free_trial: bool
    safe_clicks: int
    created_at: datetime

# Helper functions
def generate_mines(grid_size=5, mine_count=3):
    """Generate random mine positions"""
    positions = []
    for i in range(grid_size):
        for j in range(grid_size):
            positions.append((i, j))
    
    mine_positions = random.sample(positions, mine_count)
    mines = [[0 for _ in range(grid_size)] for _ in range(grid_size)]
    
    for row, col in mine_positions:
        mines[row][col] = 1
    
    return mines

def calculate_multiplier(safe_clicks):
    """Calculate multiplier based on safe clicks (5% increase per click)"""
    return 1.0 + (safe_clicks * 0.05)

# API Routes
@app.post("/api/create-user")
async def create_user():
    """Create a new user"""
    user_id = str(uuid.uuid4())
    user = {
        "user_id": user_id,
        "points": 1000,  # Demo starting points
        "free_trials_left": 3,
        "total_games": 0,
        "total_winnings": 0,
        "created_at": datetime.now()
    }
    
    users_collection.insert_one(user)
    return {"user_id": user_id, "points": 1000, "free_trials_left": 3}

@app.get("/api/user/{user_id}")
async def get_user(user_id: str):
    """Get user information"""
    user = users_collection.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Remove MongoDB _id field
    user.pop('_id', None)
    return user

@app.post("/api/add-points")
async def add_points(request: AddPoints):
    """Dummy add points functionality"""
    user = users_collection.find_one({"user_id": request.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Minimum 100 points requirement
    if request.points < 100:
        raise HTTPException(status_code=400, detail="Minimum 100 points required")
    
    new_points = user["points"] + request.points
    users_collection.update_one(
        {"user_id": request.user_id},
        {"$set": {"points": new_points}}
    )
    
    return {"message": f"Added {request.points} points successfully", "total_points": new_points}

@app.post("/api/start-game")
async def start_game(request: GameStart):
    """Start a new minesweeper game"""
    user = users_collection.find_one({"user_id": request.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    is_free_trial = user["free_trials_left"] > 0 and request.bet_amount == 0
    
    # Check if user has enough points for paid game
    if not is_free_trial and user["points"] < request.bet_amount:
        raise HTTPException(status_code=400, detail="Insufficient points")
    
    # Deduct points if not a free trial
    if not is_free_trial:
        users_collection.update_one(
            {"user_id": request.user_id},
            {"$inc": {"points": -request.bet_amount}}
        )
    else:
        # Deduct free trial
        users_collection.update_one(
            {"user_id": request.user_id},
            {"$inc": {"free_trials_left": -1}}
        )
    
    # Create new game
    game_id = str(uuid.uuid4())
    mines = generate_mines()
    revealed = [[False for _ in range(5)] for _ in range(5)]
    
    game = {
        "game_id": game_id,
        "user_id": request.user_id,
        "bet_amount": request.bet_amount,
        "current_multiplier": 1.0,
        "current_winnings": request.bet_amount,
        "mines": mines,
        "revealed": revealed,
        "is_active": True,
        "is_free_trial": is_free_trial,
        "safe_clicks": 0,
        "created_at": datetime.now()
    }
    
    games_collection.insert_one(game)
    
    # Update user total games
    users_collection.update_one(
        {"user_id": request.user_id},
        {"$inc": {"total_games": 1}}
    )
    
    return {
        "game_id": game_id,
        "is_free_trial": is_free_trial,
        "bet_amount": request.bet_amount,
        "current_winnings": request.bet_amount if not is_free_trial else 0,
        "grid_size": 5,
        "mine_count": 3
    }

@app.post("/api/click-cell")
async def click_cell(request: GameAction):
    """Handle cell click in game"""
    game = games_collection.find_one({"game_id": request.game_id})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    if not game["is_active"]:
        raise HTTPException(status_code=400, detail="Game is not active")
    
    # Check if cell already revealed
    if game["revealed"][request.row][request.col]:
        raise HTTPException(status_code=400, detail="Cell already revealed")
    
    # Reveal cell
    games_collection.update_one(
        {"game_id": request.game_id},
        {"$set": {f"revealed.{request.row}.{request.col}": True}}
    )
    
    # Check if it's a mine
    if game["mines"][request.row][request.col] == 1:
        # Game over - hit mine
        games_collection.update_one(
            {"game_id": request.game_id},
            {"$set": {"is_active": False}}
        )
        
        return {
            "result": "mine_hit",
            "game_over": True,
            "winnings": 0,
            "message": "You hit a mine! Game over."
        }
    else:
        # Safe click - increase multiplier
        new_safe_clicks = game["safe_clicks"] + 1
        new_multiplier = calculate_multiplier(new_safe_clicks)
        new_winnings = int(game["bet_amount"] * new_multiplier) if not game["is_free_trial"] else 0
        
        games_collection.update_one(
            {"game_id": request.game_id},
            {
                "$set": {
                    "safe_clicks": new_safe_clicks,
                    "current_multiplier": new_multiplier,
                    "current_winnings": new_winnings
                }
            }
        )
        
        return {
            "result": "safe",
            "game_over": False,
            "safe_clicks": new_safe_clicks,
            "current_multiplier": round(new_multiplier, 2),
            "current_winnings": new_winnings,
            "message": f"Safe! Multiplier: {round(new_multiplier, 2)}x"
        }

@app.post("/api/cash-out")
async def cash_out(request: CashOut):
    """Cash out from current game"""
    game = games_collection.find_one({"game_id": request.game_id})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    if not game["is_active"]:
        raise HTTPException(status_code=400, detail="Game is not active")
    
    # End game
    games_collection.update_one(
        {"game_id": request.game_id},
        {"$set": {"is_active": False}}
    )
    
    winnings = game["current_winnings"]
    
    # Add winnings to user points (only for paid games)
    if not game["is_free_trial"] and winnings > 0:
        users_collection.update_one(
            {"user_id": game["user_id"]},
            {
                "$inc": {
                    "points": winnings,
                    "total_winnings": winnings
                }
            }
        )
    
    return {
        "result": "cashed_out",
        "winnings": winnings,
        "message": f"Successfully cashed out {winnings} points!"
    }

@app.get("/api/game/{game_id}")
async def get_game(game_id: str):
    """Get game state"""
    game = games_collection.find_one({"game_id": game_id})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    # Remove MongoDB _id field and don't expose mines
    game.pop('_id', None)
    mines_hidden = [[0 if not game["revealed"][i][j] else game["mines"][i][j] 
                     for j in range(5)] for i in range(5)]
    game["mines"] = mines_hidden
    
    return game

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)