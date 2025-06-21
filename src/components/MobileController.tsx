import React, { useState, useEffect } from 'react';
import { Smartphone, Wifi, WifiOff, Home, AlertCircle } from 'lucide-react';
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
  const [userColor, setUserColor] = useState('#3b82f6');

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

  useEffect(() => {
    if (!socket) return;

    socket.on('session-joined', (data) => {
      setJoined(true);
      setIsConnected(true);
      setUserColor(data.user.color);
    });

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('error', (error) => setError(error.message));

    return () => {
      socket.off('session-joined');
      socket.off('connect');
      socket.off('disconnect');
      socket.off('error');
    };
  }, [socket]);

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
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const { alpha, beta, gamma } = event;
      if (beta !== null && gamma !== null) {
        setOrientation({ alpha: alpha || 0, beta, gamma });
        
        if (joined && socket) {
          // Convert gyroscope data to cursor position
          const centerX = 960; // Half of 1920
          const centerY = 540; // Half of 1080
          
          // Apply calibration offset
          const adjustedBeta = beta - calibration.beta;
          const adjustedGamma = gamma - calibration.gamma;
          
          // Map orientation to cursor position (with sensitivity adjustment)
          const sensitivity = 10;
          const x = Math.max(0, Math.min(1920, centerX + (adjustedGamma * sensitivity)));
          const y = Math.max(0, Math.min(1080, centerY + (adjustedBeta * sensitivity)));
          
          socket.emit('cursor-update', {
            x,
            y,
            gyroData: { alpha, beta, gamma }
          });
        }
      }
    };

    window.addEventListener('deviceorientation', handleOrientation, true);
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

      {/* Main Control Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 w-full max-w-md text-center">
          <div className="mb-8">
            <div className="w-24 h-24 mx-auto mb-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <Smartphone className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Controller Active</h2>
            <p className="text-gray-300">
              Tilt your device to move the cursor on the main display
            </p>
          </div>

          {/* Gyroscope Data Display */}
          <div className="bg-black/30 rounded-lg p-4 mb-6">
            <h3 className="text-white font-semibold mb-3">Orientation Data</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-gray-400">Alpha</div>
                <div className="text-white font-mono">{orientation.alpha.toFixed(1)}°</div>
              </div>
              <div>
                <div className="text-gray-400">Beta</div>
                <div className="text-white font-mono">{orientation.beta.toFixed(1)}°</div>
              </div>
              <div>
                <div className="text-gray-400">Gamma</div>
                <div className="text-white font-mono">{orientation.gamma.toFixed(1)}°</div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <button
              onClick={calibrateGyroscope}
              disabled={calibrating}
              className="w-full bg-white/10 hover:bg-white/20 text-white py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {calibrating ? 'Calibrating...' : 'Calibrate Position'}
            </button>

            <button
              onClick={goHome}
              className="w-full bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 py-3 rounded-lg font-semibold transition-colors"
            >
              Leave Session
            </button>
          </div>
        </div>

        {/* Usage Instructions */}
        <div className="mt-8 bg-white/5 backdrop-blur-lg rounded-xl p-6 max-w-md">
          <h3 className="text-white font-semibold mb-3">How to Use</h3>
          <ul className="text-gray-300 text-sm space-y-2">
            <li>• Tilt left/right to move cursor horizontally</li>
            <li>• Tilt forward/back to move cursor vertically</li>
            <li>• Use "Calibrate" to reset center position</li>
            <li>• Keep device level for best control</li>
          </ul>
        </div>
      </main>
    </div>
  );
};

export default MobileController;