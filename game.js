// Game State
let gameState = {
    cards: [],
    baseCards: [],
    userCards: [],
    teams: {
        red: { players: [], score: 0, currentPlayerIndex: 0 },
        blue: { players: [], score: 0, currentPlayerIndex: 0 }
    },
    currentTeam: 'red',
    winningScore: 30,
    currentCard: null,
    usedCardIndices: [],
    roundWords: []
};

// Load cards from localStorage and CSV file
function loadCards() {
    // Load user cards from localStorage
    const saved = localStorage.getItem('thirtySecondsCards');
    if (saved) {
        gameState.userCards = JSON.parse(saved);
    }
    
    // Load base cards from CSV file
    loadBaseCardsFromCSV();
}

// Load base cards from CSV file
function loadBaseCardsFromCSV() {
    fetch('cards.csv')
        .then(response => {
            if (!response.ok) {
                console.log('No cards.csv file found - using only user cards');
                mergeCards();
                return null;
            }
            return response.text();
        })
        .then(csvText => {
            if (csvText) {
                gameState.baseCards = parseCSV(csvText);
            }
            mergeCards();
        })
        .catch(error => {
            console.log('Error loading cards.csv:', error);
            mergeCards();
        });
}

// Parse CSV text into cards array
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const cards = [];
    
    // Skip header row (first line)
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
            // Handle CSV properly (basic parsing, handles commas within quotes)
            const words = parseCSVLine(line);
            if (words.length >= 5) {
                cards.push(words.slice(0, 5));
            }
        }
    }
    
    return cards;
}

// Parse a single CSV line (handles basic quoting)
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current.trim());
    return result;
}

// Merge base cards and user cards
function mergeCards() {
    gameState.cards = [...gameState.baseCards, ...gameState.userCards];
    updateCardsList();
}

// Save user cards to localStorage
function saveCards() {
    localStorage.setItem('thirtySecondsCards', JSON.stringify(gameState.userCards));
}

// Show a specific screen
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
    
    if (screenId === 'manage-cards-screen') {
        updateCardsList();
    }
    if (screenId === 'game-board-screen') {
        drawBoard();
        updateScoreboard();
        updateCurrentTurn();
    }
}

// Card Management
function addCard() {
    const words = [];
    for (let i = 1; i <= 5; i++) {
        const input = document.getElementById(`word${i}`);
        const word = input.value.trim();
        if (word) {
            words.push(word);
        }
    }
    
    if (words.length < 5) {
        alert('Please enter all 5 words for the card!');
        return;
    }
    
    gameState.userCards.push(words);
    saveCards();
    mergeCards();
    
    // Clear inputs
    for (let i = 1; i <= 5; i++) {
        document.getElementById(`word${i}`).value = '';
    }
    document.getElementById('word1').focus();
}

function updateCardsList() {
    const list = document.getElementById('cards-list');
    const count = document.getElementById('card-count');
    const baseCount = gameState.baseCards.length;
    const userCount = gameState.userCards.length;
    
    count.textContent = gameState.cards.length;
    
    if (gameState.cards.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: #aaa;">No cards yet. Add some cards above!</p>';
        return;
    }
    
    let html = '';
    
    // Show base cards section if any
    if (baseCount > 0) {
        html += '<div class="cards-section"><h4 style="color: #2ed573; margin: 10px 0;">📁 Cards from File (' + baseCount + ')</h4>';
        html += gameState.baseCards.map((card, index) => `
            <div class="card-item base-card">
                <div class="card-words">
                    ${card.map(word => `<span>${escapeHtml(word)}</span>`).join('')}
                </div>
                <span class="card-badge">CSV</span>
            </div>
        `).join('');
        html += '</div>';
    }
    
    // Show user cards section if any
    if (userCount > 0) {
        html += '<div class="cards-section"><h4 style="color: #ffa502; margin: 10px 0;">✏️ Your Added Cards (' + userCount + ')</h4>';
        html += gameState.userCards.map((card, index) => `
            <div class="card-item user-card">
                <div class="card-words">
                    ${card.map(word => `<span>${escapeHtml(word)}</span>`).join('')}
                </div>
                <button class="delete-card" onclick="deleteCard(${index})">×</button>
            </div>
        `).join('');
        html += '</div>';
    }
    
    list.innerHTML = html;
}

