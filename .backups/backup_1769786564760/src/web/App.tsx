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

  // Fonction pour ajouter un message système (utilisé par Header pour la compression)
  const addSystemMessage = useCallback((content: string) => {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      type: 'system',
      content,
      timestamp: new Date()
    }]);
  }, []);

  const handleMessage = useCallback((wsMessage: WSMessage) => {
    switch (wsMessage.type) {
      case 'history':
        // Charger l'historique des messages depuis le serveur
        const historyMessages = wsMessage.payload.messages || [];
        const loadedMessages: Message[] = historyMessages.map((msg: { role: string; content: string; timestamp: string; tool_calls?: Array<{ name: string; input: unknown }> }) => {
          // Détecter les messages de changement de provider
          const isProviderSwitch = msg.role === 'system' && (
            msg.content.includes('Provider changé') || 
            (msg.content.includes('Provider') && msg.content.includes('indisponible'))
          );
          
          return {
            id: crypto.randomUUID(),
            type: isProviderSwitch ? 'provider_switch' as const : (msg.role === 'user' ? 'user' as const : msg.role === 'assistant' ? 'bot' as const : 'system' as const),
            content: msg.content,
            toolCalls: msg.tool_calls,
            timestamp: new Date(msg.timestamp)
          };
        });
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
          type: 'bot',
          content: '',
          toolCalls: [{ name: wsMessage.payload.tool, input: wsMessage.payload.input }],
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
          output_tokens: wsMessage.payload.output_tokens,
          cost: wsMessage.payload.cost
        });
        break;

      case 'provider_switch':
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          type: 'provider_switch',
          content: `🔄 Provider: ${wsMessage.payload.from} → ${wsMessage.payload.to}`,
          providerSwitch: {
            from: wsMessage.payload.from,
            to: wsMessage.payload.to,
            reason: wsMessage.payload.reason
          },
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
      <Header status={status} tokenUsage={tokenUsage} onSystemMessage={addSystemMessage} />
      <main className="chat-container">
        <MessageList messages={messages} isTyping={isTyping} />
      </main>
      <MessageInput onSend={handleSend} disabled={status !== 'connected'} />
    </div>
  );
}

export default App;
