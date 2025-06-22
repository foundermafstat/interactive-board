// Загрузка переменных окружения из .env файла
import dotenv from 'dotenv';
dotenv.config();

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

// Константы приложения
const MAX_USERS_PER_SESSION = 10;

const app = express();
const server = createServer(app);

// Настройка trust proxy для работы с ngrok с ограниченным доверием
// Это позволяет доверять только одному прокси (ngrok) между клиентом и сервером
app.set('trust proxy', 1);

// Get the production URL from environment or use default
const PRODUCTION_URL = process.env.PRODUCTION_URL;
// В режиме разработки разрешаем подключения как с локальных URL, так и с ngrok URL
const CLIENT_URLS = [PRODUCTION_URL, 'http://localhost:5173', 'http://localhost:3000'];

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

// Константы для физики
const BALL_RADIUS = 20;
const CURSOR_RADIUS = 15;
const BALL_SPEED_LIMIT = 15;
const FRICTION = 0.98;
const RESTITUTION = 0.8; // Коэффициент упругости при столкновениях
const CURSOR_REPULSION_FORCE = 0.5; // Сила отталкивания между курсорами

// Константы для игры
const GOAL_WIDTH = 100;
const GOAL_HEIGHT = 150;
const GAME_UPDATE_INTERVAL = 16; // ~60fps

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

// Игровая логика - обновление физики шарика и проверка столкновений
function startGameLoop(sessionId) {
  // Создаем интервал для обновления физики игры
  const gameInterval = setInterval(() => {
    const session = sessions.get(sessionId);
    if (!session) {
      // Если сессия была удалена, останавливаем игровой цикл
      clearInterval(gameInterval);
      return;
    }
    
    // Обновляем физику шарика
    updateBallPhysics(session);
    
    // Проверяем столкновения шарика с курсорами пользователей
    checkBallCursorCollisions(session);
    
    // Проверяем столкновения между курсорами
    checkCursorCollisions(session);
    
    // Проверяем попадание шарика в ворота
    checkGoalCollisions(session);
    
    // Отправляем обновленное состояние игры всем клиентам в сессии
    io.to(sessionId).emit('game-state-update', {
      ball: session.ball,
      scores: session.scores,
      gameState: session.gameState
    });
  }, GAME_UPDATE_INTERVAL);
  
  // Сохраняем интервал в сессии, чтобы можно было его очистить при необходимости
  sessions.get(sessionId).gameInterval = gameInterval;
}

// Обновление физики шарика (движение, трение, ограничение скорости)
function updateBallPhysics(session) {
  const { ball } = session;
  
  // Применяем трение (замедление)
  ball.velocityX *= FRICTION;
  ball.velocityY *= FRICTION;
  
  // Если скорость слишком мала, останавливаем движение
  if (Math.abs(ball.velocityX) < 0.1) ball.velocityX = 0;
  if (Math.abs(ball.velocityY) < 0.1) ball.velocityY = 0;
  
  // Ограничиваем максимальную скорость
  const speed = Math.sqrt(ball.velocityX * ball.velocityX + ball.velocityY * ball.velocityY);
  if (speed > BALL_SPEED_LIMIT) {
    const ratio = BALL_SPEED_LIMIT / speed;
    ball.velocityX *= ratio;
    ball.velocityY *= ratio;
  }
  
  // Перемещаем шарик
  ball.x += ball.velocityX;
  ball.y += ball.velocityY;
  
  // Проверка столкновений с краями доски
  // Левый край
  if (ball.x - ball.radius < 0) {
    ball.x = ball.radius;
    ball.velocityX = -ball.velocityX * RESTITUTION;
  }
  // Правый край
  if (ball.x + ball.radius > 1920) {
    ball.x = 1920 - ball.radius;
    ball.velocityX = -ball.velocityX * RESTITUTION;
  }
  // Верхний край
  if (ball.y - ball.radius < 0) {
    ball.y = ball.radius;
    ball.velocityY = -ball.velocityY * RESTITUTION;
  }
  // Нижний край
  if (ball.y + ball.radius > 1080) {
    ball.y = 1080 - ball.radius;
    ball.velocityY = -ball.velocityY * RESTITUTION;
  }
}

// Проверка столкновений шарика с курсорами пользователей
function checkBallCursorCollisions(session) {
  const { ball, users } = session;
  
  for (const user of users) {
    // Пропускаем пользователей типа 'display'
    if (user.userType === 'display') continue;
    
    // Вычисляем расстояние между центром шарика и курсором
    const dx = ball.x - user.x;
    const dy = ball.y - user.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Если расстояние меньше суммы радиусов, произошло столкновение
    if (distance < ball.radius + CURSOR_RADIUS) {
      // Записываем ID последнего касавшегося пользователя
      ball.lastTouchedBy = user.id;
      ball.lastTouchTime = Date.now();
      
      // Вычисляем направление отталкивания
      const angle = Math.atan2(dy, dx);
      
      // Сила удара зависит от того, насколько сильно перекрываются объекты
      const overlap = (ball.radius + CURSOR_RADIUS) - distance;
      const force = Math.min(overlap * 0.05, 1.5); // Ограничиваем силу удара
      
      // Применяем силу к скорости шарика
      ball.velocityX = Math.cos(angle) * force * BALL_SPEED_LIMIT;
      ball.velocityY = Math.sin(angle) * force * BALL_SPEED_LIMIT;
    }
  }
}