function deleteCard(index) {
    gameState.userCards.splice(index, 1);
    saveCards();
    mergeCards();
}

function clearAllCards() {
    if (confirm('Are you sure you want to delete all your added cards? (Cards from file will remain)')) {
        gameState.userCards = [];
        saveCards();
        mergeCards();
        updateCardsList();
    }
}

// Player Management
function addPlayer(team) {
    const input = document.getElementById(`${team}-player-name`);
    const name = input.value.trim();
    
    if (!name) {
        alert('Please enter a player name!');
        return;
    }
    
    gameState.teams[team].players.push(name);
    input.value = '';
    updatePlayersList(team);
}

function removePlayer(team, index) {
    gameState.teams[team].players.splice(index, 1);
    updatePlayersList(team);
}

function updatePlayersList(team) {
    const container = document.getElementById(`team-${team}-players`);
    const players = gameState.teams[team].players;
    
    if (players.length === 0) {
        container.innerHTML = '<p style="color: #aaa; text-align: center;">No players yet</p>';
        return;
    }
    
    container.innerHTML = players.map((player, index) => `
        <div class="player-item">
            <span>${escapeHtml(player)}</span>
            <button class="remove-player" onclick="removePlayer('${team}', ${index})">×</button>
        </div>
    `).join('');
}

// Game Functions
function startGame() {
    if (gameState.cards.length < 5) {
        alert('Please add at least 5 cards before starting the game!');
        showScreen('manage-cards-screen');
        return;
    }
    
    if (gameState.teams.red.players.length === 0 || gameState.teams.blue.players.length === 0) {
        alert('Each team needs at least one player!');
        return;
    }
    
    gameState.winningScore = parseInt(document.getElementById('winning-score').value) || 30;
    gameState.teams.red.score = 0;
    gameState.teams.blue.score = 0;
    gameState.teams.red.currentPlayerIndex = 0;
    gameState.teams.blue.currentPlayerIndex = 0;
    gameState.currentTeam = 'red';
    gameState.usedCardIndices = [];
    
    showScreen('game-board-screen');
}

function drawBoard() {
    const canvas = document.getElementById('game-board');
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw track
    const steps = gameState.winningScore;
    const stepWidth = (width - 100) / steps;
    const trackY = height / 2;
    
    // Draw track background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(50, trackY - 30, width - 100, 60);
    
    // Draw step markers
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= steps; i++) {
        const x = 50 + (i * stepWidth);
        ctx.beginPath();
        ctx.moveTo(x, trackY - 30);
        ctx.lineTo(x, trackY + 30);
        ctx.stroke();
        
        // Draw numbers at intervals
        if (i % 5 === 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(i.toString(), x, trackY + 50);
        }
    }
    
    // Draw finish line
    ctx.strokeStyle = '#2ed573';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(50 + (steps * stepWidth), trackY - 40);
    ctx.lineTo(50 + (steps * stepWidth), trackY + 40);
    ctx.stroke();
    
    // Draw team markers
    const redScore = Math.min(gameState.teams.red.score, steps);
    const blueScore = Math.min(gameState.teams.blue.score, steps);
    
    // Red team marker (above track)
    const redX = 50 + (redScore * stepWidth);
    ctx.fillStyle = '#e94560';
    ctx.beginPath();
    ctx.arc(redX, trackY - 45, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('R', redX, trackY - 45);
    
    // Blue team marker (below track)
    const blueX = 50 + (blueScore * stepWidth);
    ctx.fillStyle = '#457be9';
    ctx.beginPath();
    ctx.arc(blueX, trackY + 45, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.fillText('B', blueX, trackY + 45);
    
    // Draw START label
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('START', 50, trackY - 70);
    
    // Draw FINISH label
    ctx.fillStyle = '#2ed573';
    ctx.fillText('FINISH', 50 + (steps * stepWidth), trackY - 70);
}

function updateScoreboard() {
    document.getElementById('red-score').textContent = gameState.teams.red.score;
    document.getElementById('blue-score').textContent = gameState.teams.blue.score;
}

function updateCurrentTurn() {
    const team = gameState.teams[gameState.currentTeam];
    const teamName = gameState.currentTeam === 'red' ? '🔴 Team Red' : '🔵 Team Blue';
    const playerName = team.players[team.currentPlayerIndex];
    
    document.getElementById('current-team-name').textContent = teamName;
    document.getElementById('current-player-name').textContent = playerName;
}

function getRandomCard() {
    // If all cards used, reset
    if (gameState.usedCardIndices.length >= gameState.cards.length) {
        gameState.usedCardIndices = [];
    }
    
    let availableIndices = [];
    for (let i = 0; i < gameState.cards.length; i++) {
        if (!gameState.usedCardIndices.includes(i)) {
            availableIndices.push(i);
        }
    }
    
    const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    gameState.usedCardIndices.push(randomIndex);
    return gameState.cards[randomIndex];
}

function startRound() {
    gameState.currentCard = getRandomCard();
    gameState.roundWords = [...gameState.currentCard];
    
    // Display words
    const wordsContainer = document.getElementById('words-to-describe');
    wordsContainer.innerHTML = gameState.roundWords.map(word => 
        `<div class="word-item">${escapeHtml(word)}</div>`
    ).join('');
    
    showScreen('round-screen');
    startTimer();
}

let timerInterval;
function startTimer() {
    let timeLeft = 30;
    const timerElement = document.getElementById('timer');
    timerElement.textContent = timeLeft;
    
    timerInterval = setInterval(() => {
        timeLeft--;
        timerElement.textContent = timeLeft;
        
        if (timeLeft <= 10) {
            timerElement.style.color = '#ff4757';
        } else {
            timerElement.style.color = '#e94560';
        }
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            endRound();
        }
    }, 1000);
}

