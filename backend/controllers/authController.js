const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please add all fields' });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password, // Pre-save middleware will hash it
    });

    if (user) {
      res.status(201).json({
        _id: user.id,
        name: user.name,
        email: user.email,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for user email
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user.id,
        name: user.name,
        email: user.email,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete guest user data (documents, chat history, vectors, and user record)
// @route   DELETE /api/auth/guest
// @access  Private
const deleteGuestData = async (req, res) => {
  try {
    const user = req.user;

    // Verify it is a guest user
    if (!user || !user.email.endsWith('@documind.guest')) {
      return res.status(400).json({ message: 'Only guest accounts can be reset.' });
    }

    const userId = user._id;
    const userNamespace = `user_${userId}`;

    // 1. Delete vectors from Pinecone
    try {
      if (process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX_NAME) {
        const { Pinecone } = require('@pinecone-database/pinecone');
        const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
        const index = pc.index(process.env.PINECONE_INDEX_NAME);
        await index.namespace(userNamespace).deleteAll();
        console.log(`Successfully deleted Pinecone vectors for namespace: ${userNamespace}`);
      }
    } catch (vectorErr) {
      console.error('Failed to delete vectors from Pinecone:', vectorErr.message);
      // Continue deleting database records anyway
    }

    // 2. Delete Documents from MongoDB
    const Document = require('../models/Document');
    const deletedDocs = await Document.deleteMany({ user: userId });
    console.log(`Deleted ${deletedDocs.deletedCount} documents for guest user ${userId}`);

    // 3. Delete Chat Sessions and Messages
    const ChatSession = require('../models/ChatSession');
    const Message = require('../models/Message');
    const chatSessions = await ChatSession.find({ user: userId });
    const sessionIds = chatSessions.map(session => session._id);

    const deletedMessages = await Message.deleteMany({ chatSession: { $in: sessionIds } });
    const deletedSessions = await ChatSession.deleteMany({ user: userId });
    console.log(`Deleted ${deletedMessages.deletedCount} messages and ${deletedSessions.deletedCount} chat sessions for guest user ${userId}`);

    // 4. Delete the guest User document itself
    const User = require('../models/User');
    await User.findByIdAndDelete(userId);
    console.log(`Deleted user record for guest ${userId}`);

    res.status(200).json({ message: 'Guest session data completely cleared' });
  } catch (error) {
    console.error('Error during guest data deletion:', error);
    res.status(500).json({ message: error.message || 'Error deleting guest data' });
  }
};

module.exports = {
  registerUser,
  loginUser,
  deleteGuestData,
};
