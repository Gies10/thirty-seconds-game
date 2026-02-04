// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBNW0VrWPUoluOAbQDj7lY29M9z6QghePM",
    authDomain: "thirty-seconds-game-d6677.firebaseapp.com",
    databaseURL: "https://thirty-seconds-game-d6677-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "thirty-seconds-game-d6677",
    storageBucket: "thirty-seconds-game-d6677.firebasestorage.app",
    messagingSenderId: "636172598811",
    appId: "1:636172598811:web:686d62ba0b9bca7ad542be",
    measurementId: "G-M2B7F388G5"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Local State
let localState = {
    roomCode: null,
    playerId: null,
    playerName: null,
    isHost: false,
    cards: [],
    baseCards: [],
    userCards: []
};

// Generate a random room code
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Generate a unique player ID
function generatePlayerId() {
    return 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Load cards from CSV
function loadCardsFromCSV() {
    return fetch('cards.csv')
        .then(response => {
            if (!response.ok) return [];
            return response.text();
        })
        .then(csvText => {
            if (!csvText) return [];
            return parseCSV(csvText);
        })
        .catch(() => []);
}

function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const cards = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
            const words = parseCSVLine(line);
            if (words.length >= 5) {
                cards.push(words.slice(0, 5));
            }
        }
    }
    return cards;
}

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

// Show a specific screen
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// ==================== HOST FUNCTIONS ====================

async function createRoom() {
    const playerName = document.getElementById('host-name').value.trim();
    if (!playerName) {
        alert('Please enter your name!');
        return;
    }

    // Load cards first
    localState.baseCards = await loadCardsFromCSV();
    if (localState.baseCards.length < 5) {
        alert('Not enough cards loaded! Make sure cards.csv is available.');
        return;
    }

    localState.roomCode = generateRoomCode();
    localState.playerId = generatePlayerId();
    localState.playerName = playerName;
    localState.isHost = true;

    // Create room in Firebase
    const roomRef = database.ref('rooms/' + localState.roomCode);
    
    await roomRef.set({
        host: localState.playerId,
        status: 'lobby', // lobby, playing, round, scoring, finished
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        settings: {
            winningScore: 30
        },
        teams: {
            red: { score: 0, players: {} },
            blue: { score: 0, players: {} }
        },
        currentRound: {
            team: 'red',
            explainerId: null,
            words: [],
            timerEnd: null,
            correctWords: []
        },
        cards: {
            used: [],
            total: localState.baseCards.length
        }
    });

    // Add host as a player (unassigned)
    await database.ref(`rooms/${localState.roomCode}/players/${localState.playerId}`).set({
        name: playerName,
        isHost: true,
        team: null,
        joinedAt: firebase.database.ServerValue.TIMESTAMP
    });

    // Listen for room changes
    setupRoomListener();

    document.getElementById('room-code-display').textContent = localState.roomCode;
    showScreen('lobby-screen');
}

async function joinRoom() {
    const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();
    const playerName = document.getElementById('player-name').value.trim();

    if (!roomCode || !playerName) {
        alert('Please enter both room code and your name!');
        return;
    }

    // Check if room exists
    const roomSnapshot = await database.ref('rooms/' + roomCode).once('value');
    if (!roomSnapshot.exists()) {
        alert('Room not found! Check the code and try again.');
        return;
    }

    const roomData = roomSnapshot.val();
    if (roomData.status !== 'lobby') {
        alert('This game has already started!');
        return;
    }

    localState.roomCode = roomCode;
    localState.playerId = generatePlayerId();
    localState.playerName = playerName;
    localState.isHost = false;
    localState.baseCards = await loadCardsFromCSV();

    // Add player to room
    await database.ref(`rooms/${roomCode}/players/${localState.playerId}`).set({
        name: playerName,
        isHost: false,
        team: null,
        joinedAt: firebase.database.ServerValue.TIMESTAMP
    });

    // Listen for room changes
    setupRoomListener();

    document.getElementById('room-code-display').textContent = roomCode;
    showScreen('lobby-screen');
}

function setupRoomListener() {
    const roomRef = database.ref('rooms/' + localState.roomCode);
    
    roomRef.on('value', (snapshot) => {
        if (!snapshot.exists()) {
            alert('Room was closed!');
            showScreen('home-screen');
            return;
        }

        const room = snapshot.val();
        updateLobbyUI(room);
        handleGameState(room);
    });

    // Clean up on disconnect
    database.ref(`rooms/${localState.roomCode}/players/${localState.playerId}`)
        .onDisconnect().remove();
}

