import React, { useState, useEffect } from 'react';
import { Smartphone, Wifi, WifiOff, Home, AlertCircle, Square, Circle, Type, Minus, Plus, X, Check, Target } from 'lucide-react';
import type { Socket } from 'socket.io-client';

// Определяем интерфейс для DeviceOrientationEvent с поддержкой iOS requestPermission
interface DeviceOrientationEventWithPermission {
  requestPermission?: () => Promise<string>;
}

interface MobileControllerProps {
  sessionId: string | null;
  socket: Socket | null;
}

const MobileController: React.FC<MobileControllerProps> = ({ sessionId, socket }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [username, setUsername] = useState('');
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');
  const [gyroSupported, setGyroSupported] = useState(false);
  const [gyroPermission, setGyroPermission] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [userColor] = useState('#3b82f6');
  
  // Состояние для создания элементов и областей
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [elementType, setElementType] = useState<'rect' | 'circle' | 'text' | 'line' | 'area'>('rect');
  const [elementText, setElementText] = useState('');
  const [elementColor, setElementColor] = useState('#ffffff');
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });

  // Gyroscope state
  const [orientation, setOrientation] = useState({ alpha: 0, beta: 0, gamma: 0 });
  const [calibration, setCalibration] = useState({ beta: 0, gamma: 0 });

  useEffect(() => {
    // Check for gyroscope support
    if (typeof DeviceOrientationEvent !== 'undefined') {
      setGyroSupported(true);
    }

    // Get session from URL if not provided
    if (!sessionId) {
      const urlParams = new URLSearchParams(window.location.search);
      const sessionParam = urlParams.get('session');
      if (!sessionParam) {
        setError('No session ID provided');
      }
    }
  }, [sessionId]);

  React.useEffect(() => {
    if (!sessionId || !socket) return;

    // Подключаемся к сессии
    const joinSession = () => {
      console.log(`Подключаемся к сессии ${sessionId}...`);
      socket.emit('join-session', {
        sessionId,
        username,
        userType: 'controller'
      });
    };
    
    joinSession();

    // Слушаем ответ сервера
    const onSessionJoined = () => {
      console.log('Успешно подключились к сессии!');
      setJoined(true);
    };

    // Слушаем ошибки
    const onError = (err: any) => {
      console.error(`Ошибка подключения к сессии: ${err.message}`);
      setError(err.message || 'Ошибка подключения к сессии');
      setJoined(false);
    };
    
    // Обработка переподключения
    const onConnect = () => {
      console.log('Соединение установлено, повторное подключение...');
      // Повторно подключаемся при восстановлении соединения
      if (sessionId) {
        joinSession();
      }
    };
    
    // Обработка потери соединения
    const onDisconnect = (reason: string) => {
      console.warn(`Соединение потеряно: ${reason}`);
      setError(`Соединение с сервером потеряно. Попытка переподключения...`);
      // Не меняем setJoined, чтобы избежать перерисовки интерфейса
    };
    
    // Обработка требования переподключения от сервера
    const onReconnectRequired = (data: { sessionId: string }) => {
      console.log(`Сервер запросил переподключение к сессии ${data.sessionId}`);
      joinSession();
    };

    // Регистрируем все обработчики событий
    socket.on('session-joined', onSessionJoined);
    socket.on('error', onError);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('reconnect-required', onReconnectRequired);

    // Проверяем соединение каждые 5 секунд
    const connectionCheckInterval = setInterval(() => {
      if (socket && !socket.connected) {
        console.log('Проверка соединения: отключено, попытка переподключения...');
        socket.connect();
        joinSession();
      }
    }, 5000);

    return () => {
      socket.off('session-joined', onSessionJoined);
      socket.off('error', onError);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('reconnect-required', onReconnectRequired);
      clearInterval(connectionCheckInterval);
    };
  }, [sessionId, socket, username]);

  const requestGyroPermission = async () => {
    // Используем интерфейс DeviceOrientationEventWithPermission для типизации
    const DeviceOrientation = window.DeviceOrientationEvent as unknown as DeviceOrientationEventWithPermission;
    
    if (DeviceOrientation.requestPermission && typeof DeviceOrientation.requestPermission === 'function') {
      // iOS 13+ devices
      try {
        const permission = await DeviceOrientation.requestPermission();
        if (permission === 'granted') {
          setGyroPermission(true);
          startGyroTracking();
        } else {
          setError('Gyroscope permission denied');
        }
      } catch (error) {
        console.error('Error requesting gyroscope permission:', error);
        setError('Failed to request gyroscope permission');
      }
    } else {
      // Non-iOS devices
      setGyroPermission(true);
      startGyroTracking();
    }
  };

  const startGyroTracking = () => {
    // Очистим предыдущий обработчик, если он существует
    window.removeEventListener('deviceorientation', handleOrientation, true);
    
    // Добавляем новый обработчик
    window.addEventListener('deviceorientation', handleOrientation, true);
  };
  
  // Выносим обработчик в отдельную функцию для возможности его удаления
  const handleOrientation = (event: DeviceOrientationEvent) => {
    try {
      const { alpha, beta, gamma } = event;
      if (beta !== null && gamma !== null) {
        setOrientation({ alpha: alpha || 0, beta, gamma });
        
        if (joined && socket) {
          // Проверка соединения и автоматическое переподключение при необходимости
          if (!socket.connected) {
            console.warn('Сокет отключен! Попытка переподключения...');
            socket.connect();
            
            // Повторно присоединяемся к сессии при переподключении
            if (sessionId) {
              console.log(`Повторное присоединение к сессии ${sessionId}...`);
              socket.emit('join-session', {
                sessionId,
                username: username || 'Controller',
                userType: 'controller'
              });
            }
            
            // Возврат, чтобы не пытаться отправить данные по отключенному сокету
            return;
          }
          
          // Convert gyroscope data to cursor position
          const centerX = 960; // Half of 1920
          const centerY = 540; // Half of 1080
          
          // Apply calibration offset
          const adjustedBeta = beta - calibration.beta;
          const adjustedGamma = gamma - calibration.gamma;
          
          // Map orientation to cursor position (with sensitivity adjustment)
          const sensitivity = 50; // Значительно увеличиваем чувствительность для более заметного эффекта
          const x = Math.max(0, Math.min(1920, centerX + (adjustedGamma * sensitivity)));
          const y = Math.max(0, Math.min(1080, centerY + (adjustedBeta * sensitivity)));
          
          // Отправляем обновление позиции курсора на сервер
          socket.emit('cursor-update', {
            sessionId,
            x,
            y
          });
          
          // Сохраняем текущую позицию курсора
          setCursorPosition({ x, y });
          
          // Ограничиваем частоту логов для уменьшения нагрузки на консоль
          if (Math.random() < 0.05) { // ~5% сообщений
            console.log(`Отправка позиции курсора: x=${x.toFixed(2)}, y=${y.toFixed(2)}`);
          }
        } else {
          // Диагностика, почему не отправляются данные
          if (!joined) {
            console.log(`Не отправляются данные гироскопа: joined = ${joined}`);
          }
          if (!socket) {
            console.log('Не отправляются данные гироскопа: socket отсутствует');
          }
        }
      }
    } catch (error) {
      console.error('Ошибка при обработке события ориентации:', error);
    }
  };

  const calibrateGyroscope = () => {
    setCalibrating(true);
    setTimeout(() => {
      setCalibration({
        beta: orientation.beta,
        gamma: orientation.gamma
      });
      setCalibrating(false);
    }, 2000);
  };

  const joinSession = async () => {
    if (!socket || !sessionId || !username.trim()) return;

    setError('');
    socket.emit('join-session', {
      sessionId,
      userType: 'controller',
      username: username.trim()
    });
  };

  const goHome = () => {
    if (socket) {
      socket.disconnect();
    }
    window.location.href = '/';
  };
  
  // Функция создания нового элемента на доске
  const createNewElement = () => {
    if (!socket || !joined) {
      console.log('Невозможно создать элемент: нет соединения или не подключены к сессии');
      return;
    }
    
    const elementWidth = elementType === 'line' ? 200 : 100;
    const elementHeight = elementType === 'line' ? 5 : 100;
    
    // Используем текущую позицию курсора из состояния
    const { x: cursorX, y: cursorY } = cursorPosition;
    
    console.log(`Создаем элемент типа: ${elementType}, текст: ${elementText}, цвет: ${elementColor}`);
    
    socket.emit('create-element', {
      type: elementType,
      x: cursorX,
      y: cursorY,
      width: elementWidth,
      height: elementHeight, 
      color: elementColor,
      text: elementText,
      userId: socket.id
    });
    
    setShowCreatePanel(false);
  };

  // Функция создания новой области на доске
  const createArea = () => {
    if (!socket || !joined) {
      console.log('Невозможно создать область: нет соединения или не подключены к сессии');
      return;
    }
    
    const { x, y } = cursorPosition;
    console.log(`Создаем область по координатам: ${x}, ${y}`);
    
    socket.emit('create-element', {
      type: 'area',
      x,
      y,
      width: 150,
      height: 150,
      color: `${userColor}50`, // Полупрозрачный цвет области (50 - это полупрозрачность в hex)
      text: '',
      userId: socket.id
    });
  };

  if (!gyroSupported) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-4">Gyroscope Not Supported</h2>
          <p className="text-gray-300 mb-6">
            Your device doesn't support gyroscope functionality required for cursor control.
          </p>
          <button
            onClick={goHome}
            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-700 transition-all duration-200"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* Header */}
        <header className="p-6 flex justify-between items-center">
          <button
            onClick={goHome}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <Home className="w-6 h-6 text-white" />
          </button>
          <div className="flex items-center space-x-2">
            {isConnected ? (
              <>
                <Wifi className="w-5 h-5 text-green-400" />
                <span className="text-green-400 text-sm">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="w-5 h-5 text-red-400" />
                <span className="text-red-400 text-sm">Disconnected</span>
              </>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 w-full max-w-md">
            <div className="text-center mb-8">
              <Smartphone className="w-16 h-16 text-blue-400 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-white mb-2">Mobile Controller</h1>
              <p className="text-gray-300">Join the interactive board session</p>
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 mb-6">
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            <div className="space-y-6">
              <div>
                <label className="block text-white text-sm font-medium mb-2">
                  Your Name
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-400 transition-colors"
                  maxLength={20}
                />
              </div>

              {!gyroPermission && (
                <button
                  onClick={requestGyroPermission}
                  className="w-full bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 py-3 rounded-lg font-semibold hover:bg-yellow-500/30 transition-colors"
                >
                  Enable Gyroscope
                </button>
              )}

              <button
                onClick={joinSession}
                disabled={!username.trim()}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Join Session
              </button>
            </div>

            <div className="mt-8 text-center">
              <p className="text-gray-400 text-sm">
                Session: {sessionId?.slice(0, 8)}...
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="p-6 flex justify-between items-center bg-black/20 backdrop-blur-lg border-b border-white/10">
        <div className="flex items-center space-x-3">
          <div 
            className="w-8 h-8 rounded-full"
            style={{ backgroundColor: userColor }}
          />
          <div>
            <h1 className="text-lg font-bold text-white">{username}</h1>
            <p className="text-sm text-gray-300">Controller Active</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {isConnected ? (
            <>
              <Wifi className="w-5 h-5 text-green-400" />
              <span className="text-green-400 text-sm">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="w-5 h-5 text-red-400" />
              <span className="text-red-400 text-sm">Reconnecting...</span>
            </>
          )}
        </div>
      </header>

      {/* Joined content */}
      {joined && (
        <div className="flex flex-col space-y-6">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Gyroscope Control</h3>
              
              {/* Кнопка создания элемента */}
              <button
                className={`px-3 py-1 rounded-lg ${showCreatePanel ? 'bg-blue-500' : 'bg-white/20'} transition-colors`}
                onClick={() => setShowCreatePanel(!showCreatePanel)}
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Gyroscope:</span>
                <span className={gyroPermission ? 'text-green-400' : 'text-yellow-400'}>
                  {gyroPermission ? 'Enabled' : 'Not Enabled'}
                </span>
              </div>
              
              {!gyroPermission && (
                <button
                  className="w-full bg-blue-600 hover:bg-blue-700 transition-colors text-white py-3 px-4 rounded-xl font-medium"
                  onClick={requestGyroPermission}
                >
                  Enable Motion Control
                </button>
              )}
              
              {gyroPermission && (
                <>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-300">Alpha:</span>
                      <span className="text-white font-mono">{orientation.alpha.toFixed(2)}°</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">Beta:</span>
                      <span className="text-white font-mono">{orientation.beta.toFixed(2)}°</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">Gamma:</span>
                      <span className="text-white font-mono">{orientation.gamma.toFixed(2)}°</span>
                    </div>
                  </div>
                  
                  <button
                    className={`w-full ${calibrating ? 'bg-yellow-600' : 'bg-blue-600 hover:bg-blue-700'} transition-colors text-white py-3 px-4 rounded-xl font-medium`}
                    onClick={calibrateGyroscope}
                    disabled={calibrating}
                  >
                    {calibrating ? 'Calibrating...' : 'Calibrate Position'}
                  </button>
                </>
              )}
            </div>
          </div>
          
          {/* Панель создания элементов */}
          {showCreatePanel && (
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white">Create Element</h3>
                <button 
                  className="p-1 rounded-full bg-white/20 hover:bg-white/30"
                  onClick={() => setShowCreatePanel(false)}
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              
              <div className="space-y-4">
                {/* Выбор типа элемента */}
                <div>
                  <label className="text-sm text-gray-300 mb-2 block">Element Type</label>
                  <div className="grid grid-cols-4 gap-2">
                    <button 
                      className={`p-3 rounded-lg flex items-center justify-center ${elementType === 'rect' ? 'bg-blue-500' : 'bg-white/10'}`}
                      onClick={() => setElementType('rect')}
                    >
                      <Square className="w-6 h-6" />
                    </button>
                    <button 
                      className={`p-3 rounded-lg flex items-center justify-center ${elementType === 'circle' ? 'bg-blue-500' : 'bg-white/10'}`}
                      onClick={() => setElementType('circle')}
                    >
                      <Circle className="w-6 h-6" />
                    </button>
                    <button 
                      className={`p-3 rounded-lg flex items-center justify-center ${elementType === 'text' ? 'bg-blue-500' : 'bg-white/10'}`}
                      onClick={() => setElementType('text')}
                    >
                      <Type className="w-6 h-6" />
                    </button>
                    <button 
                      className={`p-3 rounded-lg flex items-center justify-center ${elementType === 'line' ? 'bg-blue-500' : 'bg-white/10'}`}
                      onClick={() => setElementType('line')}
                    >
                      <Minus className="w-6 h-6 transform rotate-45" />
                    </button>
                  </div>
                </div>
                
                {/* Текстовое поле для элемента типа текст */}
                {elementType === 'text' && (
                  <div>
                    <label className="text-sm text-gray-300 mb-2 block">Text Content</label>
                    <input 
                      type="text" 
                      className="w-full bg-white/10 border border-white/20 rounded-lg py-2 px-3 text-white"
                      value={elementText}
                      onChange={(e) => setElementText(e.target.value)}
                      placeholder="Enter text..."
                    />
                  </div>
                )}
                
                {/* Выбор цвета элемента */}
                <div>
                  <label className="text-sm text-gray-300 mb-2 block">Color</label>
                  <div className="grid grid-cols-6 gap-2">
                    {['#ff5252', '#4caf50', '#2196f3', '#ff9800', '#9c27b0', '#ffffff'].map(color => (
                      <button 
                        key={color}
                        className={`w-full aspect-square rounded-full ${elementColor === color ? 'ring-2 ring-white' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setElementColor(color)}
                      />
                    ))}
                  </div>
                </div>
                
                {/* Кнопка создания элемента */}
                <button
                  className="w-full bg-blue-600 hover:bg-blue-700 transition-colors text-white py-3 px-4 rounded-xl font-medium flex items-center justify-center mt-4"
                  onClick={createNewElement}
                >
                  <Check className="w-5 h-5 mr-2" /> Create Element
                </button>
              </div>
            </div>
          )}

          <button
            onClick={goHome}
            className="bg-white/10 backdrop-blur-lg hover:bg-white/20 transition-colors border border-white/20 text-white py-3 px-4 rounded-xl font-medium flex items-center justify-center"
          >
            <Home className="w-5 h-5 mr-2" /> Exit Session
          </button>
        </div>
      )}  

      {/* Main Control Area - Minimalistic version */}
      <main className="flex-1 flex flex-col items-center justify-center p-2">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 border border-white/20 w-full text-center">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-10 h-10 mr-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <h2 className="text-lg font-bold text-white">Active Controller</h2>
                <p className="text-xs text-gray-300">Tilt to move cursor</p>
              </div>
            </div>
            <div className="flex">
              {isConnected ? 
                <Wifi className="w-5 h-5 text-green-400" /> : 
                <WifiOff className="w-5 h-5 text-red-400" />}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 mt-2">
            <button
              onClick={createArea}
              className="bg-blue-600/70 hover:bg-blue-700/90 text-white py-3 px-1 rounded-lg font-semibold transition-colors flex items-center justify-center"
            >
              <Target className="w-5 h-5 mr-2" /> Set Area
            </button>
            <button
              onClick={() => setShowCreatePanel(!showCreatePanel)}
              className="bg-purple-600/70 hover:bg-purple-700/90 text-white py-3 px-1 rounded-lg font-semibold transition-colors flex items-center justify-center"
            >
              <Plus className="w-5 h-5 mr-2" /> Add Element
            </button>
            
            <button
              onClick={calibrateGyroscope}
              disabled={calibrating}
              className="bg-white/10 hover:bg-white/20 text-white py-3 px-1 rounded-lg font-semibold transition-colors disabled:opacity-50 flex items-center justify-center"
            >
              {calibrating ? '...' : 'Calibrate'}
            </button>
            <button
              onClick={goHome}
              className="bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 py-3 px-1 rounded-lg font-semibold transition-colors flex items-center justify-center"
            >
              <Home className="w-5 h-5 mr-2" /> Exit
            </button>
          </div>
          
          {/* Mini Gyro Data */}
          <div className="bg-black/30 rounded-lg p-2 mt-2 text-xs">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-gray-400">α</span>{' '}
                <span className="text-white font-mono">{orientation.alpha.toFixed(0)}°</span>
              </div>
              <div>
                <span className="text-gray-400">β</span>{' '}
                <span className="text-white font-mono">{orientation.beta.toFixed(0)}°</span>
              </div>
              <div>
                <span className="text-gray-400">γ</span>{' '}
                <span className="text-white font-mono">{orientation.gamma.toFixed(0)}°</span>
              </div>
            </div>
          </div>
          
          {/* Status indicator */}
          <div className="mt-2 text-xs">
            <p className="text-gray-400">Cursor: {cursorPosition.x.toFixed(0)}, {cursorPosition.y.toFixed(0)}</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default MobileController;