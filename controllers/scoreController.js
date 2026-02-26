const Score = require('../models/Score');

/**
 * Score Controller
 * Handles logic for fetching and saving match scores.
 */

// @desc    Fetch recent match scores
// @route   GET /api/scores
// @access  Public
exports.getScores = async (req, res, next) => {
    try {
        const scores = await Score.find()
            .sort({ timestamp: -1 })
            .limit(10);

        res.status(200).json({
            success: true,
            count: scores.length,
            data: scores
        });
    } catch (err) {
        next(err);
    }
};

// @desc    Save a new match score
// @route   POST /api/scores
// @access  Public
exports.saveScore = async (req, res, next) => {
    try {
        const { player1, player2 } = req.body;

        if (player1 === undefined || player2 === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Please provide scores for both players'
            });
        }

        const newScore = await Score.create({ player1, player2 });

        res.status(201).json({
            success: true,
            data: newScore
        });
    } catch (err) {
        next(err);
    }
};
