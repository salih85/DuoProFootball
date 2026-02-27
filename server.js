/**
 * Server Initialization
 * Entry point for the Football Game Modular Backend.
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');

// Import Modular Components
const viewRoutes = require('./routes/viewRoutes');
const socketManager = require('./sockets/socketManager');
const errorHandler = require('./middleware/errorMiddleware');

// Initialize App & Server
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Global Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// View Engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/', viewRoutes);

// Real-time Logic (Socket.io)
socketManager(io);

// Error Handling (Must be after routes)
app.use(errorHandler);

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Modular Server running on http://localhost:${PORT}`);
});