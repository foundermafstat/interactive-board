import React, { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';

interface SessionManagerProps {
  onSessionCreated: (sessionId: string) => void;
}

const SessionManager: React.FC<SessionManagerProps> = ({ onSessionCreated }) => {
  const [isCreating, setIsCreating] = useState(false);

  const createSession = async () => {
    setIsCreating(true);
    
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        onSessionCreated(data.sessionId);
      } else {
        console.error('Failed to create session');
      }
    } catch (error) {
      console.error('Error creating session:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <button
      onClick={createSession}
      disabled={isCreating}
      className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-3 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-700 transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center space-x-2"
    >
      {isCreating ? (
        <>
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Creating...</span>
        </>
      ) : (
        <>
          <Plus className="w-5 h-5" />
          <span>Create Session</span>
        </>
      )}
    </button>
  );
};

export default SessionManager;