function updateLobbyUI(room) {
    const players = room.players || {};
    const teams = room.teams || { red: { players: {} }, blue: { players: {} } };

    // Update unassigned players
    const unassignedContainer = document.getElementById('unassigned-players');
    let unassignedHtml = '';
    
    Object.entries(players).forEach(([id, player]) => {
        if (!player.team) {
            unassignedHtml += `
                <div class="player-lobby-item">
                    <span>${escapeHtml(player.name)} ${player.isHost ? '👑' : ''}</span>
                    ${localState.isHost ? `
                        <div class="team-assign-buttons">
                            <button onclick="assignToTeam('${id}', 'red')" class="btn-small red">→ Red</button>
                            <button onclick="assignToTeam('${id}', 'blue')" class="btn-small blue">→ Blue</button>
                        </div>
                    ` : ''}
                </div>
            `;
        }
    });
    unassignedContainer.innerHTML = unassignedHtml || '<p class="muted">No unassigned players</p>';

    // Update team lists
    updateTeamList('red', players);
    updateTeamList('blue', players);

    // Show/hide host controls
    document.getElementById('host-controls').style.display = localState.isHost ? 'block' : 'none';
    document.getElementById('waiting-message').style.display = localState.isHost ? 'none' : 'block';

    // Update winning score display
    if (room.settings) {
        document.getElementById('winning-score-lobby').value = room.settings.winningScore || 30;
    }
}

function updateTeamList(team, players) {
    const container = document.getElementById(`lobby-team-${team}`);
    let html = '';
    
    Object.entries(players).forEach(([id, player]) => {
        if (player.team === team) {
            html += `
                <div class="player-lobby-item">
                    <span>${escapeHtml(player.name)} ${player.isHost ? '👑' : ''}</span>
                    ${localState.isHost ? `
                        <button onclick="removeFromTeam('${id}')" class="btn-small">✕</button>
                    ` : ''}
                </div>
            `;
        }
    });
    
    container.innerHTML = html || '<p class="muted">No players</p>';
}

async function assignToTeam(playerId, team) {
    await database.ref(`rooms/${localState.roomCode}/players/${playerId}/team`).set(team);
}

async function removeFromTeam(playerId) {
    await database.ref(`rooms/${localState.roomCode}/players/${playerId}/team`).set(null);
}

async function updateWinningScore() {
    const score = parseInt(document.getElementById('winning-score-lobby').value) || 30;
    await database.ref(`rooms/${localState.roomCode}/settings/winningScore`).set(score);
}

async function startMultiplayerGame() {
    const roomSnapshot = await database.ref('rooms/' + localState.roomCode).once('value');
    const room = roomSnapshot.val();
    const players = room.players || {};

    // Check teams have players
    const redPlayers = Object.entries(players).filter(([_, p]) => p.team === 'red');
    const bluePlayers = Object.entries(players).filter(([_, p]) => p.team === 'blue');

    if (redPlayers.length === 0 || bluePlayers.length === 0) {
        alert('Each team needs at least one player!');
        return;
    }

    // Set first explainer
    const firstExplainer = redPlayers[0][0];

    await database.ref(`rooms/${localState.roomCode}`).update({
        status: 'playing',
        currentRound: {
            team: 'red',
            explainerId: firstExplainer,
            words: [],
            timerEnd: null,
            correctWords: [],
            playerIndex: { red: 0, blue: 0 }
        }
    });
}

function handleGameState(room) {
    const status = room.status;

    if (status === 'lobby') {
        // Already in lobby
    } else if (status === 'playing') {
        showPlayingScreen(room);
    } else if (status === 'round') {
        showRoundScreen(room);
    } else if (status === 'scoring') {
        showScoringScreen(room);
    } else if (status === 'finished') {
        showWinnerScreen(room);
    }
}

function showPlayingScreen(room) {
    const currentRound = room.currentRound;
    const players = room.players || {};
    const explainer = players[currentRound.explainerId];
    const teamName = currentRound.team === 'red' ? '🔴 Team Red' : '🔵 Team Blue';

    document.getElementById('mp-red-score').textContent = room.teams.red.score || 0;
    document.getElementById('mp-blue-score').textContent = room.teams.blue.score || 0;
    document.getElementById('mp-current-team').textContent = teamName;
    document.getElementById('mp-current-explainer').textContent = explainer ? explainer.name : 'Unknown';

    const isExplainer = currentRound.explainerId === localState.playerId;
    document.getElementById('start-round-mp-btn').style.display = isExplainer ? 'block' : 'none';
    document.getElementById('waiting-for-explainer').style.display = isExplainer ? 'none' : 'block';
    document.getElementById('waiting-for-explainer').innerHTML = `
        <p>⏳ Waiting for <strong>${explainer ? explainer.name : 'explainer'}</strong> to start the round...</p>
    `;

    showScreen('mp-game-screen');
}