// Проверка столкновений между курсорами для их отталкивания друг от друга
function checkCursorCollisions(session) {
  const { users } = session;
  
  // Временное хранилище для новых позиций курсоров
  const newPositions = new Map();
  
  // Проверяем каждую пару курсоров
  for (let i = 0; i < users.length; i++) {
    const user1 = users[i];
    if (user1.userType === 'display') continue; // Пропускаем доски
    
    let offsetX = 0;
    let offsetY = 0;
    
    for (let j = 0; j < users.length; j++) {
      if (i === j) continue; // Пропускаем самого себя
      
      const user2 = users[j];
      if (user2.userType === 'display') continue; // Пропускаем доски
      
      // Вычисляем расстояние между курсорами
      const dx = user1.x - user2.x;
      const dy = user1.y - user2.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Если курсоры достаточно близко, они отталкиваются
      if (distance < CURSOR_RADIUS * 2) {
        // Вычисляем направление отталкивания
        const angle = Math.atan2(dy, dx);
        const force = CURSOR_REPULSION_FORCE * (1 - distance / (CURSOR_RADIUS * 2));
        
        // Добавляем смещение для курсора
        offsetX += Math.cos(angle) * force;
        offsetY += Math.sin(angle) * force;
      }
    }
    
    // Сохраняем новую позицию с учетом отталкивания
    if (offsetX !== 0 || offsetY !== 0) {
      newPositions.set(user1.id, {
        x: Math.max(0, Math.min(1920, user1.x + offsetX)),
        y: Math.max(0, Math.min(1080, user1.y + offsetY))
      });
    }
  }
  
  // Применяем новые позиции и отправляем их клиентам
  for (const [userId, position] of newPositions) {
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      users[userIndex].x = position.x;
      users[userIndex].y = position.y;
      
      // Отправляем обновленную позицию курсора
      io.to(session.id).emit('cursor-updated', {
        userId,
        x: position.x,
        y: position.y
      });
    }
  }
}

// Проверка попадания шарика в ворота
function checkGoalCollisions(session) {
  const { ball, goals, scores, gameState } = session;
  
  for (const goal of goals) {
    // Проверяем, находится ли шарик в области ворот
    if (ball.x - ball.radius < goal.x + goal.width &&
        ball.x + ball.radius > goal.x &&
        ball.y - ball.radius < goal.y + goal.height &&
        ball.y + ball.radius > goal.y) {
      
      // Гол!
      gameState.inPlay = false;
      gameState.lastGoal = goal.side;
      
      // Определяем, кто забил гол
      const scoringPlayer = ball.lastTouchedBy;
      
      // Если известно, кто последний касался мяча, начисляем ему очки
      if (scoringPlayer) {
        if (!scores[scoringPlayer]) {
          scores[scoringPlayer] = 0;
        }
        scores[scoringPlayer] += 1;
        
        // Получаем имя игрока
        const player = session.users.find(u => u.id === scoringPlayer);
        const playerName = player ? player.username : 'Unknown Player';
        
        gameState.goalMessage = `${playerName} забил гол в ${goal.side === 'left' ? 'левые' : 'правые'} ворота!`;
      } else {
        gameState.goalMessage = `Гол в ${goal.side === 'left' ? 'левые' : 'правые'} ворота!`;
      }
      
      // Отправляем сообщение о голе всем клиентам
      io.to(session.id).emit('goal', {
        goalSide: goal.side,
        scoringPlayer,
        message: gameState.goalMessage,
        scores
      });
      
      // Возвращаем шарик в центр с нулевой скоростью
      setTimeout(() => {
        if (sessions.has(session.id)) {
          ball.x = 960;
          ball.y = 540;
          ball.velocityX = 0;
          ball.velocityY = 0;
          ball.lastTouchedBy = null;
          gameState.inPlay = true;
          gameState.goalMessage = '';
          
          // Сообщаем всем о продолжении игры
          io.to(session.id).emit('game-resume', { ball });
        }
      }, 2000); // Пауза 2 секунды перед продолжением
      
      // Прерываем проверку других ворот
      break;
    }
  }
}

