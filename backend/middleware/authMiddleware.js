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
    try {
      // Find the first user in the system to act as a "Developer Guest"
      const guestUser = await User.findOne();
      if (guestUser) {
         req.user = guestUser;
         return next();
      } else {
         // Automatically create a default Admin Guest if database is brand new and empty
         const defaultGuest = await User.create({
           name: "Admin Guest",
           email: "guest@documind.ai",
           password: "password123"
         });
         req.user = defaultGuest;
         return next();
      }
    } catch (dbError) {
      console.error("Database connection failed in bypass token middleware:", dbError);
      return res.status(500).json({ 
        message: "Database connection failed. Please check your MONGO_URI in Vercel settings and ensure your MongoDB Atlas IP Access List (whitelist) allows connection (0.0.0.0/0).", 
        error: dbError.message 
      });
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
