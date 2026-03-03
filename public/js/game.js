const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Constants
const WIDTH = 1200;
const HEIGHT = 800;
const FRICTION = 0.99;
const PLAYER_SPEED = 10;
const BALL_MAX_SPEED = 22;
const GOAL_WIDTH = 30;
const GOAL_HEIGHT = 240;
const GOAL_Y = (HEIGHT - GOAL_HEIGHT) / 2;

// UI Elements
const lobbyOverlay = document.getElementById('lobby-overlay');
const gameContainer = document.getElementById('game-container');
const openComputerModalBtn = document.getElementById('openComputerModal');
const openOnlineModalBtn = document.getElementById('openOnlineModal');
const computerModal = document.getElementById('computerModal');
const onlineModal = document.getElementById('onlineModal');
const cancelSearchBtn = document.getElementById('cancelSearchBtn');
const searchingText = document.getElementById('searching-text');
const score1El = document.getElementById('score1');
const score2El = document.getElementById('score2');
const goalTextEl = document.getElementById('goalText');

// Modal Elements (v16)
const startComputerBtn = document.getElementById('startComputerBtn');
const startOnlineBtn = document.getElementById('startOnlineBtn');
const compWinLimitSelect = document.getElementById('compWinLimit');
const onlineWinLimitSelect = document.getElementById('onlineWinLimit');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomInput = document.getElementById('joinRoomInput');
const displayRoomCode = document.getElementById('displayRoomCode');
const roomCodeArea = document.getElementById('roomCodeArea');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownText = document.getElementById('countdown-text');

// Game State
let role = null; // 'p1' or 'p2'
let roomId = null;
let status = 'waiting';
let gameMode = 'online'; // 'online' or 'computer'
let onlineType = 'random'; // 'random' or 'private'
let isVertical = false;
let isPaused = false;
let keys = {};
let targetTouchPos = null;
let ball = { x: WIDTH / 2, y: HEIGHT / 2, radius: 18, dx: 0, dy: 0, owner: null };
let visualBall = { x: WIDTH / 2, y: HEIGHT / 2 }; // V19: Smooth rendering ball
let p1 = { x: 240, y: 400, radius: 35, color: '#3b82f6', score: 0 };
let p2 = { x: 960, y: 400, radius: 35, color: '#ef4444', score: 0 };

// Network Sync State (v20: Interpolation & Buffering)
let lastEmitTime = 0;
let lastBallEmitTime = 0;
let p1Buffer = [];
let p2Buffer = [];
let ballBuffer = [];
const INTERPOLATION_DELAY = 120; // V26: Slightly increased to 120ms for better layout stability

// Global Settings (v16)
let currentAiDifficulty = 'easy';
let currentWinLimit = 5;
let currentP1Color = '#3b82f6';
let currentP2Color = '#ef4444';

// Initialize
function init() {
    setupInput();
    setupTouch();
    setupModals();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', resizeCanvas);
    resizeCanvas();
}

function updateScorecardColors() {
    const p1Card = document.getElementById('p1-card');
    const p2Card = document.getElementById('p2-card');
    if (p1Card) p1Card.style.setProperty('--card-bg', currentP1Color + '44'); // Add transparency
    if (p2Card) p2Card.style.setProperty('--card-bg', currentP2Color + '44');
    // Also update player objects for rendering
    p1.color = currentP1Color;
    p2.color = currentP2Color;
}

function setupModals() {
    // Open Modals
    openComputerModalBtn.addEventListener('click', () => computerModal.classList.remove('hidden'));
    openOnlineModalBtn.addEventListener('click', () => onlineModal.classList.remove('hidden'));

    // Close Modals
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            computerModal.classList.add('hidden');
            onlineModal.classList.add('hidden');
        });
    });

    // Tab Switching (Online Modal)
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            onlineType = mode;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.getElementById('online-random-content').classList.toggle('hidden', mode !== 'random');
            document.getElementById('online-private-content').classList.toggle('hidden', mode !== 'private');
        });
    });

    // Color Pickers
    setupColorPicker('compColorPicker', (color) => { currentP1Color = color; updateScorecardColors(); });
    setupColorPicker('onlineColorPicker', (color) => { currentP1Color = color; updateScorecardColors(); });

    function setupColorPicker(id, callback) {
        const picker = document.getElementById(id);
        const swatches = picker.querySelectorAll('.swatch');
        swatches.forEach(swatch => {
            swatch.addEventListener('click', () => {
                swatches.forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
                callback(swatch.dataset.color);
            });
        });
    }

    // Create Private Room
    createRoomBtn.addEventListener('click', () => {
        const limit = parseInt(onlineWinLimitSelect.value);
        socket.emit('createPrivateRoom', { color: currentP1Color, winLimit: limit });
    });

    socket.on('privateRoomCreated', (data) => {
        displayRoomCode.innerText = data.roomId;
        roomCodeArea.classList.remove('hidden');
        createRoomBtn.classList.add('hidden');
    });

    document.getElementById('copyCodeBtn').addEventListener('click', () => {
        navigator.clipboard.writeText(displayRoomCode.innerText);
        alert('Room code copied!');
    });
}

