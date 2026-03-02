const rooms = {}; // stores state for each match: { roomId: { players: [], state: {...} } }

const INITIAL_STATE = {
    ball: { x: 600, y: 400, dx: 0, dy: 0, owner: null },
    p1: { x: 240, y: 400, score: 0 },
    p2: { x: 960, y: 400, score: 0 },
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

                // Start Server-side Tick (v18: Authoritative Physics)
                if (room.tickInterval) clearInterval(room.tickInterval);
                room.tickInterval = setInterval(() => {
                    if (room.state.status === 'playing') {
                        updatePhysics(room);

                        // Optimized Payload
                        const compactState = {
                            ball: {
                                x: Math.round(room.state.ball.x),
                                y: Math.round(room.state.ball.y),
                                dx: parseFloat(room.state.ball.dx.toFixed(2)),
                                dy: parseFloat(room.state.ball.dy.toFixed(2))
                            },
                            p1: { x: Math.round(room.state.p1.x), y: Math.round(room.state.p1.y) },
                            p2: { x: Math.round(room.state.p2.x), y: Math.round(room.state.p2.y) }
                        };
                        io.to(roomId).volatile.emit('stateUpdate', compactState);
                    } else {
                        clearInterval(room.tickInterval);
                    }
                }, 45); // 22Hz
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

            // 2. Wall Collisions
            if (ball.y < BALL_RADIUS + FIELD_MARGIN || ball.y > HEIGHT - BALL_RADIUS - FIELD_MARGIN) {
                ball.dy *= -1;
                ball.y = ball.y < BALL_RADIUS + FIELD_MARGIN ? BALL_RADIUS + FIELD_MARGIN : HEIGHT - BALL_RADIUS - FIELD_MARGIN;
            }

            // 3. Goal & End Wall Collisions
            if (ball.x < BALL_RADIUS + FIELD_MARGIN) {
                const isGoalArea = ball.y > GOAL_Y && ball.y < GOAL_Y + GOAL_HEIGHT;
                if (isGoalArea) {
                    if (ball.x < -BALL_RADIUS) {
                        handleGoal(room, 'p2');
                    }
                } else {
                    ball.dx *= -1;
                    ball.x = BALL_RADIUS + FIELD_MARGIN;
                }
            }

            if (ball.x > WIDTH - BALL_RADIUS - FIELD_MARGIN) {
                const isGoalArea = ball.y > GOAL_Y && ball.y < GOAL_Y + GOAL_HEIGHT;
                if (isGoalArea) {
                    if (ball.x > WIDTH + BALL_RADIUS) {
                        handleGoal(room, 'p1');
                    }
                } else {
                    ball.dx *= -1;
                    ball.x = WIDTH - BALL_RADIUS - FIELD_MARGIN;
                }
            }

            // 4. Player Collisions (Server-side validation)
            [p1, p2].forEach(p => {
                const dist = Math.hypot(ball.x - p.x, ball.y - p.y);
                if (dist < BALL_RADIUS + PLAYER_RADIUS) {
                    const angle = Math.atan2(ball.y - p.y, ball.x - p.x);
                    const force = 22;
                    ball.dx = Math.cos(angle) * force;
                    ball.dy = Math.sin(angle) * force;
                    // Pop transition
                    const overlap = (BALL_RADIUS + PLAYER_RADIUS) - dist;
                    ball.x += Math.cos(angle) * (overlap + 5);
                    ball.y += Math.sin(angle) * (overlap + 5);
                }
            });
        }

        function handleGoal(room, winnerRole) {
            if (winnerRole === 'p1') room.state.p1.score++;
            else room.state.p2.score++;

            room.state.ball = { x: 600, y: 400, dx: 0, dy: 0 };
            room.state.p1.x = 240; room.state.p1.y = 400;
            room.state.p2.x = 960; room.state.p2.y = 400;

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

            room.state[role].x = data.x;
            room.state[role].y = data.y;
        });

        // V18: ballUpdate is now used as a hint for hits, but server dominates
        socket.on('ballUpdate', (data) => {
            if (!currentRoomId || !rooms[currentRoomId]) return;
            const room = rooms[currentRoomId];
            // Accept velocity hints to keep immediate feedback, but server will correct
            room.state.ball.dx = data.dx;
            room.state.ball.dy = data.dy;
        });

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
