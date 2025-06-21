export interface OrientationData {
  alpha: number;
  beta: number;
  gamma: number;
}

export interface CalibrationData {
  beta: number;
  gamma: number;
}

export class GyroscopeManager {
  private listeners: ((data: OrientationData) => void)[] = [];
  private isActive = false;
  private calibration: CalibrationData = { beta: 0, gamma: 0 };

  static async requestPermission(): Promise<boolean> {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        return permission === 'granted';
      } catch (error) {
        console.error('Error requesting gyroscope permission:', error);
        return false;
      }
    }
    return true; // Permission not required on non-iOS devices
  }

  static isSupported(): boolean {
    return typeof DeviceOrientationEvent !== 'undefined';
  }

  start(): void {
    if (this.isActive || !GyroscopeManager.isSupported()) return;

    this.isActive = true;
    window.addEventListener('deviceorientation', this.handleOrientation, true);
  }

  stop(): void {
    if (!this.isActive) return;

    this.isActive = false;
    window.removeEventListener('deviceorientation', this.handleOrientation, true);
  }

  calibrate(currentOrientation: OrientationData): void {
    this.calibration = {
      beta: currentOrientation.beta,
      gamma: currentOrientation.gamma
    };
  }

  addListener(listener: (data: OrientationData) => void): void {
    this.listeners.push(listener);
  }

  removeListener(listener: (data: OrientationData) => void): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  private handleOrientation = (event: DeviceOrientationEvent): void => {
    const { alpha, beta, gamma } = event;
    
    if (beta !== null && gamma !== null) {
      const data: OrientationData = {
        alpha: alpha || 0,
        beta: beta - this.calibration.beta,
        gamma: gamma - this.calibration.gamma
      };

      this.listeners.forEach(listener => listener(data));
    }
  };

  convertToCursorPosition(
    orientation: OrientationData, 
    screenWidth: number = 1920, 
    screenHeight: number = 1080,
    sensitivity: number = 10
  ): { x: number; y: number } {
    const centerX = screenWidth / 2;
    const centerY = screenHeight / 2;

    const x = Math.max(0, Math.min(screenWidth, centerX + (orientation.gamma * sensitivity)));
    const y = Math.max(0, Math.min(screenHeight, centerY + (orientation.beta * sensitivity)));

    return { x, y };
  }
}

export const gyroscopeManager = new GyroscopeManager();