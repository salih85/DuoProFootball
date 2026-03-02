const rooms = {}; // stores state for each match: { roomId: { players: [], state: {...} } }

const INITIAL_STATE = {
    ball: { x: 600, y: 400, dx: 0, dy: 0, owner: null },
    p1: { x: 240, y: 400, score: 0 },
    p2: { x: 960, y: 400, score: 0 },
    status: 'waiting' // waiting, playing, finished
};

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

                // Start Server-side Tick (v17 optimization)
                // ~22Hz (45ms) is a good balance for Render's free tier
                if (room.tickInterval) clearInterval(room.tickInterval);
                room.tickInterval = setInterval(() => {
                    if (room.state.status === 'playing') {
                        // V17.2: Optimized Payload (only send dynamic movement data)
                        const compactState = {
                            ball: {
                                x: Math.round(room.state.ball.x),
                                y: Math.round(room.state.ball.y),
                                dx: parseFloat(room.state.ball.dx.toFixed(2)),
                                dy: parseFloat(room.state.ball.dy.toFixed(2)),
                                owner: room.state.ball.owner
                            },
                            p1: { x: Math.round(room.state.p1.x), y: Math.round(room.state.p1.y) },
                            p2: { x: Math.round(room.state.p2.x), y: Math.round(room.state.p2.y) }
                        };
                        io.to(roomId).volatile.emit('stateUpdate', compactState);
                    } else {
                        clearInterval(room.tickInterval);
                    }
                }, 45);
            }
        }

        socket.on('playerUpdate', (data) => {
            if (!currentRoomId || !rooms[currentRoomId]) return;
            const room = rooms[currentRoomId];
            const role = room.players[0] === socket.id ? 'p1' : 'p2';

            room.state[role].x = data.x;
            room.state[role].y = data.y;
            // No longer broadcasting here; let the tick handle it
        });

        socket.on('ballUpdate', (data) => {
            if (!currentRoomId || !rooms[currentRoomId]) return;
            const room = rooms[currentRoomId];
            const role = room.players[0] === socket.id ? 'p1' : 'p2';
            room.state.ball = data;
            room.state.ball.owner = role; // Set owner to current hitter
            // No longer broadcasting here; let the tick handle it
        });

        socket.on('goal', (data) => {
            if (!currentRoomId || !rooms[currentRoomId]) return;
            const room = rooms[currentRoomId];
            room.state.p1.score = data.score1;
            room.state.p2.score = data.score2;
            room.state.ball = { x: 600, y: 400, dx: 0, dy: 0, owner: null }; // Reset owner on goal
            room.state.p1.x = 240; room.state.p1.y = 400;
            room.state.p2.x = 960; room.state.p2.y = 400;

            // Score sync is critical, don't use volatile
            io.to(currentRoomId).emit('scoreSync', { score1: room.state.p1.score, score2: room.state.p2.score });
            io.to(currentRoomId).emit('stateUpdate', room.state);

            if (room.state.p1.score >= room.winLimit || room.state.p2.score >= room.winLimit) {
                const winner = room.state.p1.score >= room.winLimit ? 'Player 1' : 'Player 2';
                io.to(currentRoomId).emit('gameOver', { winner });
                room.state.status = 'finished';
                if (room.tickInterval) clearInterval(room.tickInterval);
                setTimeout(() => {
                    if (rooms[currentRoomId]) delete rooms[currentRoomId];
                }, 5000);
            }
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
