import React, { useState, useCallback } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { Header } from './components/Header';
import { MessageList } from './components/MessageList';
import { MessageInput } from './components/MessageInput';
import { Message, WSMessage, TokenUsage } from './types';

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);

  const handleMessage = useCallback((wsMessage: WSMessage) => {
    switch (wsMessage.type) {
      case 'history':
        // Charger l'historique des messages depuis le serveur
        const historyMessages = wsMessage.payload.messages || [];
        const loadedMessages: Message[] = historyMessages.map((msg: { role: string; content: string; timestamp: string }) => ({
          id: crypto.randomUUID(),
          type: msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'bot' : 'system',
          content: msg.content,
          timestamp: new Date(msg.timestamp)
        }));
        setMessages(loadedMessages);
        break;

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

      case 'usage':
        setTokenUsage({
          input_tokens: wsMessage.payload.input_tokens,
          output_tokens: wsMessage.payload.output_tokens
        });
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
      <Header status={status} tokenUsage={tokenUsage} />
      <main className="chat-container">
        <MessageList messages={messages} isTyping={isTyping} />
      </main>
      <MessageInput onSend={handleSend} disabled={status !== 'connected'} />
    </div>
  );
}

export default App;
