import React, { useState, useEffect } from 'react';
import { Smartphone, Monitor, Users, Wifi, WifiOff } from 'lucide-react';
import MainDisplay from './components/MainDisplay';
import MobileController from './components/MobileController';
import SessionManager from './components/SessionManager';
import { useSocket } from './hooks/useSocket';

function App() {
  const [currentView, setCurrentView] = useState<'home' | 'display' | 'mobile'>('home');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    // Check if device is mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    // Check for session parameter in URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionParam = urlParams.get('session');
    if (sessionParam) {
      setSessionId(sessionParam);
      setCurrentView('mobile');
    }
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleCreateSession = (newSessionId: string) => {
    setSessionId(newSessionId);
    setCurrentView('display');
  };

  const renderView = () => {
    switch (currentView) {
      case 'display':
        return <MainDisplay sessionId={sessionId} socket={socket} />;
      case 'mobile':
        return <MobileController sessionId={sessionId} socket={socket} />;
      default:
        return (
          <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col">
            {/* Header */}
            <header className="flex justify-between items-center p-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white">Interactive Board</h1>
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
            </header>

            {/* Main Content */}
            <main className="flex-1 flex items-center justify-center p-6">
              <div className="max-w-4xl w-full">
                <div className="text-center mb-12">
                  <h2 className="text-5xl font-bold text-white mb-6">
                    Real-time Interactive
                    <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent block">
                      Multi-User Experience
                    </span>
                  </h2>
                  <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
                    Create immersive collaborative experiences with real-time cursor tracking, 
                    gyroscope controls, and seamless multi-device connectivity.
                  </p>
                </div>

                {isMobile ? (
                  <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
                    <div className="text-center">
                      <Smartphone className="w-16 h-16 text-blue-400 mx-auto mb-4" />
                      <h3 className="text-2xl font-bold text-white mb-4">Mobile Device Detected</h3>
                      <p className="text-gray-300 mb-6">
                        Use your device as a controller by scanning a QR code from the main display.
                      </p>
                      <button
                        onClick={() => setCurrentView('mobile')}
                        className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-3 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-700 transition-all duration-200 transform hover:scale-105"
                      >
                        Join Session
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-8">
                    {/* Create Session */}
                    <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 hover:bg-white/15 transition-all duration-300">
                      <div className="text-center">
                        <Monitor className="w-16 h-16 text-blue-400 mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-white mb-4">Create Interactive Board</h3>
                        <p className="text-gray-300 mb-6">
                          Start a new session and generate QR codes for mobile devices to join as controllers.
                        </p>
                        <SessionManager onSessionCreated={handleCreateSession} />
                      </div>
                    </div>

                    {/* Join Session */}
                    <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 hover:bg-white/15 transition-all duration-300">
                      <div className="text-center">
                        <Smartphone className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-white mb-4">Mobile Controller</h3>
                        <p className="text-gray-300 mb-6">
                          Use your mobile device's gyroscope to control cursors on the interactive board.
                        </p>
                        <button
                          onClick={() => setCurrentView('mobile')}
                          className="bg-gradient-to-r from-purple-500 to-pink-600 text-white px-8 py-3 rounded-lg font-semibold hover:from-purple-600 hover:to-pink-700 transition-all duration-200 transform hover:scale-105"
                        >
                          Join as Controller
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Features */}
                <div className="mt-16 grid md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center mx-auto mb-3">
                      <Users className="w-6 h-6 text-blue-400" />
                    </div>
                    <h4 className="text-lg font-semibold text-white mb-2">Multi-User Support</h4>
                    <p className="text-gray-400 text-sm">Support for up to 50 simultaneous users with unique identifiers</p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mx-auto mb-3">
                      <Smartphone className="w-6 h-6 text-purple-400" />
                    </div>
                    <h4 className="text-lg font-semibold text-white mb-2">Gyroscope Control</h4>
                    <p className="text-gray-400 text-sm">Intuitive device orientation-based cursor movement</p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center mx-auto mb-3">
                      <Wifi className="w-6 h-6 text-green-400" />
                    </div>
                    <h4 className="text-lg font-semibold text-white mb-2">Real-time Sync</h4>
                    <p className="text-gray-400 text-sm">Instant synchronization across all connected devices</p>
                  </div>
                </div>
              </div>
            </main>

            {/* Footer */}
            <footer className="text-center py-6 text-gray-400 text-sm">
              <p>Built with React, Socket.io, and modern web technologies</p>
            </footer>
          </div>
        );
    }
  };

  return renderView();
}

export default App;