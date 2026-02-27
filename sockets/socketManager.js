const rooms = {}; // stores state for each match: { roomId: { players: [], state: {...} } }

const INITIAL_STATE = {
    ball: { x: 600, y: 400, dx: 0, dy: 0 },
    p1: { x: 240, y: 400, score: 0 },
    p2: { x: 960, y: 400, score: 0 },
    status: 'waiting' // waiting, playing, finished
};

const socketManager = (io) => {
    io.on('connection', (socket) => {
        console.log(`📡 Socket connected: ${socket.id}`);

        let currentRoomId = null;

        // Simple Matchmaking: Join first available room or create new one
        socket.on('findMatch', () => {
            let roomId = Object.keys(rooms).find(id => rooms[id].players.length === 1);

            if (!roomId) {
                roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                rooms[roomId] = {
                    players: [],
                    state: JSON.parse(JSON.stringify(INITIAL_STATE))
                };
            }

            currentRoomId = roomId;
            rooms[roomId].players.push(socket.id);
            socket.join(roomId);

            const role = rooms[roomId].players.length === 1 ? 'p1' : 'p2';
            socket.emit('matchFound', { roomId, role, state: rooms[roomId].state });

            if (rooms[roomId].players.length === 2) {
                rooms[roomId].state.status = 'playing';
                io.to(roomId).emit('gameStart', rooms[roomId].state);
            }
        });

        socket.on('playerUpdate', (data) => {
            if (!currentRoomId || !rooms[currentRoomId]) return;
            const room = rooms[currentRoomId];
            const role = room.players[0] === socket.id ? 'p1' : 'p2';

            // Update the authoritative state for this player
            room.state[role].x = data.x;
            room.state[role].y = data.y;

            // Broadcast to the other player in the room
            socket.to(currentRoomId).emit('stateUpdate', room.state);
        });

        socket.on('ballUpdate', (data) => {
            if (!currentRoomId || !rooms[currentRoomId]) return;
            rooms[currentRoomId].state.ball = data;
            socket.to(currentRoomId).emit('stateUpdate', rooms[currentRoomId].state);
        });

        socket.on('goal', (data) => {
            if (!currentRoomId || !rooms[currentRoomId]) return;
            const room = rooms[currentRoomId];
            room.state.p1.score = data.score1;
            room.state.p2.score = data.score2;
            room.state.ball = { x: 600, y: 400, dx: 0, dy: 0 };
            room.state.p1.x = 240; room.state.p1.y = 400;
            room.state.p2.x = 960; room.state.p2.y = 400;

            io.to(currentRoomId).emit('scoreSync', { score1: room.state.p1.score, score2: room.state.p2.score });
            io.to(currentRoomId).emit('stateUpdate', room.state);

            // Check for Game Over (10 goals)
            if (room.state.p1.score >= 10 || room.state.p2.score >= 10) {
                const winner = room.state.p1.score >= 10 ? 'Player 1' : 'Player 2';
                io.to(currentRoomId).emit('gameOver', { winner });
                room.state.status = 'finished';
                // We keep the room for a moment then delete or reset
                setTimeout(() => {
                    if (rooms[currentRoomId]) delete rooms[currentRoomId];
                }, 5000);
            }
        });

        socket.on('disconnect', () => {
            console.log(`❌ Socket disconnected: ${socket.id}`);
            if (currentRoomId && rooms[currentRoomId]) {
                socket.to(currentRoomId).emit('opponentDisconnected');
                delete rooms[currentRoomId];
            }
        });
    });
};

module.exports = socketManager;
