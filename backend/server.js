require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const { execSync } = require('child_process');

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/chat', require('./routes/chat'));

const PORT = process.env.PORT || 5000;

// Function to clear port if in use (Windows specific fix for Nodemon ghost processes)
const clearPort = (port) => {
  try {
    const stdout = execSync(`netstat -ano | findstr :${port}`).toString();
    const lines = stdout.trim().split('\n');
    if (lines.length > 0) {
      // Find the line with LISTEN or actual PID for the port
      const targetLine = lines.find(l => l.includes('LISTENING')) || lines[0];
      const pid = targetLine.trim().split(/\s+/).pop();
      if (pid && pid !== '0') {
        process.stdout.write(`>>> [STABILITY] Port ${port} is occupied by PID ${pid}. Forcing clear...\n`);
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        // Synchronous pause to let OS recover (Windows wait)
        const wait = Date.now() + 2500;
        while (Date.now() < wait) {}
        process.stdout.write(`>>> [STABILITY] Port ${port} recovered.\n`);
      }
    }
  } catch (err) {
    // Port not in use or netstat failed (which is fine)
  }
};

if (process.env.NODE_ENV !== 'production') {
  clearPort(PORT);
}

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`MongoDB Connected: localhost`);
});

// Handle graceful shutdown for all common signals
const shutdown = (signal) => {
  console.log(`>>> [SHUTDOWN] Signal ${signal} received. Closing HTTP server...`);
  server.close(() => {
    console.log(`>>> [SHUTDOWN] HTTP server closed.`);
    process.exit(0);
  });
};

['SIGTERM', 'SIGINT', 'SIGUSR1', 'SIGUSR2'].forEach(sig => {
  process.on(sig, () => shutdown(sig));
});
