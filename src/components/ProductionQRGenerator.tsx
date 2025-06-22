import React, { useState, useEffect, useCallback } from 'react';
import { Download, ExternalLink, Copy, RefreshCw, Check } from 'lucide-react';

interface ProductionQRGeneratorProps {
  sessionId: string;
  className?: string;
}

const ProductionQRGenerator: React.FC<ProductionQRGeneratorProps> = ({ 
  sessionId, 
  className = "" 
}) => {
  const [qrCode, setQrCode] = useState<string>('');
  const [qrUrl, setQrUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Используем VITE_PRODUCTION_URL из переменных окружения или фолбэк
  const PRODUCTION_DOMAIN = import.meta.env.VITE_PRODUCTION_URL;

  const generateProductionQRCode = useCallback(async () => {
    setIsGenerating(true);
    setError('');

    try {
      // Generate the production mobile URL with session parameter
      const productionMobileUrl = `${PRODUCTION_DOMAIN}/mobile?session=${sessionId}`;
      setQrUrl(productionMobileUrl);

      // Generate QR code using multiple fallback services
      const qrServices = [
        // Primary service - QR Server API
        `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(productionMobileUrl)}&bgcolor=ffffff&color=1f2937&margin=2&format=png&ecc=M`,
        
        // Fallback service - QuickChart
        `https://quickchart.io/qr?text=${encodeURIComponent(productionMobileUrl)}&size=300&margin=2&format=png&ecLevel=M`,
        
        // Another fallback - QR Code Generator
        `https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=${encodeURIComponent(productionMobileUrl)}&choe=UTF-8`
      ];

      // Try each service until one works
      let qrCodeGenerated = false;
      
      for (const serviceUrl of qrServices) {
        try {
          const response = await fetch(serviceUrl);
          if (response.ok) {
            setQrCode(serviceUrl);
            qrCodeGenerated = true;
            break;
          }
        } catch (serviceError) {
          console.warn('QR service failed:', serviceError);
          continue;
        }
      }

      if (!qrCodeGenerated) {
        // Если все сервисы не сработали, используем последний URL в любом случае
        // Это предотвратит ошибку и покажет хотя бы что-то
        setQrCode(qrServices[qrServices.length - 1]);
        console.warn('Using fallback QR service after all attempts failed');
      }

    } catch (error) {
      console.error('QR code generation failed:', error);
      setError('Failed to generate QR code. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }, [PRODUCTION_DOMAIN, sessionId, setError, setIsGenerating, setQrUrl, setQrCode]);

  useEffect(() => {
    if (sessionId) {
      generateProductionQRCode();
    }
  }, [sessionId, generateProductionQRCode]);

  const downloadQR = async () => {
    if (!qrCode) return;

    try {
      const response = await fetch(qrCode);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.download = `interactive-board-session-${sessionId.slice(0, 8)}.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download QR code:', error);
      // Fallback: open in new tab
      window.open(qrCode, '_blank');
    }
  };

  const openMobileUrl = () => {
    if (qrUrl) {
      window.open(qrUrl, '_blank');
    }
  };

  const copyUrl = async () => {
    if (!qrUrl) return;

    try {
      await navigator.clipboard.writeText(qrUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy URL:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = qrUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (error) {
    return (
      <div className={`text-center ${className}`}>
        <div className="w-64 h-64 mx-auto bg-red-500/10 border-2 border-red-500/30 rounded-xl flex flex-col items-center justify-center mb-4">
          <div className="text-red-400 text-center p-4">
            <p className="text-sm mb-3">QR Generation Failed</p>
            <button
              onClick={generateProductionQRCode}
              className="flex items-center space-x-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-300 text-sm transition-colors mx-auto"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry Generation</span>
            </button>
          </div>
        </div>
        <p className="text-red-300 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className={`text-center ${className}`}>
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
        <h3 className="text-lg font-semibold text-white mb-4">
          📱 Join Interactive Board
        </h3>
        
        {qrCode ? (
          <div className="space-y-4">
            {/* QR Code Display */}
            <div className="relative mx-auto w-fit">
              <div className="bg-white p-4 rounded-xl shadow-lg w-64 mx-auto">
                <img 
                  src={qrCode} 
                  alt="Interactive Board Session QR Code" 
                  className="w-full aspect-square object-contain"
                  onError={() => setError('Failed to load QR code image')}
                />
              </div>
              {isGenerating && (
                <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-white animate-spin" />
                </div>
              )}
            </div>
            
            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={downloadQR}
                className="flex items-center justify-center space-x-2 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg transition-colors text-blue-300 text-sm"
                title="Download QR Code"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </button>
              
              <button
                onClick={openMobileUrl}
                className="flex items-center justify-center space-x-2 px-3 py-2 bg-green-500/20 hover:bg-green-500/30 rounded-lg transition-colors text-green-300 text-sm"
                title="Open Mobile URL"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open</span>
              </button>
              
              <button
                onClick={copyUrl}
                className="flex items-center justify-center space-x-2 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 rounded-lg transition-colors text-purple-300 text-sm"
                title="Copy URL to Clipboard"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
            
            {/* URL Display */}
            <div className="bg-black/30 rounded-lg p-4">
              <p className="text-xs text-gray-300 mb-2 font-semibold">
                🔗 Mobile Controller URL:
              </p>
              <div className="bg-black/50 rounded p-2">
                <p className="text-xs text-blue-300 break-all font-mono leading-relaxed">
                  {qrUrl}
                </p>
              </div>
            </div>

            {/* Instructions */}
            {/* <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg p-4 border border-blue-500/20">
              <h4 className="text-white font-semibold mb-2 text-sm">📋 Instructions:</h4>
              <ul className="text-gray-300 text-xs space-y-1 text-left">
                <li>• Scan QR code with mobile device camera</li>
                <li>• Or click "Open" to access URL directly</li>
                <li>• Enable gyroscope permissions when prompted</li>
                <li>• Tilt device to control cursor on main display</li>
              </ul>
            </div> */}
          </div>
        ) : (
          <div className="w-64 h-64 mx-auto bg-gray-700/50 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-600">
            {isGenerating ? (
              <div className="flex flex-col items-center space-y-3">
                <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
                <span className="text-gray-300 text-sm">Generating QR Code...</span>
                <span className="text-gray-400 text-xs">Using production URL</span>
              </div>
            ) : (
              <div className="text-center">
                <span className="text-gray-400 text-sm">Ready to generate</span>
                <br />
                <span className="text-gray-500 text-xs">Production QR Code</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductionQRGenerator;