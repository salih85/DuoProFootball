/**
 * Socket.io Manager
 * Handles all real-time communication for the football game.
 */

let gameState = {
    p1: { x: 180, y: 250 },
    p2: { x: 720, y: 250 },
    ball: { x: 450, y: 250, dx: 0, dy: 0 },
    score1: 0,
    score2: 0
};

const socketManager = (io) => {
    io.on('connection', (socket) => {
        console.log(`📡 Socket connected: ${socket.id}`);

        // Initial state sync
        socket.emit('init', gameState);

        // Player movement synchronization
        socket.on('playerUpdate', (data) => {
            if (data.p1) gameState.p1 = data.p1;
            if (data.p2) gameState.p2 = data.p2;
            socket.broadcast.emit('stateUpdate', gameState);
        });

        // Ball physics synchronization
        socket.on('ballUpdate', (data) => {
            gameState.ball = data;
            socket.broadcast.emit('stateUpdate', gameState);
        });

        // Goal event handling
        socket.on('goal', (data) => {
            gameState.score1 = data.score1;
            gameState.score2 = data.score2;
            io.emit('scoreSync', data);
        });

        // Match reset handling
        socket.on('resetMatch', () => {
            gameState.score1 = 0;
            gameState.score2 = 0;
            gameState.p1 = { x: 180, y: 250 };
            gameState.p2 = { x: 720, y: 250 };
            gameState.ball = { x: 450, y: 250, dx: 0, dy: 0 };
            io.emit('scoreSync', { score1: 0, score2: 0 });
            io.emit('stateUpdate', gameState);
        });

        socket.on('disconnect', () => {
            console.log(`❌ Socket disconnected: ${socket.id}`);
        });
    });
};

module.exports = socketManager;
