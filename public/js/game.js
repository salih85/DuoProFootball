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
const findMatchBtn = document.getElementById('findMatchBtn');
const searchingText = document.getElementById('searching-text');
const score1El = document.getElementById('score1');
const score2El = document.getElementById('score2');
const goalTextEl = document.getElementById('goalText');

// Game State
let role = null; // 'p1' or 'p2'
let roomId = null;
let status = 'waiting';
let keys = {};
let targetTouchPos = null;
let isVertical = false;

let ball = { x: WIDTH / 2, y: HEIGHT / 2, radius: 18, dx: 0, dy: 0 };
let p1 = { x: 240, y: 400, radius: 35, color: '#3b82f6', score: 0 };
let p2 = { x: 960, y: 400, radius: 35, color: '#ef4444', score: 0 };

// Initialize
function init() {
    setupInput();
    setupTouch();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', resizeCanvas);
    resizeCanvas();
}

function setupInput() {
    window.addEventListener('keydown', e => keys[e.code] = true);
    window.addEventListener('keyup', e => keys[e.code] = false);

    findMatchBtn.addEventListener('click', () => {
        findMatchBtn.classList.add('hidden');
        searchingText.classList.remove('hidden');
        socket.emit('findMatch');
    });
}

function setupTouch() {
    canvas.addEventListener('touchstart', (e) => {
        handleTouch(e);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        handleTouch(e);
    }, { passive: false });

    window.addEventListener('touchend', () => {
        targetTouchPos = null;
    });

    function handleTouch(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const touchX = touch.clientX - rect.left;
        const touchY = touch.clientY - rect.top;

        // Map touch back to internal coordinates (1200x800)
        if (isVertical) {
            // ViewX is internal Y (0-HEIGHT), ViewY is internal X (0-WIDTH)
            const internalY = (touchX / rect.width) * HEIGHT;
            let internalX;
            if (role === 'p1') {
                internalX = (1 - (touchY / rect.height)) * WIDTH;
            } else {
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
    syncState(data.state);
});

socket.on('gameStart', (state) => {
    status = 'playing';
    syncState(state);
    lobbyOverlay.classList.add('hidden');
    gameContainer.classList.remove('hidden');

    // CRITICAL: Force resize after showing container to fix rendering bug
    resizeCanvas();
    setTimeout(resizeCanvas, 50);

    requestAnimationFrame(loop);
});

socket.on('stateUpdate', (state) => {
    syncState(state);
});

socket.on('scoreSync', (data) => {
    p1.score = data.score1;
    p2.score = data.score2;
    score1El.innerText = p1.score;
    score2El.innerText = p2.score;
    showGoal();
});

socket.on('gameOver', (data) => {
    status = 'finished';
    document.getElementById('game-over-overlay').classList.remove('hidden');
    document.getElementById('winner-text').innerText = `${data.winner} Wins!`;
});

socket.on('opponentDisconnected', () => {
    alert("Opponent disconnected. Match ended.");
    location.reload();
});

function syncState(state) {
    if (role === 'p1') {
        p2.x = state.p2.x;
        p2.y = state.p2.y;
    } else {
        p1.x = state.p1.x;
        p1.y = state.p1.y;
    }
    ball.x = state.ball.x;
    ball.y = state.ball.y;
    ball.dx = state.ball.dx;
    ball.dy = state.ball.dy;
}

function showGoal() {
    goalTextEl.classList.add('show');
    setTimeout(() => goalTextEl.classList.remove('show'), 1500);
}

function update() {
    if (status !== 'playing') return;

    let me = role === 'p1' ? p1 : p2;
    let oldX = me.x;
    let oldY = me.y;

    // keyboard
    if (keys['KeyW'] || keys['ArrowUp']) me.y -= PLAYER_SPEED;
    if (keys['KeyS'] || keys['ArrowDown']) me.y += PLAYER_SPEED;
    if (keys['KeyA'] || keys['ArrowLeft']) me.x -= PLAYER_SPEED;
    if (keys['KeyD'] || keys['ArrowRight']) me.x += PLAYER_SPEED;

    // direct touch
    if (targetTouchPos) {
        const dx = targetTouchPos.x - me.x;
        const dy = targetTouchPos.y - me.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 5) {
            me.x += (dx / dist) * PLAYER_SPEED;
            me.y += (dy / dist) * PLAYER_SPEED;
        }
    }

    // boundaries
    if (role === 'p1') {
        me.x = Math.max(me.radius, Math.min(WIDTH / 2 - me.radius, me.x));
    } else {
        me.x = Math.max(WIDTH / 2 + me.radius, Math.min(WIDTH - me.radius, me.x));
    }
    me.y = Math.max(me.radius, Math.min(HEIGHT - me.radius, me.y));

    if (me.x !== oldX || me.y !== oldY) {
        socket.emit('playerUpdate', { x: me.x, y: me.y });
    }

    // collision logic
    // Ball movement
    ball.x += ball.dx;
    ball.y += ball.dy;
    ball.dx *= FRICTION;
    ball.dy *= FRICTION;

    // Collisions (Simulated for both)
    [p1, p2].forEach(p => {
        const dist = Math.hypot(ball.x - p.x, ball.y - p.y);
        if (dist < ball.radius + p.radius) {
            const angle = Math.atan2(ball.y - p.y, ball.x - p.x);
            const force = 12;
            ball.dx = Math.cos(angle) * force;
            ball.dy = Math.sin(angle) * force;
            ball.x = p.x + Math.cos(angle) * (ball.radius + p.radius + 1);
            ball.y = p.y + Math.sin(angle) * (ball.radius + p.radius + 1);

            if ((role === 'p1' && p === p1) || (role === 'p2' && p === p2)) {
                socket.emit('ballUpdate', { x: ball.x, y: ball.y, dx: ball.dx, dy: ball.dy });
            }
        }
    });

    // Player Reflact
    const pDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    if (pDist < p1.radius + p2.radius) {
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const overlap = (p1.radius + p2.radius - pDist) / 2;
        if (role === 'p1') {
            p1.x -= Math.cos(angle) * overlap;
            p1.y -= Math.sin(angle) * overlap;
        } else {
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
                socket.emit('goal', { score1: p1.score, score2: p2.score + 1 });
                resetMatchLocal();
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
                socket.emit('goal', { score1: p1.score + 1, score2: p2.score });
                resetMatchLocal();
            }
        } else {
            ball.dx *= -1;
            ball.x = WIDTH - ball.radius;
        }
    }
}

function resetMatchLocal() {
    ball.x = WIDTH / 2;
    ball.y = HEIGHT / 2;
    ball.dx = 0;
    ball.dy = 0;
    p1.x = 240; p1.y = 400;
    p2.x = 960; p2.y = 400;
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
    ctx.translate(ball.x, ball.y);
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