async function startRoundMultiplayer() {
    // Get a random card
    const roomSnapshot = await database.ref('rooms/' + localState.roomCode).once('value');
    const room = roomSnapshot.val();
    const usedIndices = room.cards?.used || [];
    
    let availableIndices = [];
    for (let i = 0; i < localState.baseCards.length; i++) {
        if (!usedIndices.includes(i)) {
            availableIndices.push(i);
        }
    }
    
    if (availableIndices.length === 0) {
        // Reset used cards
        availableIndices = Array.from({ length: localState.baseCards.length }, (_, i) => i);
        await database.ref(`rooms/${localState.roomCode}/cards/used`).set([]);
    }

    const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    const words = localState.baseCards[randomIndex];

    // Update Firebase with round data
    const timerEnd = Date.now() + 32000; // 30 seconds + 2 second buffer

    await database.ref(`rooms/${localState.roomCode}`).update({
        status: 'round',
        'currentRound/words': words,
        'currentRound/timerEnd': timerEnd,
        'currentRound/correctWords': []
    });

    // Add used card index
    await database.ref(`rooms/${localState.roomCode}/cards/used`).push(randomIndex);
}

let countdownInterval;

function showRoundScreen(room) {
    const currentRound = room.currentRound;
    const isExplainer = currentRound.explainerId === localState.playerId;
    const players = room.players || {};
    const explainer = players[currentRound.explainerId];

    // Clear any existing interval
    if (countdownInterval) clearInterval(countdownInterval);

    if (isExplainer) {
        // Show words to explainer
        document.getElementById('mp-words-container').innerHTML = `
            <h3>Your Words:</h3>
            <div class="words-list">
                ${currentRound.words.map(word => `<div class="word-item">${escapeHtml(word)}</div>`).join('')}
            </div>
            <p class="describer-note">Describe these words to your team! No saying the word or parts of it!</p>
        `;
    } else {
        // Show waiting screen to others
        const isTeammate = players[localState.playerId]?.team === currentRound.team;
        document.getElementById('mp-words-container').innerHTML = `
            <div class="waiting-card">
                <h3>${isTeammate ? '🎯 Your team is guessing!' : '👀 Watch the other team!'}</h3>
                <p><strong>${explainer?.name || 'Explainer'}</strong> is describing words to ${currentRound.team === 'red' ? 'Team Red' : 'Team Blue'}</p>
                ${isTeammate ? '<p class="guess-prompt">Listen and guess the words!</p>' : ''}
            </div>
        `;
    }

    // Start countdown
    const timerElement = document.getElementById('mp-timer');
    
    function updateTimer() {
        const remaining = Math.max(0, Math.ceil((currentRound.timerEnd - Date.now()) / 1000));
        timerElement.textContent = remaining;
        timerElement.style.color = remaining <= 10 ? '#ff4757' : '#e94560';

        if (remaining <= 0) {
            clearInterval(countdownInterval);
            if (isExplainer) {
                endRoundMultiplayer();
            }
        }
    }

    updateTimer();
    countdownInterval = setInterval(updateTimer, 100);

    showScreen('mp-round-screen');
}

async function endRoundMultiplayer() {
    await database.ref(`rooms/${localState.roomCode}/status`).set('scoring');
}

function showScoringScreen(room) {
    const currentRound = room.currentRound;
    const isExplainer = currentRound.explainerId === localState.playerId;
    const players = room.players || {};
    const explainer = players[currentRound.explainerId];

    if (isExplainer) {
        // Explainer marks correct words
        const scoringContainer = document.getElementById('mp-scoring-words');
        scoringContainer.innerHTML = currentRound.words.map((word, index) => `
            <div class="scoring-word" data-index="${index}" onclick="toggleWordMP(this, ${index})">${escapeHtml(word)}</div>
        `).join('');

        document.getElementById('mp-scoring-controls').style.display = 'block';
        document.getElementById('mp-scoring-waiting').style.display = 'none';
    } else {
        // Others wait
        document.getElementById('mp-scoring-words').innerHTML = `
            <p>⏳ Waiting for <strong>${explainer?.name || 'explainer'}</strong> to mark correct answers...</p>
        `;
        document.getElementById('mp-scoring-controls').style.display = 'none';
        document.getElementById('mp-scoring-waiting').style.display = 'block';
    }

    document.getElementById('mp-words-correct').textContent = '0';
    showScreen('mp-scoring-screen');
}

