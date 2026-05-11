const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { sendMessage, getHistory } = require('../controllers/chatController');

router.route('/:documentId')
  .post(protect, sendMessage)
  .get(protect, getHistory);

module.exports = router;
