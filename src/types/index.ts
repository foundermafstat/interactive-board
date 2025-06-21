export interface User {
  id: string;
  username: string;
  userType: 'display' | 'controller' | 'viewer';
  color: string;
  x: number;
  y: number;
  lastUpdate: number;
}

export interface Session {
  id: string;
  createdAt: number;
  lastActivity: number;
  users: User[];
  maxUsers: number;
}

export interface GyroData {
  alpha: number;
  beta: number;
  gamma: number;
}

export interface CursorUpdateData {
  x: number;
  y: number;
  gyroData?: GyroData;
}

export interface SocketEvents {
  'join-session': (data: {
    sessionId: string;
    userType: string;
    username: string;
  }) => void;
  
  'session-joined': (data: {
    sessionId: string;
    user: User;
    users: User[];
  }) => void;
  
  'user-joined': (user: User) => void;
  'user-left': (userId: string) => void;
  
  'cursor-update': (data: CursorUpdateData) => void;
  'cursor-updated': (data: {
    userId: string;
    x: number;
    y: number;
    gyroData?: GyroData;
  }) => void;
  
  error: (error: { message: string }) => void;
  connect: () => void;
  disconnect: () => void;
  ping: () => void;
  pong: () => void;
}