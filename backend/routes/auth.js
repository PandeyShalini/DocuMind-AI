const express = require('express');
const router = express.Router();
const { registerUser, loginUser, deleteGuestData } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.delete('/guest', protect, deleteGuestData);

module.exports = router;
