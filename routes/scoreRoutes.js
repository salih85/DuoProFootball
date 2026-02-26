const express = require('express');
const router = express.Router();
const scoreController = require('../controllers/scoreController');

router.get('/scores', scoreController.getScores);
router.post('/scores', scoreController.saveScore);

module.exports = router;
