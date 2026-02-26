const express = require('express');
const router = express.Router();

/**
 * View Routes
 * Handles rendering of EJS templates.
 */

// Home page / Game view
router.get('/', (req, res) => {
    res.render('index');
});

module.exports = router;