function endRound() {
    // Show scoring screen
    const scoringContainer = document.getElementById('scoring-words');
    scoringContainer.innerHTML = gameState.roundWords.map((word, index) => 
        `<div class="scoring-word" data-index="${index}" onclick="toggleWord(this)">${escapeHtml(word)}</div>`
    ).join('');
    
    document.getElementById('words-correct').textContent = '0';
    showScreen('scoring-screen');
}

function toggleWord(element) {
    element.classList.toggle('correct');
    const correctCount = document.querySelectorAll('.scoring-word.correct').length;
    document.getElementById('words-correct').textContent = correctCount;
}

function submitScore() {
    const correctCount = document.querySelectorAll('.scoring-word.correct').length;
    
    // Add score to current team
    gameState.teams[gameState.currentTeam].score += correctCount;
    
    // Check for winner
    if (gameState.teams[gameState.currentTeam].score >= gameState.winningScore) {
        showWinner();
        return;
    }
    
    // Move to next player in current team
    const team = gameState.teams[gameState.currentTeam];
    team.currentPlayerIndex = (team.currentPlayerIndex + 1) % team.players.length;
    
    // Switch teams
    gameState.currentTeam = gameState.currentTeam === 'red' ? 'blue' : 'red';
    
    // Go back to game board
    showScreen('game-board-screen');
}

function showWinner() {
    const winner = gameState.currentTeam === 'red' ? '🔴 Team Red' : '🔵 Team Blue';
    document.getElementById('winner-announcement').textContent = `${winner} Wins!`;
    document.getElementById('final-red-score').textContent = gameState.teams.red.score;
    document.getElementById('final-blue-score').textContent = gameState.teams.blue.score;
    showScreen('winner-screen');
}

function resetGame() {
    gameState.teams.red.players = [];
    gameState.teams.blue.players = [];
    gameState.teams.red.score = 0;
    gameState.teams.blue.score = 0;
    gameState.currentTeam = 'red';
    gameState.usedCardIndices = [];
    
    updatePlayersList('red');
    updatePlayersList('blue');
    
    showScreen('home-screen');
}

// Utility function to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Handle Enter key in inputs
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const target = e.target;
        if (target.id && target.id.startsWith('word')) {
            const wordNum = parseInt(target.id.replace('word', ''));
            if (wordNum < 5) {
                document.getElementById(`word${wordNum + 1}`).focus();
            } else {
                addCard();
            }
        } else if (target.id === 'red-player-name') {
            addPlayer('red');
        } else if (target.id === 'blue-player-name') {
            addPlayer('blue');
        }
    }
});

// Initialize on load
window.onload = function() {
    loadCards();
    updatePlayersList('red');
    updatePlayersList('blue');
};
