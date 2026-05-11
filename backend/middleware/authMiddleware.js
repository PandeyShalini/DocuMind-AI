const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  // 1. Try to get token from Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } 
  // 2. Fallback: Get token from query param (for iframes/PDF viewer)
  else if (req.query.token) {
    token = req.query.token;
  }

  // --- AUTH BYPASS (TEMPORARY) ---
  if (token === "BYPASS_TOKEN") {
    // Find the first user in the system to act as a "Developer Guest"
    const guestUser = await User.findOne();
    if (guestUser) {
       req.user = guestUser;
       return next();
    }
  }

  if (token) {
    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from the token
      req.user = await User.findById(decoded.id).select('-password');

      return next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

module.exports = { protect };