function setupInput() {
    window.addEventListener('keydown', e => keys[e.code] = true);
    window.addEventListener('keyup', e => keys[e.code] = false);

    startComputerBtn.addEventListener('click', () => {
        gameMode = 'computer';
        role = 'p1';
        status = 'waiting';
        currentAiDifficulty = 'easy';
        currentWinLimit = parseInt(compWinLimitSelect.value);

        p1.score = 0; p2.score = 0;
        score1El.innerText = "0"; score2El.innerText = "0";
        currentP2Color = '#ef4444'; // AI Default
        updateScorecardColors();

        computerModal.classList.add('hidden');
        lobbyOverlay.classList.add('hidden');
        gameContainer.classList.remove('hidden');

        resizeCanvas();
        resetMatchLocal();
        draw(); // Draw behind the countdown

        // Start 5 second countdown
        countdownOverlay.classList.remove('hidden');
        countdownText.innerText = "5";

        let counter = 5;
        const countdownInterval = setInterval(() => {
            counter--;
            if (counter > 0) {
                countdownText.innerText = counter;
            } else {
                clearInterval(countdownInterval);
                countdownOverlay.classList.add('hidden');

                resizeCanvas();
                resetMatchLocal();
                status = 'playing';
                requestAnimationFrame(loop);
            }
        }, 1000);
    });

    startOnlineBtn.addEventListener('click', () => {
        gameMode = 'online';
        onlineModal.classList.add('hidden');
        lobbyOverlay.classList.remove('hidden'); // Show searching state
        searchingText.classList.remove('hidden');
        document.querySelector('.mode-selection').classList.add('hidden');

        if (onlineType === 'random') {
            socket.emit('findMatch', { color: currentP1Color });
        } else {
            const code = joinRoomInput.value.trim().toUpperCase();
            if (code) {
                socket.emit('joinPrivateRoom', { roomId: code, color: currentP1Color });
            } else {
                // If they created but didn't join... just wait for opponent? 
                // Actually they already join on create. So this just handles "Join" case.
                if (displayRoomCode.innerText === "----") {
                    alert("Please enter a room code or create one.");
                    location.reload();
                }
            }
        }
    });

    cancelSearchBtn.addEventListener('click', () => {
        location.reload();
    });
}

function setupTouch() {
    canvas.addEventListener('touchstart', (e) => {
        if (status !== 'playing' || isPaused) return;
        handleDirectTouch(e.changedTouches[0]);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        if (status !== 'playing' || isPaused) return;
        e.preventDefault();
        handleDirectTouch(e.changedTouches[0]);
    }, { passive: false });

    window.addEventListener('touchend', () => {
        targetTouchPos = null;
    });

    function handleDirectTouch(touch) {
        const rect = canvas.getBoundingClientRect();
        const touchX = touch.clientX - rect.left;
        const touchY = touch.clientY - rect.top;

        // Map touch back to internal coordinates (1200x800)
        if (isVertical) {
            let internalX, internalY;
            if (role === 'p1') {
                internalY = (touchX / rect.width) * HEIGHT;
                internalX = (1 - (touchY / rect.height)) * WIDTH;
            } else {
                internalY = (1 - (touchX / rect.width)) * HEIGHT;
                internalX = (touchY / rect.height) * WIDTH;
            }
            targetTouchPos = { x: internalX, y: internalY };
        } else {
            const internalX = (touchX / rect.width) * WIDTH;
            const internalY = (touchY / rect.height) * HEIGHT;
            targetTouchPos = { x: internalX, y: internalY };
        }
    }
}