function toggleWordMP(element, index) {
    element.classList.toggle('correct');
    const correctCount = document.querySelectorAll('#mp-scoring-words .scoring-word.correct').length;
    document.getElementById('mp-words-correct').textContent = correctCount;
}

async function submitScoreMultiplayer() {
    const correctWords = [];
    document.querySelectorAll('#mp-scoring-words .scoring-word.correct').forEach((el) => {
        correctWords.push(parseInt(el.dataset.index));
    });

    const roomSnapshot = await database.ref('rooms/' + localState.roomCode).once('value');
    const room = roomSnapshot.val();
    const currentTeam = room.currentRound.team;
    const players = room.players || {};
    const settings = room.settings || { winningScore: 30 };

    // Update score
    const newScore = (room.teams[currentTeam].score || 0) + correctWords.length;
    await database.ref(`rooms/${localState.roomCode}/teams/${currentTeam}/score`).set(newScore);

    // Check for winner
    if (newScore >= settings.winningScore) {
        await database.ref(`rooms/${localState.roomCode}/status`).set('finished');
        return;
    }

    // Switch teams and get next explainer
    const nextTeam = currentTeam === 'red' ? 'blue' : 'red';
    const playerIndices = room.currentRound.playerIndex || { red: 0, blue: 0 };
    
    // Increment the CURRENT team's index (they just finished their turn)
    const updatedCurrentTeamIndex = (playerIndices[currentTeam] + 1);
    
    // Get players in next team
    const teamPlayers = Object.entries(players)
        .filter(([_, p]) => p.team === nextTeam)
        .map(([id, _]) => id);

    if (teamPlayers.length === 0) {
        alert('No players in next team!');
        return;
    }

    // Use the next team's current index (they haven't gone yet this cycle)
    const nextPlayerIndex = playerIndices[nextTeam] % teamPlayers.length;
    const nextExplainerId = teamPlayers[nextPlayerIndex];

    await database.ref(`rooms/${localState.roomCode}`).update({
        status: 'playing',
        currentRound: {
            team: nextTeam,
            explainerId: nextExplainerId,
            words: [],
            timerEnd: null,
            correctWords: [],
            playerIndex: {
                red: currentTeam === 'red' ? updatedCurrentTeamIndex : playerIndices.red,
                blue: currentTeam === 'blue' ? updatedCurrentTeamIndex : playerIndices.blue
            }
        }
    });
}

function showWinnerScreen(room) {
    const redScore = room.teams.red.score || 0;
    const blueScore = room.teams.blue.score || 0;
    const winner = redScore >= (room.settings?.winningScore || 30) ? 'red' : 'blue';

    document.getElementById('mp-winner-announcement').textContent = 
        winner === 'red' ? '🔴 Team Red Wins!' : '🔵 Team Blue Wins!';
    document.getElementById('mp-final-red-score').textContent = redScore;
    document.getElementById('mp-final-blue-score').textContent = blueScore;

    // Show play again only to host
    document.getElementById('mp-play-again-btn').style.display = localState.isHost ? 'block' : 'none';

    showScreen('mp-winner-screen');
}

async function playAgainMultiplayer() {
    const roomSnapshot = await database.ref('rooms/' + localState.roomCode).once('value');
    const room = roomSnapshot.val();
    const players = room.players || {};

    const redPlayers = Object.entries(players)
        .filter(([_, p]) => p.team === 'red')
        .map(([id, _]) => id);

    await database.ref(`rooms/${localState.roomCode}`).update({
        status: 'lobby',
        'teams/red/score': 0,
        'teams/blue/score': 0,
        currentRound: {
            team: 'red',
            explainerId: redPlayers[0] || null,
            words: [],
            timerEnd: null,
            correctWords: [],
            playerIndex: { red: 0, blue: 0 }
        },
        'cards/used': []
    });
}

async function leaveRoom() {
    if (localState.roomCode && localState.playerId) {
        await database.ref(`rooms/${localState.roomCode}/players/${localState.playerId}`).remove();
        
        // If host leaves, close the room
        if (localState.isHost) {
            await database.ref(`rooms/${localState.roomCode}`).remove();
        }
    }

    localState.roomCode = null;
    localState.playerId = null;
    localState.isHost = false;

    showScreen('home-screen');
}

// Utility function
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize on load
window.onload = function() {
    loadCardsFromCSV().then(cards => {
        localState.baseCards = cards;
        console.log(`Loaded ${cards.length} cards from CSV`);
    });
};
