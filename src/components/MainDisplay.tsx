import React, { useEffect, useRef, useState } from 'react';
import { Users, Wifi, WifiOff, Home, Download, ExternalLink } from 'lucide-react';
import ProductionQRGenerator from './ProductionQRGenerator';
import type { Socket } from 'socket.io-client';

interface User {
  id: string;
  username: string;
  userType: string;
  color: string;
  x: number;
  y: number;
  lastUpdate: number;
}

interface MainDisplayProps {
  sessionId: string | null;
  socket: Socket | null;
}

const MainDisplay: React.FC<MainDisplayProps> = ({ sessionId, socket }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionCount, setConnectionCount] = useState(0);

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
      setConnectionCount(prev => prev + 1);
    });

    socket.on('user-left', (userId) => {
      setUsers(prev => prev.filter(u => u.id !== userId));
      setConnectionCount(prev => Math.max(0, prev - 1));
    });

    socket.on('cursor-updated', (data) => {
      setUsers(prev => prev.map(user => 
        user.id === data.userId 
          ? { ...user, x: data.x, y: data.y, lastUpdate: Date.now() }
          : user
      ));
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
    };
  }, [socket, sessionId]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
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

      // Draw user cursors
      users.forEach(user => {
        if (user.userType === 'display') return;
        
        const x = (user.x / 1920) * canvas.width;
        const y = (user.y / 1080) * canvas.height;
        
        // Cursor shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.arc(x + 2, y + 2, 12, 0, Math.PI * 2);
        ctx.fill();
        
        // Cursor body
        ctx.fillStyle = user.color;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
        
        // Cursor border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Username label
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(x - 30, y - 35, 60, 20);
        ctx.fillStyle = 'white';
        ctx.font = '12px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(user.username, x, y - 22);
      });
      
      requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
    };
  }, [users]);

  const goHome = () => {
    if (socket) {
      socket.disconnect();
    }
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-lg border-b border-white/10 p-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button
              onClick={goHome}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <Home className="w-5 h-5 text-white" />
            </button>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Interactive Board</h1>
                <p className="text-sm text-gray-300">Session: {sessionId?.slice(0, 8)}...</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5 text-blue-400" />
              <span className="text-white font-medium">{users.length}</span>
              <span className="text-gray-300 text-sm">users</span>
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
                  <span className="text-red-400 text-sm">Disconnected</span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Main Canvas */}
        <main className="flex-1 p-6">
          <div className="h-full bg-black/20 backdrop-blur-lg rounded-2xl border border-white/10 overflow-hidden relative">
            <canvas
              ref={canvasRef}
              className="w-full h-full"
              style={{ minHeight: '500px' }}
            />
            
            {users.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">Waiting for users...</h3>
                  <p className="text-gray-300">Have users scan the QR code to join</p>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Sidebar */}
        <aside className="w-96 p-6 space-y-6">
          {/* Production QR Code Generator */}
          {sessionId && (
            <ProductionQRGenerator sessionId={sessionId} />
          )}

          {/* Connected Users */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h3 className="text-lg font-semibold text-white mb-4">Connected Users</h3>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {users.filter(u => u.userType !== 'display').map(user => (
                <div key={user.id} className="flex items-center space-x-3">
                  <div 
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: user.color }}
                  />
                  <span className="text-white text-sm">{user.username}</span>
                  <span className="text-gray-400 text-xs ml-auto">
                    {user.userType}
                  </span>
                </div>
              ))}
              {users.filter(u => u.userType !== 'display').length === 0 && (
                <p className="text-gray-400 text-sm text-center py-4">
                  No controllers connected
                </p>
              )}
            </div>
          </div>

          {/* Connection Status */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h3 className="text-lg font-semibold text-white mb-4">System Status</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-300">WebSocket:</span>
                <span className={isConnected ? 'text-green-400' : 'text-red-400'}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Session ID:</span>
                <span className="text-blue-300 font-mono text-xs">
                  {sessionId?.slice(0, 8)}...
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Active Users:</span>
                <span className="text-white">{users.filter(u => u.userType !== 'display').length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Environment:</span>
                <span className="text-green-400">Production</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default MainDisplay;