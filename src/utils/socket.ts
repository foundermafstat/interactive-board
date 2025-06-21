import { Socket } from 'socket.io-client';

export class SocketManager {
  private socket: Socket;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(socket: Socket) {
    this.socket = socket;
    this.setupReconnection();
  }

  private setupReconnection(): void {
    this.socket.on('disconnect', () => {
      this.attemptReconnection();
    });

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
    });
  }

  private attemptReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    setTimeout(() => {
      console.log(`Attempting to reconnect... (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
      this.socket.connect();
      this.reconnectAttempts++;
    }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts));
  }

  emitWithThrottle<T>(event: string, data: T, throttleMs: number = 50): void {
    if (!this.lastEmit || Date.now() - this.lastEmit > throttleMs) {
      this.socket.emit(event, data);
      this.lastEmit = Date.now();
    }
  }

  private lastEmit: number = 0;
}

export const createThrottledEmitter = (socket: Socket, throttleMs: number = 50) => {
  let lastEmit = 0;
  
  return <T>(event: string, data: T): void => {
    const now = Date.now();
    if (now - lastEmit > throttleMs) {
      socket.emit(event, data);
      lastEmit = now;
    }
  };
};