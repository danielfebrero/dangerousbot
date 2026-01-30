import React, { useState, useCallback } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { Header } from './components/Header';
import { MessageList } from './components/MessageList';
import { MessageInput } from './components/MessageInput';
import { Message, WSMessage } from './types';

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  const handleMessage = useCallback((wsMessage: WSMessage) => {
    switch (wsMessage.type) {
      case 'bot_message':
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          type: 'bot',
          content: wsMessage.payload.text,
          timestamp: new Date()
        }]);
        break;

      case 'bot_typing':
        setIsTyping(wsMessage.payload.isTyping);
        break;

      case 'tool_use':
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          type: 'tool',
          content: wsMessage.payload.tool,
          toolName: wsMessage.payload.tool,
          timestamp: new Date()
        }]);
        break;

      case 'system':
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          type: 'system',
          content: wsMessage.payload.message,
          timestamp: new Date()
        }]);
        break;

      case 'error':
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          type: 'system',
          content: `❌ ${wsMessage.payload.error}`,
          timestamp: new Date()
        }]);
        break;
    }
  }, []);

  const { status, sendMessage } = useWebSocket({ onMessage: handleMessage });

  const handleSend = useCallback((text: string) => {
    if (sendMessage(text)) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        type: 'user',
        content: text,
        timestamp: new Date()
      }]);
    }
  }, [sendMessage]);

  return (
    <div className="app">
      <Header status={status} />
      <main className="chat-container">
        <MessageList messages={messages} isTyping={isTyping} />
      </main>
      <MessageInput onSend={handleSend} disabled={status !== 'connected'} />
    </div>
  );
}

export default App;
