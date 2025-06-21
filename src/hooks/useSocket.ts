import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Determine the socket URL based on environment and origin
    const getSocketUrl = () => {
      // Проверяем, обращается ли пользователь через ngrok URL
      if (window.location.href.includes('ngrok-free.app')) {
        // Если да, то используем ngrok URL
        return 'https://25a0-37-15-187-82.ngrok-free.app';
      } else if (process.env.NODE_ENV === 'production') {
        // Стандартная логика для production среды
        return window.location.origin.replace('https://', 'wss://').replace('http://', 'ws://');
      } else {
        // Локальная разработка
        return 'http://localhost:3001';
      }
    };

    const socketInstance = io(getSocketUrl(), {
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      timeout: 20000,
      forceNew: true,
    });

    socketInstance.on('connect', () => {
      console.log('Socket connected:', socketInstance.id);
      setIsConnected(true);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
    });

    socketInstance.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setIsConnected(false);
    });

    socketInstance.on('reconnect', (attemptNumber) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts');
      setIsConnected(true);
    });

    socketInstance.on('reconnect_error', (error) => {
      console.error('Socket reconnection error:', error);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.close();
    };
  }, []);

  return { socket, isConnected };
};