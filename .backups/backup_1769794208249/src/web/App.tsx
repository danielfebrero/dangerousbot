import React, { useState, useCallback, useRef } from 'react';
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

  // ID du message en cours de streaming (useRef pour éviter les problèmes de closure)
  const streamingMessageIdRef = useRef<string | null>(null);

  const handleMessage = useCallback((wsMessage: WSMessage) => {
    switch (wsMessage.type) {
      case 'history':
        // Charger l'historique des messages depuis le serveur
        const historyMessages = wsMessage.payload.messages || [];
        const loadedMessages: Message[] = historyMessages.map((msg: { role: string; content: string; timestamp: string; tool_calls?: Array<{ name: string; input: unknown }>; images?: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }> }) => {
          // Détecter les messages de changement de provider
          const isProviderSwitch = msg.role === 'system' && (
            msg.content.includes('Provider changé') ||
            (msg.content.includes('Provider') && msg.content.includes('indisponible'))
          );

          // Construire les contentParts pour les messages avec images
          let contentParts: ContentPart[] | undefined;
          if (msg.images && msg.images.length > 0) {
            contentParts = [
              { type: 'text', text: msg.content },
              ...msg.images
            ];
          }

          return {
            id: crypto.randomUUID(),
            type: isProviderSwitch ? 'provider_switch' as const : (msg.role === 'user' ? 'user' as const : msg.role === 'assistant' ? 'bot' as const : 'system' as const),
            content: msg.content,
            contentParts,
            toolCalls: msg.tool_calls,
            timestamp: new Date(msg.timestamp)
          };
        });
        setMessages(loadedMessages);
        streamingMessageIdRef.current = null; // Réinitialiser le streaming au chargement
        break;

      case 'stream_chunk':
        // Streaming: ajouter le chunk au message en cours
        // IMPORTANT: Set the ID synchronously BEFORE setMessages to avoid race conditions
        // If we set it inside the callback, rapid chunks can arrive before the callback executes
        if (!streamingMessageIdRef.current) {
          streamingMessageIdRef.current = crypto.randomUUID();
        }
        const streamId = streamingMessageIdRef.current;

        setMessages(prev => {
          const messageIndex = prev.findIndex(m => m.id === streamId);
          if (messageIndex >= 0) {
            // Mettre à jour le message existant
            const updatedMessages = [...prev];
            updatedMessages[messageIndex] = {
              ...updatedMessages[messageIndex],
              content: updatedMessages[messageIndex].content + wsMessage.payload.text
            };
            return updatedMessages;
          }
          // Créer un nouveau message de streaming (first chunk)
          return [...prev, {
            id: streamId,
            type: 'bot',
            content: wsMessage.payload.text,
            timestamp: new Date()
          }];
        });
        break;

      case 'bot_message':
        // Message complet (sans streaming)
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          type: 'bot',
          content: wsMessage.payload.text,
          timestamp: new Date()
        }]);
        streamingMessageIdRef.current = null;
        break;

      case 'bot_typing':
        setIsTyping(wsMessage.payload.isTyping);
        break;

      case 'tool_use':
        // Ajouter le tool call au message en cours de streaming, ou créer un nouveau message bot
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          
          // Si le dernier message est un bot message en cours (même ID que streaming ou type bot)
          if (lastMessage && lastMessage.type === 'bot' && lastMessage.id === streamingMessageIdRef.current) {
            // Ajouter le tool call au message existant
            const updatedMessages = [...prev];
            const existingToolCalls = lastMessage.toolCalls || [];
            updatedMessages[updatedMessages.length - 1] = {
              ...lastMessage,
              toolCalls: [...existingToolCalls, { name: wsMessage.payload.tool, input: wsMessage.payload.input }]
            };
            return updatedMessages;
          }
          
          // Sinon, créer un nouveau message bot avec ce tool call
          return [...prev, {
            id: crypto.randomUUID(),
            type: 'bot',
            content: '',
            toolCalls: [{ name: wsMessage.payload.tool, input: wsMessage.payload.input }],
            timestamp: new Date()
          }];
        });
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
        streamingMessageIdRef.current = null; // Fin du streaming
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

  const { status, sendMessage, sendStop } = useWebSocket({ onMessage: handleMessage });

  const handleSend = useCallback((text: string, images?: ContentPart[]) => {
    if (sendMessage(text, images)) {
      let content = text;
      let contentParts: ContentPart[] | undefined;
      
      if (images && images.length > 0) {
        contentParts = [
          { type: 'text', text },
          ...images
        ];
        // Le contenu texte simple est utilisé pour l'affichage fallback
        if (!text.trim()) {
          content = '📷 Image' + (images.length > 1 ? `s (${images.length})` : '');
        }
      }
      
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        type: 'user',
        content,
        contentParts,
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
      <MessageInput onSend={handleSend} onStop={sendStop} isProcessing={isTyping} disabled={status !== 'connected'} />
    </div>
  );
}

export default App;
