import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function App() {
  const [user, setUser] = useState(null);
  const [currentGame, setCurrentGame] = useState(null);
  const [gameGrid, setGameGrid] = useState([]);
  const [betAmount, setBetAmount] = useState(10);
  const [mineCount, setMineCount] = useState(3);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showAddPoints, setShowAddPoints] = useState(false);
  const [pointsToAdd, setPointsToAdd] = useState(100);
  const [showGameOverDialog, setShowGameOverDialog] = useState(false);
  const [gameResult, setGameResult] = useState(null);
  const [showWallet, setShowWallet] = useState(false);
  const [walletAmount, setWalletAmount] = useState(10);
  const [walletAction, setWalletAction] = useState('deposit');
  const [animatingCells, setAnimatingCells] = useState(new Set());

  // Audio refs
  const coinSoundRef = useRef(null);
  const bombSoundRef = useRef(null);
  const cashoutSoundRef = useRef(null);

  // Initialize user on app start
  useEffect(() => {
    initializeUser();
  }, []);

  const initializeSounds = () => {
    // Create coin sound (high pitch ding)
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const createCoinSound = () => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    };
    
    coinSoundRef.current = createCoinSound;
  };

  const playSound = (type) => {
    try {
      if (type === 'coin' && coinSoundRef.current) {
        coinSoundRef.current();
      }
    } catch (e) {
      console.log('Sound play failed:', e);
    }
  };

  const initializeUser = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/create-user`, {
        method: 'POST',
      });
      const userData = await response.json();
      setUser(userData);
      setMessage('🎰 Welcome to Casino Minesweeper! You have 3 free trials.');
      
      // Initialize sounds after user interaction
      setTimeout(() => {
        initializeSounds();
      }, 1000);
    } catch (error) {
      setMessage('Error initializing user');
    } finally {
      setLoading(false);
    }
  };

  const updateUserData = (newUserData) => {
    if (newUserData) {
      setUser(newUserData);
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
      setMessage('❌ Insufficient points! Please add more points.');
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
          mine_count: mineCount,
        }),
      });

      const gameData = await response.json();
      setCurrentGame(gameData);
      
      // Update user data from response
      if (gameData.user_data) {
        updateUserData(gameData.user_data);
      }
      
      // Initialize empty grid for display
      const grid = Array(5).fill().map(() => Array(5).fill({ revealed: false, isMine: false }));
      setGameGrid(grid);
      
      setMessage(isFreeTrial ? 
        `🎮 Free trial started! ${mineCount} mines, +${gameData.multiplier_per_click}% per safe click!` : 
        `🎯 Game started! ${mineCount} mines, +${gameData.multiplier_per_click}% per safe click!`);
    } catch (error) {
      setMessage('❌ Error starting game');
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
      
      // Update grid with animation
      const newGrid = [...gameGrid];
      newGrid[row][col] = { 
        revealed: true, 
        isMine: result.result === 'mine_hit',
        isSafe: result.result === 'safe'
      };
      setGameGrid(newGrid);

      // Add cell to animating set
      const cellKey = `${row}-${col}`;
      setAnimatingCells(prev => new Set([...prev, cellKey]));
      
      // Remove animation after duration
      setTimeout(() => {
        setAnimatingCells(prev => {
          const newSet = new Set(prev);
          newSet.delete(cellKey);
          return newSet;
        });
      }, 1000);

      if (result.game_over) {
        // Store game info before clearing
        const betAmount = currentGame.bet_amount || 0;
        const isFreeTrial = currentGame.is_free_trial || false;
        
        setCurrentGame(null);
        setMessage(result.message);
        
        // Show game over dialog
        setGameResult({
          type: 'loss',
          amount: betAmount,
          message: isFreeTrial ? 
            `💥 You hit a mine! No points lost (free trial).` :
            `💥 You hit a mine! Lost ₹${betAmount}.`,
          isFreeTrial: isFreeTrial
        });
        setShowGameOverDialog(true);
        
        await fetchUser();
      } else {
        // Play coin sound for safe click
        playSound('coin');
        
        setCurrentGame(prev => ({
          ...prev,
          current_winnings: result.current_winnings,
          current_multiplier: result.current_multiplier,
          safe_clicks: result.safe_clicks
        }));
        setMessage(result.message);
      }
    } catch (error) {
      setMessage('❌ Error processing click');
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
      
      // Update user data from response
      if (result.user_data) {
        updateUserData(result.user_data);
      }
      
      // Show cash out success dialog
      setGameResult({
        type: 'win',
        amount: result.winnings,
        message: `🎉 Congratulations! You earned ₹${result.winnings}!`,
        isFreeTrial: currentGame ? currentGame.is_free_trial : false
      });
      setShowGameOverDialog(true);
      
    } catch (error) {
      setMessage('❌ Error cashing out');
    } finally {
      setLoading(false);
    }
  };

  const handleWalletAction = async () => {
    if (!user) return;
    
    if (walletAmount < 10) {
      setMessage('❌ Minimum ₹10 required');
      return;
    }
    
    try {
      setLoading(true);
      const endpoint = walletAction === 'deposit' ? 'deposit' : 'withdraw';
      const response = await fetch(`${BACKEND_URL}/api/wallet/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.user_id,
          amount: walletAmount,
        }),
      });

      const result = await response.json();
      
      // Update user data from response
      if (result.user_data) {
        updateUserData(result.user_data);
      }
      
      setMessage(result.message);
      setShowWallet(false);
    } catch (error) {
      setMessage(`❌ Error ${walletAction}ing money`);
    } finally {
      setLoading(false);
    }
  };

  const addPoints = async () => {
    if (!user || pointsToAdd < 100) {
      setMessage('❌ Minimum 100 points required');
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
      
      // Update user data from response
      if (result.user_data) {
        updateUserData(result.user_data);
      }
      
      setMessage(result.message);
      setShowAddPoints(false);
    } catch (error) {
      setMessage('❌ Error adding points');
    } finally {
      setLoading(false);
    }
  };

  const closeGameOverDialog = () => {
    setShowGameOverDialog(false);
    setGameResult(null);
  };

  const getCellClass = (cell, row, col) => {
    const cellKey = `${row}-${col}`;
    let baseClass = 'game-cell';
    if (cell.revealed) {
      if (cell.isMine) {
        baseClass += ' mine';
      } else if (cell.isSafe) {
        baseClass += ' safe';
      }
    }
    if (animatingCells.has(cellKey)) {
      baseClass += cell.isMine ? ' mine-explosion' : ' coin-reveal';
    }
    return baseClass;
  };

  const getCellContent = (cell) => {
    if (!cell.revealed) return '';
    if (cell.isMine) return '💣';
    if (cell.isSafe) return '💰';
    return '';
  };

  const getMinePercentage = (mines) => {
    const percentages = {
      1: 5, 2: 8, 3: 12, 4: 15,
      5: 18, 6: 22, 7: 25, 8: 30
    };
    return percentages[mines] || 12;
  };

  if (!user) {
    return (
      <div className="app casino-theme">
        <div className="loading-screen">
          <div className="casino-loading">
            <div className="loading-spinner"></div>
            <h2>🎰 Loading Casino...</h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app casino-theme">
      <header className="casino-header">
        <div className="casino-logo">
          <h1>🎰 CASINO MINESWEEPER</h1>
        </div>
        <div className="user-stats">
          <div className="stat-card">
            <span className="stat-icon">🪙</span>
            <div>
              <span className="stat-label">Points</span>
              <span className="stat-value">{user.points}</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon">💰</span>
            <div>
              <span className="stat-label">Wallet</span>
              <span className="stat-value">₹{user.wallet_balance?.toFixed(2) || '0.00'}</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon">🎮</span>
            <div>
              <span className="stat-label">Free Trials</span>
              <span className="stat-value">{user.free_trials_left}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="app-main">
        {message && (
          <div className="casino-message">
            {message}
          </div>
        )}

        {!currentGame ? (
          <div className="casino-setup">
            <div className="game-setup-card">
              <h3>🎲 Configure Your Game</h3>
              
              <div className="mine-selector">
                <label>Choose Risk Level (More Mines = Higher Rewards):</label>
                <div className="mine-options">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(count => (
                    <button
                      key={count}
                      className={`mine-option ${mineCount === count ? 'selected' : ''}`}
                      onClick={() => setMineCount(count)}
                    >
                      <span className="mine-count">{count}💣</span>
                      <span className="mine-bonus">+{getMinePercentage(count)}%</span>
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="game-controls">
                {user.free_trials_left > 0 && (
                  <button 
                    className="btn btn-primary free-trial-btn"
                    onClick={() => startGame(true)}
                    disabled={loading}
                  >
                    🎮 Free Trial ({user.free_trials_left} left)
                  </button>
                )}

                <div className="bet-section">
                  <label>Bet Amount:</label>
                  <input
                    type="number"
                    value={betAmount}
                    onChange={(e) => setBetAmount(Number(e.target.value))}
                    min="1"
                    max={user.points}
                    disabled={loading}
                    className="bet-input"
                  />
                  <button 
                    className="btn btn-primary play-btn"
                    onClick={() => startGame(false)}
                    disabled={loading || user.points < betAmount}
                  >
                    🎲 Play Now (₹{betAmount})
                  </button>
                </div>
              </div>
            </div>

            <div className="casino-actions">
              <button 
                className="btn btn-secondary action-btn"
                onClick={() => setShowAddPoints(true)}
              >
                🪙 Buy Points
              </button>
              <button 
                className="btn btn-secondary action-btn"
                onClick={() => setShowWallet(true)}
              >
                💰 Manage Wallet
              </button>
            </div>

            <div className="game-info-card">
              <h4>🎯 Game Rules:</h4>
              <ul>
                <li>🎯 Select mine count: More mines = Higher risk but bigger rewards per safe click</li>
                <li>💰 Each safe click multiplies your bet by the percentage shown</li>
                <li>🏦 Cash out anytime to keep your winnings</li>
                <li>💣 Hit a mine and lose your entire bet!</li>
                <li>🎮 3 free practice rounds to get started</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="casino-game-area">
            <div className="game-stats-panel">
              <div className="stat-item">
                <span className="stat-label">Bet</span>
                <span className="stat-value gold">₹{currentGame.bet_amount}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Mines</span>
                <span className="stat-value danger">{currentGame.mine_count}💣</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Multiplier</span>
                <span className="stat-value success">{currentGame.current_multiplier?.toFixed(2)}x</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Current Win</span>
                <span className="stat-value highlight">₹{currentGame.current_winnings}</span>
              </div>
            </div>

            <div className="casino-grid-container">
              <div className="casino-grid">
                {Array(5).fill().map((_, row) => (
                  <div key={row} className="grid-row">
                    {Array(5).fill().map((_, col) => {
                      const cell = gameGrid[row] && gameGrid[row][col] ? gameGrid[row][col] : { revealed: false };
                      return (
                        <button
                          key={`${row}-${col}`}
                          className={getCellClass(cell, row, col)}
                          onClick={() => clickCell(row, col)}
                          disabled={loading || cell.revealed}
                        >
                          <div className="cell-content">
                            {getCellContent(cell)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="game-action-panel">
              <button 
                className="btn btn-success cashout-btn"
                onClick={cashOut}
                disabled={loading || currentGame.safe_clicks === 0}
              >
                💰 CASH OUT ₹{currentGame.current_winnings}
              </button>
            </div>
          </div>
        )}

        {/* Game Over Dialog */}
        {showGameOverDialog && gameResult && (
          <div className="modal-overlay">
            <div className="game-result-modal">
              <div className="result-header">
                <div className="result-icon">
                  {gameResult.type === 'win' ? '🎉' : '💥'}
                </div>
                <h3 className={gameResult.type === 'win' ? 'win-title' : 'lose-title'}>
                  {gameResult.type === 'win' ? 'BIG WIN!' : 'GAME OVER!'}
                </h3>
              </div>
              
              <div className="result-amount">
                {gameResult.type === 'win' ? (
                  <span className="win-amount">+₹{gameResult.amount}</span>
                ) : (
                  <span className="loss-amount">-₹{gameResult.amount}</span>
                )}
              </div>
              
              <p className="result-message">{gameResult.message}</p>
              
              {gameResult.isFreeTrial && (
                <p className="trial-note">🎮 This was a free trial - no real money affected!</p>
              )}
              
              <button 
                className="btn btn-primary continue-btn"
                onClick={closeGameOverDialog}
              >
                Continue Playing
              </button>
            </div>
          </div>
        )}

        {/* Wallet Modal */}
        {showWallet && (
          <div className="modal-overlay">
            <div className="wallet-modal">
              <h3>💰 Wallet Management</h3>
              
              <div className="current-balance">
                Balance: <span className="balance-amount">₹{user.wallet_balance?.toFixed(2) || '0.00'}</span>
              </div>
              
              <div className="wallet-controls">
                <div className="action-tabs">
                  <button
                    className={`tab-btn ${walletAction === 'deposit' ? 'active' : ''}`}
                    onClick={() => setWalletAction('deposit')}
                  >
                    Deposit
                  </button>
                  <button
                    className={`tab-btn ${walletAction === 'withdraw' ? 'active' : ''}`}
                    onClick={() => setWalletAction('withdraw')}
                  >
                    Withdraw
                  </button>
                </div>
                
                <div className="amount-section">
                  <label>{walletAction === 'deposit' ? 'Add Money:' : 'Withdraw Amount:'}</label>
                  <input
                    type="number"
                    value={walletAmount}
                    onChange={(e) => setWalletAmount(Number(e.target.value))}
                    min="10"
                    step="10"
                    className="wallet-input"
                    placeholder="Min ₹10"
                  />
                </div>
                
                <div className="wallet-actions">
                  <button 
                    className="btn btn-primary wallet-action-btn"
                    onClick={handleWalletAction}
                    disabled={loading || walletAmount < 10}
                  >
                    💳 {walletAction === 'deposit' ? 'Add Money' : 'Withdraw'} ₹{walletAmount}
                  </button>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => setShowWallet(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Points Modal */}
        {showAddPoints && (
          <div className="modal-overlay">
            <div className="points-modal">
              <h3>🪙 Buy Game Points</h3>
              <p className="exchange-rate">Exchange Rate: 1 Point = ₹1</p>
              
              <div className="points-form">
                <label>Points to Purchase:</label>
                <input
                  type="number"
                  value={pointsToAdd}
                  onChange={(e) => setPointsToAdd(Number(e.target.value))}
                  min="100"
                  step="50"
                  className="points-input"
                  placeholder="Minimum 100 points"
                />
                
                <div className="cost-display">
                  Total Cost: <span className="cost-amount">₹{pointsToAdd}</span>
                </div>
                
                <div className="points-actions">
                  <button 
                    className="btn btn-primary buy-btn"
                    onClick={addPoints}
                    disabled={loading || pointsToAdd < 100}
                  >
                    💳 Purchase {pointsToAdd} Points
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

      <footer className="casino-footer">
        <p>🎮 Games: {user.total_games} | 🏆 Winnings: ₹{user.total_winnings} | 💰 Wallet: ₹{user.wallet_balance?.toFixed(2) || '0.00'}</p>
      </footer>
    </div>
  );
}

export default App;