// API Routes
app.post('/api/sessions', async (req, res) => {
  try {
    const sessionId = uuidv4();
    const maxUsers = MAX_USERS_PER_SESSION;
    
    // Создаем шарик в центре доски
    const ball = {
      id: 'ball',
      x: 960, // Центр доски по X
      y: 540, // Центр доски по Y
      radius: BALL_RADIUS,
      velocityX: 0,
      velocityY: 0,
      lastTouchedBy: null, // ID последнего игрока, коснувшегося шарика
      lastTouchTime: 0
    };
    
    // Создаем двое ворот (слева и справа)
    const leftGoal = {
      id: 'leftGoal',
      type: 'goal',
      side: 'left',
      x: 0,
      y: 540 - GOAL_HEIGHT/2,
      width: GOAL_WIDTH,
      height: GOAL_HEIGHT
    };
    
    const rightGoal = {
      id: 'rightGoal',
      type: 'goal',
      side: 'right',
      x: 1920 - GOAL_WIDTH,
      y: 540 - GOAL_HEIGHT/2,
      width: GOAL_WIDTH,
      height: GOAL_HEIGHT
    };
    
    const session = {
      id: sessionId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      users: [],
      elements: [],
      maxUsers,
      // Игровые объекты
      ball,
      goals: [leftGoal, rightGoal],
      scores: {}, // Счет игры: userId -> score
      gameState: {
        inPlay: true,
        lastGoal: null,
        goalMessage: ''
      }
    };
    
    sessions.set(sessionId, session);
    
    // Запускаем игровой цикл для этой сессии
    startGameLoop(sessionId);
    
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
    
    const currentSession = sessions.get(sessionId);
    
    res.json({
      sessionId,
      qrCode,
      qrUrl,
      maxUsers: currentSession.maxUsers
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
    const { sessionId, username, userType } = data;
    
    console.log(`Попытка присоединения к сессии ${sessionId}, пользователь: ${username}, тип: ${userType}, Socket ID: ${socket.id}`);
    
    // Validate session
    const session = sessions.get(sessionId);
    if (!session) {
      console.error(`Сессия ${sessionId} не найдена!`);
      socket.emit('error', { message: 'Session not found' });
      return;
    }
    
    console.log(`Найдена сессия ${sessionId}, текущие пользователи: ${session.users.length}`);
    
    // Проверяем, если пользователь уже подключен
    const existingUserIndex = session.users.findIndex(u => u.id === socket.id);
    if (existingUserIndex !== -1) {
      console.log(`Пользователь с ID ${socket.id} уже существует в сессии, обновляем информацию`);
      // Удаляем старого пользователя
      session.users.splice(existingUserIndex, 1);
    }
    
    // Проверяем, не пробует ли пользователь подключиться еще раз с другим именем или типом
    const oldUserSession = users.get(socket.id);
    if (oldUserSession) {
      console.log(`Найдена старая ассоциация сокета, удаляем её`);
      users.delete(socket.id);
    }
    
    // Create a color for the user
    const colors = ['#FF5252', '#4CAF50', '#2196F3', '#FFC107', '#9C27B0', '#00BCD4', '#FF9800', '#673AB7', '#795548', '#009688'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    // Create user object
    const user = {
      id: socket.id,
      username: username || `User ${socket.id.substring(0, 4)}`,
      userType,
      color,
      x: 960, // Center X
      y: 540, // Center Y
      lastUpdate: Date.now()
    };
    
    // Add user to session
    session.users.push(user);
    
    // Associate socket with session
    users.set(socket.id, { sessionId, user });
    
    // Join socket room for this session
    socket.join(sessionId);
    
    // Send session data to the user
    socket.emit('session-joined', {
      session: {
        id: session.id,
        users: session.users.length
      },
      users: session.users,
      elements: session.elements,
      user
    });
    
    // Notify other users
    socket.to(sessionId).emit('user-joined', user);
    
    console.log(`Пользователь ${username} (${socket.id}) присоединился к сессии ${sessionId}. Всего пользователей: ${session.users.length}`);
    console.log(`Текущие пользователи в сессии: ${session.users.map(u => `${u.username}(${u.id})`).join(', ')}`);
  });
  
  socket.on('cursor-update', (data) => {
    const userSession = users.get(socket.id);
    if (!userSession) {
      console.log(`Не найдена сессия пользователя для socket.id: ${socket.id}`);
      return;
    }
    
    const { sessionId, user } = userSession;
    const session = sessions.get(sessionId);
    if (!session) {
      console.log(`Не найдена сессия ${sessionId}`);
      return;
    }
    
    // Validate and sanitize cursor data
    const { x, y, gyroData } = data;
    
    if (typeof x !== 'number' || typeof y !== 'number') {
      console.log(`Неверный формат координат: x=${typeof x}, y=${typeof y}`);
      return;
    }
    
    // Ограничиваем журналирование, чтобы не перегружать консоль
    if (Math.random() < 0.01) {
      console.log(`Получено событие cursor-update для пользователя ${user.username} в сессии ${sessionId}: x=${x}, y=${y}`);
    }
    
    // Update user position
    const userIndex = session.users.findIndex(u => u.id === socket.id);
    
    if (userIndex !== -1) {
      // Централизованная обработка позиции курсора на сервере
      const sanitizedX = Math.max(0, Math.min(1920, x));
      const sanitizedY = Math.max(0, Math.min(1080, y));
      
      // Проверяем, изменилась ли позиция существенно, чтобы избежать излишних обновлений
      const prevX = session.users[userIndex].x;
      const prevY = session.users[userIndex].y;
      const movementThreshold = 1; // Минимальное расстояние для обновления
      
      if (Math.abs(sanitizedX - prevX) > movementThreshold || Math.abs(sanitizedY - prevY) > movementThreshold) {
        // Обновляем позицию только при существенном изменении
        session.users[userIndex].x = sanitizedX;
        session.users[userIndex].y = sanitizedY;
        session.users[userIndex].lastUpdate = Date.now();
        
        // Сохраняем данные гироскопа для возможных дальнейших вычислений
        if (gyroData) {
          session.users[userIndex].gyroData = gyroData;
        }
        
        // Отправляем обновленные данные ВСЕМ пользователям в сессии (включая отправителя)
        io.to(sessionId).emit('cursor-updated', {
          userId: socket.id,
          x: session.users[userIndex].x,
          y: session.users[userIndex].y,
          gyroData
        });
        
        if (Math.random() < 0.01) {
          console.log(`Отправлено событие cursor-updated для всех клиентов в сессии ${sessionId}`);
        }
      }
    } else {
      console.log(`Не найден пользователь с id=${socket.id} в сессии ${sessionId}`);      
      // Попытка автоматического восстановления
      console.log(`Попытка автоматического восстановления пользователя в сессии`);
      socket.emit('reconnect-required', { sessionId });
    }
    
    session.lastActivity = Date.now();
  });
  
  // Создание элемента на доске
  socket.on('create-element', (data) => {
    const userSession = users.get(socket.id);
    if (!userSession) return;
    
    const { sessionId, user } = userSession;
    const session = sessions.get(sessionId);
    if (!session) return;
    
    // Валидация данных элемента
    const { type, x, y, width, height, color, text, userId } = data;
    if (!type || typeof x !== 'number' || typeof y !== 'number') return;
    
    // Создание элемента с уникальным ID
    const elementId = uuidv4();
    const newElement = {
      id: elementId,
      type,
      x: Math.max(0, Math.min(1920, x)),
      y: Math.max(0, Math.min(1080, y)),
      width: width || 100,
      height: height || 100,
      color: color || '#ffffff',
      text: text || '',
      createdBy: socket.id,
      createdAt: Date.now()
    };
    
    // Добавление элемента в сессию
    if (!session.elements) {
      session.elements = [];
    }
    session.elements.push(newElement);
    
    // Отправка всем пользователям в сессии, включая отправителя
    io.to(sessionId).emit('element-created', newElement);
    
    session.lastActivity = Date.now();
  });
  
  // Обновление элемента на доске
  socket.on('update-element', (data) => {
    const userSession = users.get(socket.id);
    if (!userSession) return;
    
    const { sessionId, user } = userSession;
    const session = sessions.get(sessionId);
    if (!session || !session.elements) return;
    
    // Валидация данных
    const { id, ...updateData } = data;
    if (!id) return;
    
    // Поиск элемента для обновления
    const elementIndex = session.elements.findIndex(e => e.id === id);
    if (elementIndex === -1) return;
    
    // Обновление элемента
    const updatedElement = {
      ...session.elements[elementIndex],
      ...updateData,
      x: updateData.x !== undefined ? Math.max(0, Math.min(1920, updateData.x)) : session.elements[elementIndex].x,
      y: updateData.y !== undefined ? Math.max(0, Math.min(1080, updateData.y)) : session.elements[elementIndex].y,
      updatedAt: Date.now()
    };
    
    session.elements[elementIndex] = updatedElement;
    
    // Отправка всем пользователям в сессии
    io.to(sessionId).emit('element-updated', updatedElement);
    
    session.lastActivity = Date.now();
  });
  
  // Удаление элемента с доски
  socket.on('delete-element', (data) => {
    const userSession = users.get(socket.id);
    if (!userSession) return;
    
    const { sessionId, user } = userSession;
    const session = sessions.get(sessionId);
    if (!session || !session.elements) return;
    
    // Валидация данных
    const { id } = data;
    if (!id) return;
    
    // Удаление элемента
    session.elements = session.elements.filter(e => e.id !== id);
    
    // Отправка всем пользователям в сессии
    io.to(sessionId).emit('element-deleted', { id });
    
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