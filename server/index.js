import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// Настройка trust proxy для работы с ngrok с ограниченным доверием
// Это позволяет доверять только одному прокси (ngrok) между клиентом и сервером
app.set('trust proxy', 1);

// Get the production URL from environment or use default
const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://25a0-37-15-187-82.ngrok-free.app';
// В режиме разработки разрешаем подключения как с локальных URL, так и с ngrok URL
const CLIENT_URLS = [PRODUCTION_URL, 'http://localhost:5173', 'http://localhost:3000', 'https://25a0-37-15-187-82.ngrok-free.app'];

const io = new Server(server, {
  cors: {
    origin: CLIENT_URLS,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
}));

app.use(cors({
  origin: CLIENT_URLS,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

// Body parsing middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

// In-memory storage for sessions (use Redis in production)
const sessions = new Map();
const users = new Map();

// Session cleanup interval
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastActivity > 24 * 60 * 60 * 1000) { // 24 hours
      sessions.delete(sessionId);
      console.log(`Cleaned up expired session: ${sessionId}`);
    }
  }
}, 60 * 60 * 1000); // Run every hour

// API Routes
app.post('/api/sessions', async (req, res) => {
  try {
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      users: [],
      maxUsers: 50
    };
    
    sessions.set(sessionId, session);
    
    // Generate QR code with PRODUCTION_URL (if available)
    const baseUrl = PRODUCTION_URL || `${req.protocol}://${req.get('host')}`;
    
    const qrUrl = `${baseUrl}/mobile?session=${sessionId}`;
    const qrCode = await QRCode.toDataURL(qrUrl, {
      width: 256,
      margin: 2,
      color: {
        dark: '#1f2937',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'M'
    });
    
    res.json({
      sessionId,
      qrCode,
      qrUrl,
      maxUsers: session.maxUsers
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

app.get('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json({
    sessionId: session.id,
    userCount: session.users.length,
    maxUsers: session.maxUsers,
    createdAt: session.createdAt
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    sessions: sessions.size,
    users: users.size
  });
});

// Serve mobile client
app.get('/mobile', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Catch all handler for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join-session', (data) => {
    const { sessionId, userType = 'viewer', username = 'Anonymous' } = data;
    const session = sessions.get(sessionId);
    
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }
    
    if (session.users.length >= session.maxUsers) {
      socket.emit('error', { message: 'Session is full' });
      return;
    }
    
    // Generate unique user color
    const colors = [
      '#ef4444', '#f97316', '#f59e0b', '#eab308',
      '#84cc16', '#22c55e', '#10b981', '#14b8a6',
      '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
      '#8b5cf6', '#a855f7', '#d946ef', '#ec4899'
    ];
    const userColor = colors[session.users.length % colors.length];
    
    const user = {
      id: socket.id,
      username,
      userType,
      color: userColor,
      x: Math.random() * 800,
      y: Math.random() * 600,
      lastUpdate: Date.now()
    };
    
    session.users.push(user);
    session.lastActivity = Date.now();
    users.set(socket.id, { sessionId, user });
    
    socket.join(sessionId);
    
    // Send current users to the new user
    socket.emit('session-joined', {
      sessionId,
      user,
      users: session.users
    });
    
    // Notify other users
    socket.to(sessionId).emit('user-joined', user);
    
    console.log(`User ${username} joined session ${sessionId}`);
  });
  
  socket.on('cursor-update', (data) => {
    const userSession = users.get(socket.id);
    if (!userSession) return;
    
    const { sessionId, user } = userSession;
    const session = sessions.get(sessionId);
    if (!session) return;
    
    // Validate and sanitize cursor data
    const { x, y, gyroData } = data;
    if (typeof x !== 'number' || typeof y !== 'number') return;
    
    // Update user position
    const userIndex = session.users.findIndex(u => u.id === socket.id);
    if (userIndex !== -1) {
      session.users[userIndex].x = Math.max(0, Math.min(1920, x));
      session.users[userIndex].y = Math.max(0, Math.min(1080, y));
      session.users[userIndex].lastUpdate = Date.now();
      
      // Broadcast to other users in the session
      socket.to(sessionId).emit('cursor-updated', {
        userId: socket.id,
        x: session.users[userIndex].x,
        y: session.users[userIndex].y,
        gyroData
      });
    }
    
    session.lastActivity = Date.now();
  });
  
  socket.on('disconnect', () => {
    const userSession = users.get(socket.id);
    if (userSession) {
      const { sessionId } = userSession;
      const session = sessions.get(sessionId);
      
      if (session) {
        session.users = session.users.filter(u => u.id !== socket.id);
        session.lastActivity = Date.now();
        
        // Notify other users
        socket.to(sessionId).emit('user-left', socket.id);
      }
      
      users.delete(socket.id);
    }
    
    console.log('User disconnected:', socket.id);
  });
  
  // Handle ping for connection health
  socket.on('ping', () => {
    socket.emit('pong');
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Production URL: ${PRODUCTION_URL}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});