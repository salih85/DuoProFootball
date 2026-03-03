const rooms = {}; // stores state for each match: { roomId: { players: [], state: {...} } }

const INITIAL_STATE = {
    ball: { x: 600, y: 400, dx: 0, dy: 0, owner: null },
    p1: { x: 240, y: 400, dx: 0, dy: 0, score: 0 },
    p2: { x: 960, y: 400, dx: 0, dy: 0, score: 0 },
    status: 'waiting' // waiting, playing, finished
};

// Constants shared with client
const WIDTH = 1200;
const HEIGHT = 800;
const FRICTION = 0.99;
const BALL_RADIUS = 18;
const PLAYER_RADIUS = 35;
const GOAL_WIDTH = 30;
const GOAL_HEIGHT = 240;
const GOAL_Y = (HEIGHT - GOAL_HEIGHT) / 2;
const FIELD_MARGIN = 12;

const socketManager = (io) => {
    io.on('connection', (socket) => {
        console.log(`📡 Socket connected: ${socket.id}`);

        let currentRoomId = null;

        // --- Standard Matchmaking ---
        socket.on('findMatch', (data) => {
            let roomId = Object.keys(rooms).find(id => !rooms[id].isPrivate && rooms[id].players.length === 1);

            if (!roomId) {
                roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                rooms[roomId] = {
                    players: [],
                    state: JSON.parse(JSON.stringify(INITIAL_STATE)),
                    isPrivate: false,
                    winLimit: 5 // Default for public matches
                };
            }
            joinOrCreate(roomId, data);
        });

        // --- Private Rooms (v16) ---
        socket.on('createPrivateRoom', (data) => {
            const shortId = Math.random().toString(36).substr(2, 4).toUpperCase();
            rooms[shortId] = {
                players: [],
                state: JSON.parse(JSON.stringify(INITIAL_STATE)),
                isPrivate: true,
                winLimit: data.winLimit || 5
            };
            socket.emit('privateRoomCreated', { roomId: shortId });
            joinOrCreate(shortId, data);
        });

        socket.on('joinPrivateRoom', (data) => {
            const roomId = data.roomId.toUpperCase();
            if (rooms[roomId] && rooms[roomId].players.length < 2) {
                joinOrCreate(roomId, data);
            } else {
                socket.emit('matchError', { message: "Room not found or full." });
            }
        });

        function joinOrCreate(roomId, data) {
            currentRoomId = roomId;
            const room = rooms[roomId];
            room.players.push(socket.id);
            socket.join(roomId);

            const role = room.players.length === 1 ? 'p1' : 'p2';
            // Sync jersey color
            room.state[role].color = data.color || (role === 'p1' ? '#3b82f6' : '#ef4444');

            socket.emit('matchFound', {
                roomId,
                role,
                state: room.state,
                winLimit: room.winLimit
            });

            if (room.players.length === 2) {
                room.state.status = 'playing';
                io.to(roomId).emit('gameStart', room.state);

                // Start Server-side Tick (v20: High-frequency Authoritative Physics)
                if (room.tickInterval) clearInterval(room.tickInterval);
                room.tickInterval = setInterval(() => {
                    if (room.state.status === 'playing') {
                        updatePhysics(room);

                        // Optimized Payload - Send every tick or every other? 60fps might be high for some.
                        // Let's stick to every tick for now but keep it extremely compact.
                        const compactState = {
                            ball: {
                                x: Math.round(room.state.ball.x),
                                y: Math.round(room.state.ball.y),
                                dx: parseFloat(room.state.ball.dx.toFixed(2)),
                                dy: parseFloat(room.state.ball.dy.toFixed(2))
                            },
                            p1: { x: Math.round(room.state.p1.x), y: Math.round(room.state.p1.y) },
                            p2: { x: Math.round(room.state.p2.x), y: Math.round(room.state.p2.y) },
                            ts: Date.now()
                        };
                        io.to(roomId).volatile.emit('stateUpdate', compactState);
                    } else {
                        clearInterval(room.tickInterval);
                    }
                }, 16); // ~60Hz
            }
        }

        function updatePhysics(room) {
            const ball = room.state.ball;
            const p1 = room.state.p1;
            const p2 = room.state.p2;

            // 1. Move Ball
            ball.x += ball.dx;
            ball.y += ball.dy;
            ball.dx *= FRICTION;
            ball.dy *= FRICTION;

            // 2. Wall Collisions (Strict resolution)
            const wallBuffer = BALL_RADIUS + FIELD_MARGIN;
            if (ball.y < wallBuffer) {
                ball.dy *= -1;
                ball.y = wallBuffer;
            } else if (ball.y > HEIGHT - wallBuffer) {
                ball.dy *= -1;
                ball.y = HEIGHT - wallBuffer;
            }

            // 3. Goal & End Wall Collisions
            if (ball.x < wallBuffer) {
                const isGoalArea = ball.y > GOAL_Y && ball.y < GOAL_Y + GOAL_HEIGHT;
                if (isGoalArea) {
                    if (ball.x < -BALL_RADIUS) {
                        handleGoal(room, 'p2');
                    }
                } else {
                    ball.dx *= -1;
                    ball.x = wallBuffer;
                }
            }

            if (ball.x > WIDTH - wallBuffer) {
                const isGoalArea = ball.y > GOAL_Y && ball.y < GOAL_Y + GOAL_HEIGHT;
                if (isGoalArea) {
                    if (ball.x > WIDTH + BALL_RADIUS) {
                        handleGoal(room, 'p1');
                    }
                } else {
                    ball.dx *= -1;
                    ball.x = WIDTH - wallBuffer;
                }
            }

            // 4. Player Collisions (Server-side validation)
            const minPlayerDist = BALL_RADIUS + PLAYER_RADIUS;
            [p1, p2].forEach(p => {
                const dx = ball.x - p.x;
                const dy = ball.y - p.y;
                const dist = Math.hypot(dx, dy);

                if (dist < minPlayerDist) {
                    const angle = Math.atan2(dy, dx);

                    // V36: Final Hardened Directional Momentum
                    // Force ball in player's path and ensure a decisive exit
                    const hitPower = 28; // v36: Snappier power
                    const pVelX = p.dx || 0;
                    const pVelY = p.dy || 0;
                    const pSpeed = Math.hypot(pVelX, pVelY);

                    let targetDx = Math.cos(angle) * hitPower;
                    let targetDy = Math.sin(angle) * hitPower;

                    // v36: Decisive carrying for all speeds > 1
                    if (pSpeed > 1) {
                        const pDirX = pVelX / pSpeed;
                        const pDirY = pVelY / pSpeed;
                        const dot = (targetDx * pDirX + targetDy * pDirY) / hitPower;

                        // Strict momentum cone enforcement (prevents backward hits)
                        if (dot < 0.5) {
                            targetDx = (pDirX * hitPower * 0.9) + (targetDx * 0.1);
                            targetDy = (pDirY * hitPower * 0.9) + (targetDy * 0.1);
                        }
                    }

                    ball.dx = targetDx + (pVelX * 0.45); // v36: Higher inheritance
                    ball.dy = targetDy + (pVelY * 0.45);

                    // Force Decisive Exit Speed
                    const newSpeed = Math.hypot(ball.dx, ball.dy);
                    if (newSpeed < 18) {
                        const factor = 18 / (newSpeed || 1);
                        ball.dx *= factor;
                        ball.dy *= factor;
                    }

                    // Clamp speed
                    const MAX_SPEED = 42; // v36: Slightly higher for pro feels
                    const finalSpeed = Math.hypot(ball.dx, ball.dy);
                    if (finalSpeed > MAX_SPEED) {
                        ball.dx = (ball.dx / finalSpeed) * MAX_SPEED;
                        ball.dy = (ball.dy / finalSpeed) * MAX_SPEED;
                    }

                    // ANTI-STUCK (v36: Maximum 8px Margin)
                    const overlap = minPlayerDist - dist;
                    ball.x += Math.cos(angle) * (overlap + 8);
                    ball.y += Math.sin(angle) * (overlap + 8);
                }
            });
        }

        function handleGoal(room, winnerRole) {
            if (winnerRole === 'p1') room.state.p1.score++;
            else room.state.p2.score++;

            room.state.ball = { x: 600, y: 400, dx: 0, dy: 0 };
            room.state.p1.x = 240; room.state.p1.y = 400; room.state.p1.dx = 0; room.state.p1.dy = 0;
            room.state.p2.x = 960; room.state.p2.y = 400; room.state.p2.dx = 0; room.state.p2.dy = 0;

            io.to(room.id || currentRoomId).emit('scoreSync', {
                score1: room.state.p1.score,
                score2: room.state.p2.score
            });

            if (room.state.p1.score >= room.winLimit || room.state.p2.score >= room.winLimit) {
                const winner = room.state.p1.score >= room.winLimit ? 'Player 1' : 'Player 2';
                io.to(room.id || currentRoomId).emit('gameOver', { winner });
                room.state.status = 'finished';
                if (room.tickInterval) clearInterval(room.tickInterval);
            }
        }

        socket.on('playerUpdate', (data) => {
            if (!currentRoomId || !rooms[currentRoomId]) return;
            const room = rooms[currentRoomId];
            const role = room.players[0] === socket.id ? 'p1' : 'p2';

            const p = room.state[role];
            // V32: Calculate velocity for collision bias
            p.dx = data.x - p.x;
            p.dy = data.y - p.y;

            // V38: Enforce field boundaries and clean coordinates on server
            p.x = Math.max(PLAYER_RADIUS, Math.min(WIDTH - PLAYER_RADIUS, data.x || 0));
            p.y = Math.max(PLAYER_RADIUS, Math.min(HEIGHT - PLAYER_RADIUS, data.y || 0));
        });

        // V38: Total Server Authority (REMOVED ballUpdate handler)
        // Physics logic in the main loop now dictates ball movement entirely.

        socket.on('disconnect', () => {
            if (currentRoomId && rooms[currentRoomId]) {
                const room = rooms[currentRoomId];
                socket.to(currentRoomId).emit('opponentDisconnected');
                if (room.tickInterval) clearInterval(room.tickInterval);
                delete rooms[currentRoomId];
            }
        });
    });
};

module.exports = socketManager;