function resizeCanvas() {
    isVertical = window.innerHeight > window.innerWidth;
    // Set internal resolution to match display size exactly.
    // This removes all browser-level stretching distortion.
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
}

// Socket Events
socket.on('matchFound', (data) => {
    roomId = data.roomId;
    role = data.role;
    currentWinLimit = data.winLimit;

    // Sync colors from server state
    currentP1Color = data.state.p1.color;
    currentP2Color = data.state.p2.color;
    updateScorecardColors();

    syncState(data.state);
});

socket.on('matchError', (data) => {
    alert(data.message);
    location.reload();
});

socket.on('gameStart', (state) => {
    if (gameMode !== 'online') return;
    status = 'playing';
    syncState(state);
    lobbyOverlay.classList.add('hidden');
    gameContainer.classList.remove('hidden');

    // CRITICAL: Force resize after showing container to fix rendering bug
    resizeCanvas();
    setTimeout(resizeCanvas, 50);
    setTimeout(resizeCanvas, 150); // Extra safety for slow mobile engines

    requestAnimationFrame(loop);
});

socket.on('stateUpdate', (state) => {
    if (gameMode !== 'online') return;
    syncState(state);
});

socket.on('scoreSync', (data) => {
    if (gameMode !== 'online') return;

    // Only update DOM if scores actually changed (v26)
    if (p1.score !== data.score1) {
        p1.score = data.score1;
        score1El.innerText = p1.score;
        score1El.style.transform = "scale(1.2)";
        setTimeout(() => score1El.style.transform = "scale(1)", 200);
    }
    if (p2.score !== data.score2) {
        p2.score = data.score2;
        score2El.innerText = p2.score;
        score2El.style.transform = "scale(1.2)";
        setTimeout(() => score2El.style.transform = "scale(1)", 200);
    }

    resetMatchLocal(); // FORCE RESET POSITIONS LOCALLY
    showGoal();
});

socket.on('gameOver', (data) => {
    status = 'finished';
    document.getElementById('game-over-overlay').classList.remove('hidden');
    document.getElementById('winner-text').innerText = `${data.winner} Wins!`;
});

socket.on('opponentDisconnected', () => {
    if (gameMode !== 'online') return;
    alert("Opponent disconnected. Match ended.");
    location.reload();
});

function syncState(state) {
    const now = Date.now();

    // Store states in buffers with server timestamp
    if (state.p1) p1Buffer.push({ x: state.p1.x, y: state.p1.y, ts: state.ts });
    if (state.p2) p2Buffer.push({ x: state.p2.x, y: state.p2.y, ts: state.ts });
    if (state.ball) ballBuffer.push({ x: state.ball.x, y: state.ball.y, dx: state.ball.dx, dy: state.ball.dy, ts: state.ts });

    // Keep buffers lean (last 10 states)
    if (p1Buffer.length > 10) p1Buffer.shift();
    if (p2Buffer.length > 10) p2Buffer.shift();
    if (ballBuffer.length > 10) ballBuffer.shift();

    // Reconciliation for the LOCAL player
    let me = role === 'p1' ? p1 : p2;
    let myState = role === 'p1' ? state.p1 : state.p2;

    if (myState) {
        const dist = Math.hypot(me.x - myState.x, me.y - myState.y);
        // If deviates too much from server (> 120px), snap to server
        if (dist > 120) {
            me.x = myState.x;
            me.y = myState.y;
        } else if (dist > 15) {
            // Soft drift towards server state - REDUCED to 0.04 for less "stickiness"
            me.x += (myState.x - me.x) * 0.04;
            me.y += (myState.y - me.y) * 0.04;
        }
    }
}

function interpolate(buffer, delay) {
    const renderTime = Date.now() - delay;

    // Find two states to interpolate between
    for (let i = 0; i < buffer.length - 1; i++) {
        const s0 = buffer[i];
        const s1 = buffer[i + 1];

        if (renderTime >= s0.ts && renderTime <= s1.ts) {
            const t = (renderTime - s0.ts) / (s1.ts - s0.ts);
            return {
                x: s0.x + (s1.x - s0.x) * t,
                y: s0.y + (s1.y - s0.y) * t,
                dx: s0.dx + (s1.dx - s0.dx) * (s0.dx !== undefined ? t : 0), // handle velocity if present
                dy: s0.dy + (s1.dy - s0.dy) * (s0.dy !== undefined ? t : 0)
            };
        }
    }

    // Fallback: Latest state
    return buffer.length > 0 ? buffer[buffer.length - 1] : null;
}

