const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// Game State
let score1 = 0;
let score2 = 0;
const FRICTION = 0.985;
const PLAYER_SPEED = 5;
const BALL_MAX_SPEED = 12;

// Goal Dimensions
const goalWidth = 15;
const goalHeight = 150;
const goalY = (HEIGHT - goalHeight) / 2;

// Objects
const ball = {
    x: WIDTH / 2,
    y: HEIGHT / 2,
    radius: 12,
    dx: 0,
    dy: 0,
    mass: 1
};

const p1 = {
    id: null,
    x: WIDTH * 0.2,
    y: HEIGHT / 2,
    radius: 25,
    color: '#3b82f6',
    score: 0
};

const p2 = {
    id: null,
    x: WIDTH * 0.8,
    y: HEIGHT / 2,
    radius: 25,
    color: '#ef4444',
    score: 0
};

// Input Handling
const keys = {};
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

// Backend Integration
async function saveScore() {
    try {
        await fetch(`/api/scores`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player1: score1, player2: score2 })
        });
        fetchScores();
    } catch (err) {
        console.error('Failed to save score:', err);
    }
}

async function fetchScores() {
    try {
        const res = await fetch(`/api/scores`);
        const json = await res.json();
        const scores = json.data || [];
        const scoreList = document.getElementById('scoreList');
        scoreList.innerHTML = scores.map(s => `
      <div style="display: flex; justify-content: space-between; margin-bottom: 5px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 2px;">
        <span style="color: #3b82f6;">P1: ${s.player1}</span>
        <span style="color: #ef4444;">P2: ${s.player2}</span>
      </div>
    `).join('') || '<div style="opacity:0.5; text-align:center;">No matches yet</div>';
    } catch (err) {
        document.getElementById('scoreList').innerText = 'Backend offline';
    }
}

function resetMatch() {
    score1 = 0;
    score2 = 0;
    document.getElementById('score1').innerText = '0';
    document.getElementById('score2').innerText = '0';
    resetPositions();
    socket.emit('resetMatch');
}

function showGoal() {
    const el = document.getElementById('goalText');
    el.style.opacity = '1';
    setTimeout(() => el.style.opacity = '0', 1500);
}

function drawPitch() {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 5, WIDTH - 10, HEIGHT - 10);
    ctx.beginPath();
    ctx.moveTo(WIDTH / 2, 5);
    ctx.lineTo(WIDTH / 2, HEIGHT - 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(WIDTH / 2, HEIGHT / 2, 60, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(5, (HEIGHT - 280) / 2, 120, 280);
    ctx.strokeRect(WIDTH - 125, (HEIGHT - 280) / 2, 120, 280);
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(0, goalY, goalWidth, goalHeight);
    ctx.fillRect(WIDTH - goalWidth, goalY, goalWidth, goalHeight);
    ctx.strokeStyle = "white";
    ctx.strokeRect(0, goalY, goalWidth, goalHeight);
    ctx.strokeRect(WIDTH - goalWidth, goalY, goalWidth, goalHeight);
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
}

function resetPositions() {
    ball.x = WIDTH / 2;
    ball.y = HEIGHT / 2;
    ball.dx = 0;
    ball.dy = 0;
    p1.x = WIDTH * 0.2;
    p1.y = HEIGHT / 2;
    p2.x = WIDTH * 0.8;
    p2.y = HEIGHT / 2;
}

function update() {
    // Player 1 Movement (Constrained to Left Half)
    if (keys['KeyW']) p1.y -= PLAYER_SPEED;
    if (keys['KeyS']) p1.y += PLAYER_SPEED;
    if (keys['KeyA']) p1.x -= PLAYER_SPEED;
    if (keys['KeyD']) p1.x += PLAYER_SPEED;

    // Player 2 Movement (Constrained to Right Half)
    if (keys['ArrowUp']) p2.y -= PLAYER_SPEED;
    if (keys['ArrowDown']) p2.y += PLAYER_SPEED;
    if (keys['ArrowLeft']) p2.x -= PLAYER_SPEED;
    if (keys['ArrowRight']) p2.x += PLAYER_SPEED;

    // Player boundaries & Constraints
    // P1: Left Half
    p1.x = Math.max(p1.radius, Math.min(WIDTH / 2 - p1.radius, p1.x));
    p1.y = Math.max(p1.radius, Math.min(HEIGHT - p1.radius, p1.y));

    // P2: Right Half
    p2.x = Math.max(WIDTH / 2 + p2.radius, Math.min(WIDTH - p2.radius, p2.x));
    p2.y = Math.max(p2.radius, Math.min(HEIGHT - p2.radius, p2.y));

    // Ball Movement & Friction
    ball.x += ball.dx;
    ball.y += ball.dy;
    ball.dx *= FRICTION;
    ball.dy *= FRICTION;

    if (ball.y < ball.radius || ball.y > HEIGHT - ball.radius) {
        ball.dy *= -1;
        ball.y = ball.y < ball.radius ? ball.radius : HEIGHT - ball.radius;
    }

    if (ball.x < ball.radius || ball.x > WIDTH - ball.radius) {
        const isGoalArea = ball.y > goalY && ball.y < goalY + goalHeight;
        if (!isGoalArea) {
            ball.dx *= -1;
            ball.x = ball.x < ball.radius ? ball.radius : WIDTH - ball.radius;
        }
    }

    // Goal Detection (Only handled locally for now, could be server-side)
    if (ball.x < 0) {
        score2++;
        document.getElementById('score2').innerText = score2;
        showGoal();
        saveScore();
        resetPositions();
        socket.emit('goal', { score1, score2 });
    } else if (ball.x > WIDTH) {
        score1++;
        document.getElementById('score1').innerText = score1;
        showGoal();
        saveScore();
        resetPositions();
        socket.emit('goal', { score1, score2 });
    }

    // Collisions
    [p1, p2].forEach(p => {
        const dist = Math.hypot(ball.x - p.x, ball.y - p.y);
        if (dist < ball.radius + p.radius) {
            const angle = Math.atan2(ball.y - p.y, ball.x - p.x);
            const force = 8;
            ball.dx = Math.cos(angle) * force;
            ball.dy = Math.sin(angle) * force;
            ball.x = p.x + Math.cos(angle) * (ball.radius + p.radius + 1);
            ball.y = p.y + Math.sin(angle) * (ball.radius + p.radius + 1);
            socket.emit('ballUpdate', { x: ball.x, y: ball.y, dx: ball.dx, dy: ball.dy });
        }
    });

    // Emit player position to server
    socket.emit('playerUpdate', { p1: { x: p1.x, y: p1.y }, p2: { x: p2.x, y: p2.y } });
}

// Socket events
socket.on('updateState', (state) => {
    // Simple synchronization for now
    // In a real game, you would interpolate or only sync what you don't control
});

socket.on('scoreSync', (data) => {
    score1 = data.score1;
    score2 = data.score2;
    document.getElementById('score1').innerText = score1;
    document.getElementById('score2').innerText = score2;
});

function loop() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawPitch();
    update();
    drawPlayer(p1);
    drawPlayer(p2);
    drawBall();
    requestAnimationFrame(loop);
}

fetchScores();
loop();
