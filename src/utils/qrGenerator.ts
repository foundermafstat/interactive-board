/**
 * QR Code Generation Utilities for Production Environment
 * Generates QR codes with the deployed application URL
 */

export interface QRCodeOptions {
  size?: number;
  margin?: number;
  backgroundColor?: string;
  foregroundColor?: string;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  format?: 'png' | 'svg' | 'jpeg';
}

export class ProductionQRGenerator {
  // Используем VITE_PRODUCTION_URL из переменных окружения или фолбэк на значение по умолчанию
  private static readonly PRODUCTION_DOMAIN = import.meta.env.VITE_PRODUCTION_URL || 
    'https://25a0-37-15-187-82.ngrok-free.app';
  
  private static readonly QR_SERVICES = [
    {
      name: 'QR Server API',
      generateUrl: (data: string, options: QRCodeOptions) => {
        const params = new URLSearchParams({
          size: `${options.size || 300}x${options.size || 300}`,
          data: data,
          bgcolor: (options.backgroundColor || '#ffffff').replace('#', ''),
          color: (options.foregroundColor || '#1f2937').replace('#', ''),
          margin: String(options.margin || 2),
          format: options.format || 'png',
          ecc: options.errorCorrectionLevel || 'M'
        });
        return `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;
      }
    },
    {
      name: 'QuickChart',
      generateUrl: (data: string, options: QRCodeOptions) => {
        const params = new URLSearchParams({
          text: data,
          size: String(options.size || 300),
          margin: String(options.margin || 2),
          format: options.format || 'png',
          ecLevel: options.errorCorrectionLevel || 'M'
        });
        return `https://quickchart.io/qr?${params.toString()}`;
      }
    },
    {
      name: 'Google Charts',
      generateUrl: (data: string, options: QRCodeOptions) => {
        const size = options.size || 300;
        return `https://chart.googleapis.com/chart?chs=${size}x${size}&cht=qr&chl=${encodeURIComponent(data)}&choe=UTF-8`;
      }
    }
  ];

  /**
   * Generate a mobile controller URL for the given session
   */
  static generateMobileUrl(sessionId: string): string {
    return `${this.PRODUCTION_DOMAIN}/mobile?session=${sessionId}`;
  }

  /**
   * Generate QR code URL using multiple fallback services
   */
  static async generateQRCode(
    sessionId: string, 
    options: QRCodeOptions = {}
  ): Promise<{ qrCodeUrl: string; mobileUrl: string; service: string }> {
    const mobileUrl = this.generateMobileUrl(sessionId);
    
    // Try each service until one works
    for (const service of this.QR_SERVICES) {
      try {
        const qrCodeUrl = service.generateUrl(mobileUrl, options);
        
        // Test if the service is accessible
        const response = await fetch(qrCodeUrl, { method: 'HEAD' });
        if (response.ok) {
          return {
            qrCodeUrl,
            mobileUrl,
            service: service.name
          };
        }
      } catch (error) {
        console.warn(`QR service ${service.name} failed:`, error);
        continue;
      }
    }
    
    throw new Error('All QR code services are unavailable');
  }

  /**
   * Download QR code as file
   */
  static async downloadQRCode(
    qrCodeUrl: string, 
    filename: string = 'interactive-board-qr.png'
  ): Promise<void> {
    try {
      const response = await fetch(qrCodeUrl);
      if (!response.ok) throw new Error('Failed to fetch QR code');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.download = filename;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download QR code:', error);
      // Fallback: open in new tab
      window.open(qrCodeUrl, '_blank');
    }
  }

  /**
   * Copy mobile URL to clipboard
   */
  static async copyMobileUrl(sessionId: string): Promise<boolean> {
    const mobileUrl = this.generateMobileUrl(sessionId);
    
    try {
      await navigator.clipboard.writeText(mobileUrl);
      return true;
    } catch (error) {
      console.error('Failed to copy URL:', error);
      
      // Fallback for older browsers
      try {
        const textArea = document.createElement('textarea');
        textArea.value = mobileUrl;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        return success;
      } catch (fallbackError) {
        console.error('Fallback copy failed:', fallbackError);
        return false;
      }
    }
  }

  /**
   * Validate session ID format
   */
  static isValidSessionId(sessionId: string): boolean {
    // UUID v4 format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(sessionId);
  }

  /**
   * Extract session ID from URL
   */
  static extractSessionFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const sessionId = urlObj.searchParams.get('session');
      return sessionId && this.isValidSessionId(sessionId) ? sessionId : null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      return null;
    }
  }
}

// Export default instance
export const qrGenerator = ProductionQRGenerator;