function showGoal() {
    isPaused = true;

    // Haptic Feedback (v15)
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

    resetMatchLocal();
    goalTextEl.classList.add('show');
    setTimeout(() => {
        goalTextEl.classList.remove('show');
        resetMatchLocal(); // RE-SET FOR RESUME
        isPaused = false;
    }, 1500);
}

function update() {
    if (status !== 'playing' || isPaused) return;

    let me = role === 'p1' ? p1 : p2;
    let oldX = me.x;
    let oldY = me.y;

    // Movement logic for current player
    // keyboard
    if (keys['KeyW'] || keys['ArrowUp']) me.y -= PLAYER_SPEED;
    if (keys['KeyS'] || keys['ArrowDown']) me.y += PLAYER_SPEED;
    if (keys['KeyA'] || keys['ArrowLeft']) me.x -= PLAYER_SPEED;
    if (keys['KeyD'] || keys['ArrowRight']) me.x += PLAYER_SPEED;

    // smooth touch movement (v25 - SNAPPY)
    if (targetTouchPos) {
        const dx = targetTouchPos.x - me.x;
        const dy = targetTouchPos.y - me.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 1) {
            // Higher tracking speed for touch to keep up with finger (1.8x regular speed)
            const touchMaxSpeed = PLAYER_SPEED * 1.8;
            const speed = Math.min(touchMaxSpeed, dist * 0.7);
            me.x += (dx / dist) * speed;
            me.y += (dy / dist) * speed;
        }
    }

    // AI logic for computer player
    if (gameMode === 'computer') {
        const difficultyMultipliers = {
            'easy': { speed: 0.6, ease: 0.08, prediction: 2 },
            'pro': { speed: 0.9, ease: 0.12, prediction: 4 },
            'legend': { speed: 1.2, ease: 0.2, prediction: 7 }
        };
        const settings = difficultyMultipliers[currentAiDifficulty];
        const aiEase = settings.ease;

        // AI PATIENCE: Stay at goal line until ball starts moving
        const ballInPlay = Math.abs(ball.dx) > 0.1 || Math.abs(ball.dy) > 0.1;

        // CORNER CHECK: If AI is in the corner, escape!
        const isInCorner = (p2.x > WIDTH - 100 && (p2.y < 100 || p2.y > HEIGHT - 100));

        let targetY, targetX;

        if (!ballInPlay) {
            // Kickoff Position
            targetY = HEIGHT / 2;
            targetX = 960;
        } else if (isInCorner) {
            // Safety: Move back toward the center of the half
            targetY = HEIGHT / 2;
            targetX = WIDTH * 0.8;
        } else {
            // Standard tracking logic
            targetY = ball.y + ball.dy * settings.prediction;
            targetY = Math.max(p2.radius, Math.min(HEIGHT - p2.radius, targetY));

            if (ball.x > WIDTH * 0.45) {
                // Chases ball up to the halfway line
                targetX = Math.max(WIDTH * 0.55, ball.x - 40);
            } else {
                // Retreats to defend
                targetX = WIDTH * 0.88;
            }
        }

        p2.y += (targetY - p2.y) * aiEase;
        p2.x += (targetX - p2.x) * aiEase;
    }

    // boundaries
    if (role === 'p1' || gameMode === 'computer') {
        p1.x = Math.max(p1.radius, Math.min(WIDTH / 2 - p1.radius, p1.x));
        p1.y = Math.max(p1.radius, Math.min(HEIGHT - p1.radius, p1.y));
    }
    if (role === 'p2' || gameMode === 'computer') {
        p2.x = Math.max(WIDTH / 2 + p2.radius, Math.min(WIDTH - p2.radius, p2.x));
        p2.y = Math.max(p2.radius, Math.min(HEIGHT - p2.radius, p2.y));
    }

    // Apply Interpolation/Lerping for network entities
    if (gameMode === 'online') {
        let opponent = role === 'p1' ? p2 : p1;
        let oppBuffer = role === 'p1' ? p2Buffer : p1Buffer;

        const oppInterp = interpolate(oppBuffer, INTERPOLATION_DELAY);
        if (oppInterp) {
            opponent.x = oppInterp.x;
            opponent.y = oppInterp.y;
        }

        // Interpolate Ball Physics state (optional, or just for visual)
        const ballInterp = interpolate(ballBuffer, INTERPOLATION_DELAY);
        if (ballInterp) {
            // We still keep the local physics ball for "feeling", but reconcile
            const dist = Math.hypot(ball.x - ballInterp.x, ball.y - ballInterp.y);
            if (dist > 80) {
                ball.x = ballInterp.x;
                ball.y = ballInterp.y;
            } else {
                ball.x += (ballInterp.x - ball.x) * 0.2;
                ball.y += (ballInterp.y - ball.y) * 0.2;
            }
            ball.dx = ballInterp.dx;
            ball.dy = ballInterp.dy;
        }
    }

    if (gameMode === 'online' && (me.x !== oldX || me.y !== oldY)) {
        const now = Date.now();
        // Match client emission to server tick (16ms/60Hz)
        if (now - lastEmitTime > 16) {
            socket.emit('playerUpdate', { x: Math.round(me.x), y: Math.round(me.y) });
            lastEmitTime = now;
        }
    }

    // collision logic
    // Ball movement
    ball.x += ball.dx;
    ball.y += ball.dy;
    ball.dx *= FRICTION;
    ball.dy *= FRICTION;

    // Collisions
    const minPlayerDist = ball.radius + p1.radius;
    [p1, p2].forEach(p => {
        const dx = ball.x - p.x;
        const dy = ball.y - p.y;
        const dist = Math.hypot(dx, dy);

        if (dist < minPlayerDist) {
            const angle = Math.atan2(dy, dx);
            const force = 22; // Strong hit force

            // Update local state immediately
            ball.dx = Math.cos(angle) * force;
            ball.dy = Math.sin(angle) * force;

            // ANTI-STUCK: Aggressively push ball out of player radius
            const overlap = minPlayerDist - dist;
            ball.x += Math.cos(angle) * (overlap + 10); // Offset by 10px buffer
            ball.y += Math.sin(angle) * (overlap + 10);

            if (gameMode === 'online' && ((role === 'p1' && p === p1) || (role === 'p2' && p === p2))) {
                const now = Date.now();
                // Send velocity hint to server
                if (now - lastBallEmitTime > 30) {
                    socket.emit('ballUpdate', {
                        dx: parseFloat(ball.dx.toFixed(2)),
                        dy: parseFloat(ball.dy.toFixed(2))
                    });
                    lastBallEmitTime = now;
                }
            }
        }
    });

    // Player Reflection
    const pDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    if (pDist < p1.radius + p2.radius) {
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const overlap = (p1.radius + p2.radius - pDist) / 2;
        if (gameMode === 'computer' || role === 'p1') {
            p1.x -= Math.cos(angle) * overlap;
            p1.y -= Math.sin(angle) * overlap;
        }
        if (gameMode === 'computer' || role === 'p2') {
            p2.x += Math.cos(angle) * overlap;
            p2.y += Math.sin(angle) * overlap;
        }
    }

    // Walls & Goals
    if (ball.y < ball.radius || ball.y > HEIGHT - ball.radius) {
        ball.dy *= -1;
        ball.y = ball.y < ball.radius ? ball.radius : HEIGHT - ball.radius;
    }

    if (ball.x < ball.radius) {
        const isGoalArea = ball.y > GOAL_Y && ball.y < GOAL_Y + GOAL_HEIGHT;
        if (isGoalArea) {
            if (ball.x < -ball.radius) {
                if (gameMode !== 'online') {
                    p2.score++;
                    score2El.innerText = p2.score;
                    showGoal();
                    if (p2.score >= currentWinLimit) triggerGameOver('Computer');
                    else resetMatchLocal();
                }
            }
        } else {
            ball.dx *= -1;
            ball.x = ball.radius;
        }
    }

    if (ball.x > WIDTH - ball.radius) {
        const isGoalArea = ball.y > GOAL_Y && ball.y < GOAL_Y + GOAL_HEIGHT;
        if (isGoalArea) {
            if (ball.x > WIDTH + ball.radius) {
                if (gameMode !== 'online') {
                    p1.score++;
                    score1El.innerText = p1.score;
                    showGoal();
                    if (p1.score >= currentWinLimit) triggerGameOver('Player 1');
                    else resetMatchLocal();
                }
            }
        } else {
            ball.dx *= -1;
            ball.x = WIDTH - ball.radius;
        }
    }
}

