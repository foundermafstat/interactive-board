import React, { useEffect, useRef, useState } from 'react';
import { Users, Wifi, WifiOff, Home, QrCode, Menu, X, Info } from 'lucide-react';
import ProductionQRGenerator from './ProductionQRGenerator';
import type { Socket } from 'socket.io-client';

// Типы элементов
interface BoardElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  text?: string;
  createdBy: string;
  createdAt: number;
  updatedAt?: number;
}

interface User {
  id: string;
  username: string;
  userType: string;
  color: string;
  x: number;
  y: number;
  lastUpdate: number;
}

// Расширенный тип для пользователя с данными анимации
interface EnhancedUser extends User {
  // Текущие отображаемые координаты (для плавного движения)
  currentX: number;
  currentY: number;
  // Целевые координаты (куда движется курсор)
  targetX: number;
  targetY: number;
  // Флаг замедления (когда курсор в области)
  isInArea: boolean;
  // Скорость движения курсора
  speed: number;
}

interface MainDisplayProps {
  sessionId: string | null;
  socket: Socket | null;
}

const MainDisplay: React.FC<MainDisplayProps> = ({ sessionId, socket }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [users, setUsers] = useState<User[]>([]);
  // Модифицированный массив пользователей с данными анимации
  const [enhancedUsers, setEnhancedUsers] = useState<EnhancedUser[]>([]);
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<'qrcode' | 'players' | 'system'>('qrcode');
  
  // Константы для движения курсора
  const CURSOR_BASE_SPEED = 0.1; // Базовая скорость движения
  const CURSOR_SLOW_FACTOR = 0.4; // Коэффициент замедления в областях

  useEffect(() => {
    if (!socket || !sessionId) return;

    // Join the session as a display
    socket.emit('join-session', {
      sessionId,
      userType: 'display',
      username: 'Main Display'
    });

    // Socket event listeners
    socket.on('session-joined', (data) => {
      setUsers(data.users);
      setIsConnected(true);
    });

    socket.on('user-joined', (user) => {
      setUsers(prev => [...prev, user]);
    });

    socket.on('user-left', (userId) => {
      setUsers(prev => prev.filter(u => u.id !== userId));
    });
    
    // Обработчики событий для элементов на доске
    socket.on('session-joined', (data) => {
      if (data.elements) {
        setElements(data.elements);
      }
    });
    
    socket.on('element-created', (element) => {
      setElements(prev => [...prev, element]);
    });
    
    socket.on('element-updated', (updatedElement) => {
      setElements(prev => prev.map(elem => 
        elem.id === updatedElement.id ? updatedElement : elem
      ));
    });
    
    socket.on('element-deleted', (data) => {
      setElements(prev => prev.filter(elem => elem.id !== data.id));
    });

    socket.on('cursor-updated', (data) => {
      console.log(`Получено событие cursor-updated от пользователя ${data.userId}: x=${data.x}, y=${data.y}`);
      
      // Диагностика - проверка всех пользователей в сессии
      console.log(`Текущие пользователи: ${users.map(u => `${u.username}(${u.id})`).join(', ')}`);
      
      // Стандартное обновление пользователей
      setUsers(prev => {
        const updated = prev.map(user => 
          user.id === data.userId 
            ? { ...user, x: data.x, y: data.y, lastUpdate: Date.now() }
            : user
        );
        
        // Проверка, был ли обновлен пользователь
        const userUpdated = updated.some(u => u.id === data.userId);
        if (!userUpdated) {
          console.warn(`Пользователь с ID ${data.userId} не найден в списке пользователей`);
        }
        
        return updated;
      });
      
      // Обновление enhancedUsers - здесь устанавливаем целевые координаты для плавного движения
      setEnhancedUsers(prev => {
        const userIndex = prev.findIndex(u => u.id === data.userId);
        
        if (userIndex >= 0) {
          // Пользователь существует в массиве enhancedUsers
          const updatedUsers = [...prev];
          updatedUsers[userIndex] = {
            ...updatedUsers[userIndex],
            targetX: data.x,
            targetY: data.y,
            lastUpdate: Date.now()
          };
          return updatedUsers;
        } else {
          // Пользователь не найден - ищем его в обычном массиве users
          const standardUser = users.find(u => u.id === data.userId);
          if (standardUser) {
            // Создаем нового enhanced пользователя
            return [...prev, {
              ...standardUser,
              currentX: standardUser.x,
              currentY: standardUser.y,
              targetX: data.x,
              targetY: data.y,
              isInArea: false,
              speed: CURSOR_BASE_SPEED,
              lastUpdate: Date.now()
            }];
          }
          return prev;
        }
      });
    });

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    return () => {
      socket.off('session-joined');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('cursor-updated');
      socket.off('connect');
      socket.off('disconnect');
      
      // Отключение обработчиков событий элементов
      socket.off('element-created');
      socket.off('element-updated');
      socket.off('element-deleted');
    };
  }, [socket, sessionId, users]);

  // Canvas rendering
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle resize
    const resize = () => {
      if (canvas) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
      }
    };

    resize();
    window.addEventListener('resize', resize);

    // Функция для проверки, находится ли курсор внутри области (area)
    const isInAreaElement = (x: number, y: number): boolean => {
      // Проверяем все элементы типа 'area'
      return elements.some(element => {
        if (element.type !== 'area') return false;
        
        // Проверяем, находится ли точка в пределах области
        return x >= element.x && x <= element.x + element.width &&
               y >= element.y && y <= element.y + element.height;
      });
    };
    
    // Функция для обновления текущего положения курсоров с плавной анимацией
    const updateCursorPositions = () => {
      setEnhancedUsers(prevUsers => {
        return prevUsers.map(user => {
          // Прерываем обновление для пользователей типа display
          if (user.userType === 'display') return user;
          
          // Проверяем, находится ли курсор в области (area)
          const inArea = isInAreaElement(user.currentX, user.currentY);
          
          // Вычисляем скорость движения - замедляем, если курсор в области
          const speed = inArea ? CURSOR_BASE_SPEED * CURSOR_SLOW_FACTOR : CURSOR_BASE_SPEED;
          
          // Вычисляем вектор движения к цели
          const dx = user.targetX - user.currentX;
          const dy = user.targetY - user.currentY;
          
          // Расстояние до цели
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // Если курсор близко к цели - устанавливаем его точно в цель
          if (distance < speed) {
            return {
              ...user,
              currentX: user.targetX,
              currentY: user.targetY,
              isInArea: inArea
            };
          }
          
          // Иначе - двигаем курсор в направлении цели с заданной скоростью
          const vx = (dx / distance) * speed;
          const vy = (dy / distance) * speed;
          
          return {
            ...user,
            currentX: user.currentX + vx,
            currentY: user.currentY + vy,
            isInArea: inArea,
            speed: speed
          };
        });
      });
    };

    // Animation loop
    const animate = () => {
      // Обновляем позиции курсоров
      updateCursorPositions();
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw grid pattern
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      const gridSize = 50;
      
      for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      
      for (let y = 0; y <= canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
      
      // Отрисовка элементов на доске
      elements.forEach(element => {
        const x = (element.x / 1920) * canvas.width;
        const y = (element.y / 1080) * canvas.height;
        const width = (element.width / 1920) * canvas.width;
        const height = (element.height / 1080) * canvas.height;
        
        ctx.fillStyle = element.color;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        
        switch (element.type) {
          case 'rect':
            // Отрисовка прямоугольника
            ctx.fillRect(x, y, width, height);
            ctx.strokeRect(x, y, width, height);
            break;
            
          case 'circle':
            // Отрисовка круга
            ctx.beginPath();
            ctx.arc(x + width/2, y + height/2, Math.min(width, height)/2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            break;
            
          case 'area':
            // Отрисовка полупрозрачной области
            ctx.globalAlpha = 0.3; // Уменьшаем прозрачность
            ctx.fillRect(x, y, width, height);
            ctx.globalAlpha = 0.6;
            ctx.strokeRect(x, y, width, height);
            ctx.globalAlpha = 1.0; // Возвращаем обычную прозрачность
            break;
            
          case 'text':
            if (element.text) {
              // Отрисовка текста
              ctx.fillStyle = element.color;
              ctx.font = '24px Arial';
              ctx.fillText(element.text, x, y + 24);
            }
            break;
            
          default:
            // Неизвестный тип элемента - просто отрисовываем прямоугольник
            ctx.fillRect(x, y, width, height);
            ctx.strokeRect(x, y, width, height);
            break;
        }
      });
      
      // Отрисовка курсоров пользователей - используем enhancedUsers вместо users
      enhancedUsers.forEach(user => {
        // Пропускаем пользователей типа display
        if (user.userType === 'display') return;
        
        // Используем текущие позиции для анимации
        const x = (user.currentX / 1920) * canvas.width;
        const y = (user.currentY / 1080) * canvas.height;
        
        // Индикатор замедления для курсоров в области
        if (user.isInArea) {
          ctx.beginPath();
          ctx.arc(x, y, 20, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 0, 0.4)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        
        // Shadow effect
        ctx.beginPath();
        ctx.arc(x, y + 2, 15, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fill();
        
        // Cursor body
        ctx.fillStyle = user.color;
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fill();
        
        // Cursor border
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Username label
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(x - 40, y - 40, 80, 25);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(user.username, x, y - 25);
      });
      
      // Подсчитаем количество контроллеров для отладки
      const controllerCount = users.filter(u => u.userType !== 'display').length;
      if (controllerCount === 0 && Math.random() < 0.05) {
        console.warn('Нет пользователей-контроллеров для отрисовки курсоров!');
      }
      
      users.forEach(user => {
        if (user.userType === 'display') return;
        
        const x = (user.x / 1920) * canvas.width;
        const y = (user.y / 1080) * canvas.height;
        
        // Делаем курсор более заметным
        
        // Большое внешнее кольцо (для лучшей видимости)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.fill();
        
        // Cursor shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.arc(x + 2, y + 2, 15, 0, Math.PI * 2);
        ctx.fill();
        
        // Cursor body (увеличили размер)
        ctx.fillStyle = user.color;
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fill();
        
        // Cursor border
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Username label (увеличили размер)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(x - 40, y - 40, 80, 25);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(user.username, x, y - 25);
      });
      
      requestAnimationFrame(animate);
    };

    animate();
    
    return () => {
      window.removeEventListener('resize', resize);
    };
  }, [elements, users]);

  const goHome = () => {
    if (socket) {
      socket.disconnect();
    }
    window.location.href = '/';
  };

  return (
    <div className="flex flex-col h-screen w-full bg-gradient-to-br from-slate-900 to-slate-800 text-white overflow-hidden">
      {/* Минималистичный хедер */}
      <header className="border-b border-white/10 py-2 px-4 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <button 
            onClick={goHome} 
            className="bg-white/10 hover:bg-white/20 rounded-lg p-2 transition-colors"
            title="Go Home"
          >
            <Home className="w-4 h-4" />
          </button>
          
          <h1 className="text-lg font-semibold">
            Interactive Board
            {sessionId && (
              <span className="ml-2 text-xs font-normal text-blue-400">
                #{sessionId.slice(0, 6)}
              </span>
            )}
          </h1>
        </div>
        
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-400 mr-1">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
          {isConnected ? 
            <Wifi className="w-4 h-4 text-green-400" /> : 
            <WifiOff className="w-4 h-4 text-red-400" />
          }
          
          {/* Кнопка открытия меню */}
          <button 
            onClick={() => setShowMenu(true)}
            className="bg-white/10 hover:bg-white/20 rounded-lg p-2 ml-2 transition-colors"
            title="Open Menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Основная часть - доска на весь экран */}
      <main className="flex-1 p-2">
        <div className="h-full bg-black/20 backdrop-blur-lg rounded-xl border border-white/10 overflow-hidden relative">
          <canvas
            ref={canvasRef}
            className="w-full h-full"
          />
          
          {users.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">Waiting for users...</h3>
                <p className="text-gray-300">
                  Open menu <Menu className="w-4 h-4 inline" /> to scan QR code
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Полупрозрачная панель-оверлей для затемнения доски */}
      {showMenu && (
        <div 
          className="fixed inset-0 bg-black/50 z-10" 
          onClick={() => setShowMenu(false)}
          aria-hidden="true"
        />
      )}
      
      {/* Выдвижное меню */}
      <div 
        className={`fixed top-0 right-0 h-full w-80 bg-slate-800/90 backdrop-blur-md border-l border-white/10 shadow-lg transform transition-transform duration-300 ease-in-out overflow-y-auto z-20 ${showMenu ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="p-3 flex justify-between items-center border-b border-white/10">
          <h2 className="font-semibold text-lg">Menu</h2>
          <button 
            onClick={() => setShowMenu(false)}
            className="bg-white/10 hover:bg-white/20 rounded-lg p-2 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Табы */}
        <div className="border-b border-white/10">
          <div className="flex">
            <button
              onClick={() => setActiveTab('qrcode')}
              className={`flex items-center space-x-1 px-4 py-2 transition-colors ${activeTab === 'qrcode' ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-400 hover:text-white'}`}
            >
              <QrCode className="w-4 h-4" />
              <span className="text-sm font-medium">QR Code</span>
            </button>
            <button
              onClick={() => setActiveTab('players')}
              className={`flex items-center space-x-1 px-4 py-2 transition-colors ${activeTab === 'players' ? 'border-b-2 border-green-500 text-green-400' : 'text-gray-400 hover:text-white'}`}
            >
              <Users className="w-4 h-4" />
              <span className="text-sm font-medium">Players</span>
            </button>
            <button
              onClick={() => setActiveTab('system')}
              className={`flex items-center space-x-1 px-4 py-2 transition-colors ${activeTab === 'system' ? 'border-b-2 border-purple-500 text-purple-400' : 'text-gray-400 hover:text-white'}`}
            >
              <Info className="w-4 h-4" />
              <span className="text-sm font-medium">Status</span>
            </button>
          </div>
        </div>

        <div className="p-4 max-h-[calc(100vh-140px)] overflow-y-auto">
          {/* QR Code Tab */}
          {activeTab === 'qrcode' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 mb-1">
                <QrCode className="w-5 h-5 text-blue-400" />
                <h3 className="font-semibold">QR Code</h3>
              </div>
              
              {sessionId && (
                <ProductionQRGenerator sessionId={sessionId} />
              )}
            </div>
          )}

          {/* Connected Players Tab */}
          {activeTab === 'players' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 mb-3">
                <Users className="w-5 h-5 text-green-400" />
                <h3 className="font-semibold">Connected Players</h3>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between text-xs text-gray-400 px-2">
                  <span>Player</span>
                  <span>Type</span>
                </div>
                
                <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto bg-white/10 rounded-lg p-3">
                  {users.filter(u => u.userType !== 'display').map(user => (
                    <div key={user.id} className="flex items-center space-x-2 text-sm p-2 hover:bg-white/5 rounded-lg">
                      <div 
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: user.color }}
                      />
                      <span className="text-white flex-1">{user.username}</span>
                      <span className="text-gray-400 text-xs bg-white/10 px-2 py-1 rounded">{user.userType}</span>
                    </div>
                  ))}
                  {users.filter(u => u.userType !== 'display').length === 0 && (
                    <p className="text-gray-400 text-center py-8">
                      No players connected yet.<br />
                      <span className="text-xs block mt-2">Use the QR code to add players</span>
                    </p>
                  )}
                </div>
                
                <div className="flex justify-between text-xs text-gray-400 mt-2 p-2 bg-blue-500/10 rounded-lg">
                  <span>Total Players:</span>
                  <span>{users.filter(u => u.userType !== 'display').length}</span>
                </div>
              </div>
            </div>
          )}

          {/* System Status Tab */}
          {activeTab === 'system' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 mb-3">
                <Info className="w-5 h-5 text-purple-400" />
                <h3 className="font-semibold">System Status</h3>
              </div>
              
              <div className="space-y-3 bg-white/10 rounded-lg p-4">
                <div className="flex justify-between items-center p-2 border-b border-white/10 pb-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-300">WebSocket:</span>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-2 border-b border-white/10 pb-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-300">Session ID:</span>
                  </div>
                  <span className="text-blue-300 font-mono text-xs bg-blue-500/10 px-2 py-1 rounded">
                    {sessionId?.slice(0, 8)}...
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-2 border-b border-white/10 pb-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-300">Active Users:</span>
                  </div>
                  <span className="text-white bg-white/10 px-2 py-1 rounded text-xs">
                    {users.filter(u => u.userType !== 'display').length}
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-300">Elements:</span>
                  </div>
                  <span className="text-white bg-white/10 px-2 py-1 rounded text-xs">
                    {elements.length}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>


    </div>
  );
};

export default MainDisplay;