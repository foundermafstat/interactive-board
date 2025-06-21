import React, { useState, useEffect } from 'react';
import { Download, ExternalLink, RefreshCw } from 'lucide-react';

interface QRCodeGeneratorProps {
  sessionId: string;
  onQRGenerated?: (qrCode: string, qrUrl: string) => void;
}

const QRCodeGenerator: React.FC<QRCodeGeneratorProps> = ({ sessionId, onQRGenerated }) => {
  const [qrCode, setQrCode] = useState<string>('');
  const [qrUrl, setQrUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string>('');

  const generateQRCode = async () => {
    setIsGenerating(true);
    setError('');

    try {
      // First try to generate via API
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });

      if (response.ok) {
        const data = await response.json();
        setQrCode(data.qrCode);
        setQrUrl(data.qrUrl);
        onQRGenerated?.(data.qrCode, data.qrUrl);
      } else {
        throw new Error('API generation failed');
      }
    } catch (apiError) {
      console.warn('API QR generation failed, using fallback:', apiError);
      
      // Fallback: Generate QR code client-side
      try {
        const baseUrl = window.location.origin;
        const fallbackUrl = `${baseUrl}/mobile?session=${sessionId}`;
        
        // Use a QR code generation service as fallback
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(fallbackUrl)}&bgcolor=ffffff&color=1f2937&margin=2&format=png`;
        
        setQrCode(qrApiUrl);
        setQrUrl(fallbackUrl);
        onQRGenerated?.(qrApiUrl, fallbackUrl);
      } catch (fallbackError) {
        console.error('Fallback QR generation failed:', fallbackError);
        setError('Failed to generate QR code');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (sessionId) {
      generateQRCode();
    }
  }, [sessionId]);

  const downloadQR = async () => {
    if (!qrCode) return;

    try {
      const response = await fetch(qrCode);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.download = `session-${sessionId}-qr.png`;
      link.href = url;
      link.click();
      
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
    if (qrUrl) {
      try {
        await navigator.clipboard.writeText(qrUrl);
        // You could add a toast notification here
      } catch (error) {
        console.error('Failed to copy URL:', error);
      }
    }
  };

  if (error) {
    return (
      <div className="text-center">
        <div className="w-48 h-48 mx-auto bg-red-500/20 border border-red-500/30 rounded-lg flex flex-col items-center justify-center mb-4">
          <span className="text-red-300 text-sm mb-2">QR Generation Failed</span>
          <button
            onClick={generateQRCode}
            className="flex items-center space-x-2 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded text-red-300 text-xs transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
        </div>
        <p className="text-red-300 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="text-center">
      {qrCode ? (
        <div className="space-y-4">
          <div className="relative">
            <img 
              src={qrCode} 
              alt="Session QR Code" 
              className="w-48 h-48 mx-auto rounded-lg bg-white p-2 shadow-lg"
              onError={() => setError('Failed to load QR code image')}
            />
            {isGenerating && (
              <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-white animate-spin" />
              </div>
            )}
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={downloadQR}
              className="flex items-center space-x-2 flex-1 justify-center px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white text-sm"
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </button>
            <button
              onClick={openMobileUrl}
              className="flex items-center space-x-2 flex-1 justify-center px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg transition-colors text-blue-300 text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open</span>
            </button>
          </div>
          
          <div className="p-3 bg-black/30 rounded-lg">
            <p className="text-xs text-gray-300 mb-2">Mobile URL:</p>
            <div className="flex items-center space-x-2">
              <p className="text-xs text-blue-300 break-all font-mono flex-1">
                {qrUrl}
              </p>
              <button
                onClick={copyUrl}
                className="px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 rounded text-blue-300 text-xs transition-colors"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-48 h-48 mx-auto bg-gray-700 rounded-lg flex items-center justify-center">
          {isGenerating ? (
            <div className="flex flex-col items-center space-y-2">
              <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
              <span className="text-gray-400 text-sm">Generating...</span>
            </div>
          ) : (
            <span className="text-gray-400">Ready to generate</span>
          )}
        </div>
      )}
    </div>
  );
};

export default QRCodeGenerator;