function triggerGameOver(winner) {
    status = 'finished';
    document.getElementById('game-over-overlay').classList.remove('hidden');
    document.getElementById('winner-text').innerText = `${winner} Wins!`;
}

function resetMatchLocal() {
    ball.x = WIDTH / 2;
    ball.y = HEIGHT / 2;
    ball.owner = null; // Authority reset

    if (gameMode === 'computer') {
        // Auto-push ball to start the action
        ball.dx = (Math.random() > 0.5 ? 1 : -1) * 6;
        ball.dy = (Math.random() - 0.5) * 8;
    } else {
        ball.dx = 0;
        ball.dy = 0;
    }

    p1.x = 240; p1.y = 400;
    p2.x = 960; p2.y = 400;

    // Reset targets and buffers too so they don't lerp across the field
    p1Buffer = [];
    p2Buffer = [];
    ballBuffer = [];
    visualBall.x = WIDTH / 2;
    visualBall.y = HEIGHT / 2;
    targetTouchPos = null;
}

function draw() {
    if (!canvas.width) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    if (isVertical) {
        // Map 1200x800 logic to Vertical display (800 wide x 1200 high units)
        if (role === 'p1') {
            ctx.translate(0, canvas.height);
            ctx.rotate(-Math.PI / 2);
        } else {
            ctx.translate(canvas.width, 0);
            ctx.rotate(Math.PI / 2);
        }
        ctx.scale(canvas.width / 800, canvas.height / 1200);
    } else {
        ctx.scale(canvas.width / 1200, canvas.height / 800);
    }

    drawPitch();
    drawPlayer(p1);
    drawPlayer(p2);
    drawBall();
    ctx.restore();
}

