const mongoose = require('mongoose');

const scoreSchema = new mongoose.Schema({
    player1: Number,
    player2: Number,
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Score', scoreSchema);
