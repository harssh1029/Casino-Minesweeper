import React, { useState, useEffect } from 'react';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function App() {
  const [user, setUser] = useState(null);
  const [currentGame, setCurrentGame] = useState(null);
  const [gameGrid, setGameGrid] = useState([]);
  const [betAmount, setBetAmount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showAddPoints, setShowAddPoints] = useState(false);
  const [pointsToAdd, setPointsToAdd] = useState(100);
  const [showGameOverDialog, setShowGameOverDialog] = useState(false);
  const [gameResult, setGameResult] = useState(null);

  // Initialize user on app start
  useEffect(() => {
    initializeUser();
  }, []);

  const initializeUser = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/create-user`, {
        method: 'POST',
      });
      const userData = await response.json();
      setUser(userData);
      setMessage('Welcome! You have 3 free trials to start.');
    } catch (error) {
      setMessage('Error initializing user');
    } finally {
      setLoading(false);
    }
  };

  const fetchUser = async () => {
    if (!user) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/user/${user.user_id}`);
      const userData = await response.json();
      setUser(userData);
    } catch (error) {
      setMessage('Error fetching user data');
    }
  };

  const startGame = async (isFreeTrial = false) => {
    if (!user) return;
    
    const actualBetAmount = isFreeTrial ? 0 : betAmount;
    
    if (!isFreeTrial && user.points < betAmount) {
      setMessage('Insufficient points! Please add more points.');
      setShowAddPoints(true);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/start-game`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.user_id,
          bet_amount: actualBetAmount,
        }),
      });

      const gameData = await response.json();
      setCurrentGame(gameData);
      
      // Initialize empty grid for display
      const grid = Array(5).fill().map(() => Array(5).fill({ revealed: false, isMine: false }));
      setGameGrid(grid);
      
      await fetchUser(); // Refresh user data
      setMessage(isFreeTrial ? 'Free trial started! Good luck!' : `Game started with ${betAmount} points bet!`);
    } catch (error) {
      setMessage('Error starting game');
    } finally {
      setLoading(false);
    }
  };

  const clickCell = async (row, col) => {
    if (!currentGame || !currentGame.game_id) return;
    
    // Don't allow clicking already revealed cells
    if (gameGrid[row] && gameGrid[row][col] && gameGrid[row][col].revealed) return;

    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/click-cell`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          game_id: currentGame.game_id,
          row: row,
          col: col,
        }),
      });

      const result = await response.json();
      
      // Update grid
      const newGrid = [...gameGrid];
      newGrid[row][col] = { 
        revealed: true, 
        isMine: result.result === 'mine_hit',
        isSafe: result.result === 'safe'
      };
      setGameGrid(newGrid);

      if (result.game_over) {
        setCurrentGame(null);
        setMessage(result.message);
        
        // Show game over dialog
        setGameResult({
          type: 'loss',
          amount: currentGame.bet_amount,
          message: `You hit a mine! Lost ${currentGame.bet_amount} points.`,
          isFreeTrial: currentGame.is_free_trial
        });
        setShowGameOverDialog(true);
        
        await fetchUser();
      } else {
        setCurrentGame(prev => ({
          ...prev,
          current_winnings: result.current_winnings,
          current_multiplier: result.current_multiplier,
          safe_clicks: result.safe_clicks
        }));
        setMessage(result.message);
      }
    } catch (error) {
      setMessage('Error processing click');
    } finally {
      setLoading(false);
    }
  };

  const cashOut = async () => {
    if (!currentGame) return;

    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/cash-out`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          game_id: currentGame.game_id,
        }),
      });

      const result = await response.json();
      setCurrentGame(null);
      setMessage(result.message);
      setGameGrid([]);
      await fetchUser();
    } catch (error) {
      setMessage('Error cashing out');
    } finally {
      setLoading(false);
    }
  };

  const addPoints = async () => {
    if (!user || pointsToAdd < 100) {
      setMessage('Minimum 100 points required');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/add-points`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.user_id,
          points: pointsToAdd,
        }),
      });

      const result = await response.json();
      await fetchUser();
      setMessage(result.message);
      setShowAddPoints(false);
    } catch (error) {
      setMessage('Error adding points');
    } finally {
      setLoading(false);
    }
  };

  const getCellClass = (cell) => {
    let baseClass = 'game-cell';
    if (cell.revealed) {
      if (cell.isMine) {
        baseClass += ' mine';
      } else if (cell.isSafe) {
        baseClass += ' safe';
      }
    }
    return baseClass;
  };

  const getCellContent = (cell) => {
    if (!cell.revealed) return '';
    if (cell.isMine) return '💣';
    if (cell.isSafe) return '💎';
    return '';
  };

  if (!user) {
    return (
      <div className="app">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <h2>Initializing Minesweeper...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>💣 Minesweeper Bet</h1>
        <div className="user-stats">
          <div className="stat-item">
            <span className="stat-label">Points:</span>
            <span className="stat-value">{user.points}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Free Trials:</span>
            <span className="stat-value">{user.free_trials_left}</span>
          </div>
        </div>
      </header>

      <main className="app-main">
        {message && (
          <div className="message-bar">
            {message}
          </div>
        )}

        {!currentGame ? (
          <div className="game-setup">
            <div className="bet-section">
              <h3>Start New Game</h3>
              
              {user.free_trials_left > 0 && (
                <button 
                  className="btn btn-primary free-trial-btn"
                  onClick={() => startGame(true)}
                  disabled={loading}
                >
                  🎮 Start Free Trial ({user.free_trials_left} left)
                </button>
              )}

              <div className="bet-controls">
                <label>Bet Amount (Points):</label>
                <input
                  type="number"
                  value={betAmount}
                  onChange={(e) => setBetAmount(Number(e.target.value))}
                  min="1"
                  max={user.points}
                  disabled={loading}
                />
                <button 
                  className="btn btn-primary"
                  onClick={() => startGame(false)}
                  disabled={loading || user.points < betAmount}
                >
                  🎲 Start Paid Game
                </button>
              </div>
            </div>

            <button 
              className="btn btn-secondary add-points-btn"
              onClick={() => setShowAddPoints(true)}
            >
              💰 Add Points
            </button>

            <div className="game-info">
              <h4>How to Play:</h4>
              <ul>
                <li>5x5 grid with 3 hidden mines</li>
                <li>Each safe click increases winnings by 5%</li>
                <li>Cash out anytime to keep winnings</li>
                <li>Hit a mine = lose everything!</li>
                <li>First 3 games are free trials</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="game-area">
            <div className="game-stats">
              <div className="stat-item">
                <span className="stat-label">Bet:</span>
                <span className="stat-value">{currentGame.bet_amount} pts</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Multiplier:</span>
                <span className="stat-value">{currentGame.current_multiplier?.toFixed(2)}x</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Current Win:</span>
                <span className="stat-value highlight">{currentGame.current_winnings} pts</span>
              </div>
            </div>

            <div className="game-grid">
              {Array(5).fill().map((_, row) => (
                <div key={row} className="grid-row">
                  {Array(5).fill().map((_, col) => {
                    const cell = gameGrid[row] && gameGrid[row][col] ? gameGrid[row][col] : { revealed: false };
                    return (
                      <button
                        key={`${row}-${col}`}
                        className={getCellClass(cell)}
                        onClick={() => clickCell(row, col)}
                        disabled={loading || cell.revealed}
                      >
                        {getCellContent(cell)}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="game-actions">
              <button 
                className="btn btn-success cash-out-btn"
                onClick={cashOut}
                disabled={loading || currentGame.safe_clicks === 0}
              >
                💰 Cash Out ({currentGame.current_winnings} pts)
              </button>
            </div>
          </div>
        )}

        {showAddPoints && (
          <div className="modal-overlay">
            <div className="modal">
              <h3>Add Points (Dummy Payment)</h3>
              <p>1 Point = 1 Rupee</p>
              <div className="add-points-form">
                <label>Points to Add (Min 100):</label>
                <input
                  type="number"
                  value={pointsToAdd}
                  onChange={(e) => setPointsToAdd(Number(e.target.value))}
                  min="100"
                  step="50"
                />
                <div className="modal-actions">
                  <button 
                    className="btn btn-primary"
                    onClick={addPoints}
                    disabled={loading || pointsToAdd < 100}
                  >
                    💳 Add {pointsToAdd} Points (₹{pointsToAdd})
                  </button>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => setShowAddPoints(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>🎮 Total Games: {user.total_games} | 🏆 Total Winnings: {user.total_winnings} pts</p>
      </footer>
    </div>
  );
}

export default App;