function drawPitch() {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 4;
    // Increased margin to 12px for better visibility on small/rounded screens
    const margin = 12;
    ctx.strokeRect(margin, margin, WIDTH - margin * 2, HEIGHT - margin * 2);

    ctx.beginPath();
    ctx.moveTo(WIDTH / 2, margin);
    ctx.lineTo(WIDTH / 2, HEIGHT - margin);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(WIDTH / 2, HEIGHT / 2, 80, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeRect(margin, (HEIGHT - 400) / 2, 180, 400);
    ctx.strokeRect(WIDTH - 180 - margin, (HEIGHT - 400) / 2, 180, 400);

    // Goals - Offset by margin to ensure visibility
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(margin, GOAL_Y, GOAL_WIDTH, GOAL_HEIGHT);
    ctx.fillRect(WIDTH - GOAL_WIDTH - margin, GOAL_Y, GOAL_WIDTH, GOAL_HEIGHT);
    ctx.strokeStyle = "white";
    ctx.strokeRect(margin, GOAL_Y, GOAL_WIDTH, GOAL_HEIGHT);
    ctx.strokeRect(WIDTH - GOAL_WIDTH - margin, GOAL_Y, GOAL_WIDTH, GOAL_HEIGHT);
}

function drawPlayer(p) {
    ctx.beginPath();
    ctx.arc(p.x, p.y + 2, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * 0.7, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.stroke();

    if ((role === 'p1' && p === p1) || (role === 'p2' && p === p2)) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = "yellow";
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

function drawBall() {
    ctx.save();
    // V19: Pure Visual Lerping to hide jitter
    visualBall.x += (ball.x - visualBall.x) * 0.5;
    visualBall.y += (ball.y - visualBall.y) * 0.5;

    ctx.translate(visualBall.x, visualBall.y);
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = "white";
    ctx.fill();
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#1e293b";
    for (let i = 0; i < 5; i++) {
        ctx.rotate(Math.PI * 2 / 5);
        ctx.beginPath();
        ctx.arc(ball.radius * 0.6, 0, ball.radius * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function loop() {
    update();
    draw();
    if (status === 'playing') requestAnimationFrame(loop);
}

init();
