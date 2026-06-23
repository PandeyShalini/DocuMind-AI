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


  if (token) {
    try {
      // Check if it is an anonymous guest token
      if (token.startsWith('guest_')) {
        let guestUser = await User.findOne({ email: token + "@documind.guest" });
        if (!guestUser) {
          guestUser = await User.create({
            name: "Guest " + token.substring(6, 12).toUpperCase(),
            email: token + "@documind.guest",
            password: "guest_password_" + token
          });
        }
        req.user = guestUser;
        return next();
      }

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
