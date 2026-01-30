import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useToolPanel } from './hooks/useToolPanel';
import { Header } from './components/Header';
import { MessageList } from './components/MessageList';
import { MessageInput } from './components/MessageInput';
import { ToolPanel } from './components/ToolPanel';
import { ToolPanelToggle } from './components/ToolPanelToggle';
import { Message, WSMessage, TokenUsage, ContentPart } from './types';
import './styles/global.css';

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);

  // Tool panel state
  const {
    isOpen: toolPanelOpen,
    togglePanel,
    closePanel,
    executions,
    addExecution,
    completeExecution,
    failExecution,
    hasRunningTools
  } = useToolPanel();

  // Track tool execution IDs for matching results
  const toolExecutionMapRef = useRef<Record<string, string>>({});

  // Header auto-hide on scroll
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
        setHeaderVisible(false);
      } else {
        setHeaderVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Streaming message ID
  const streamingMessageIdRef = useRef<string | null>(null);

  const handleMessage = useCallback((wsMessage: WSMessage) => {
    switch (wsMessage.type) {
      case 'history':
        const historyMessages = wsMessage.payload.messages || [];
        const loadedMessages: Message[] = historyMessages.map((msg: {
          role: string;
          content: string;
          timestamp: string;
          tool_calls?: Array<{ name: string; input: unknown }>;
          images?: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>
        }) => {
          const isProviderSwitch = msg.role === 'system' && (
            msg.content.includes('Provider changé') ||
            (msg.content.includes('Provider') && msg.content.includes('indisponible'))
          );

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
        streamingMessageIdRef.current = null;
        break;

      case 'stream_chunk':
        if (!streamingMessageIdRef.current) {
          streamingMessageIdRef.current = crypto.randomUUID();
        }
        const streamId = streamingMessageIdRef.current;

        setMessages(prev => {
          const messageIndex = prev.findIndex(m => m.id === streamId);
          if (messageIndex >= 0) {
            const updatedMessages = [...prev];
            updatedMessages[messageIndex] = {
              ...updatedMessages[messageIndex],
              content: updatedMessages[messageIndex].content + wsMessage.payload.text
            };
            return updatedMessages;
          }
          return [...prev, {
            id: streamId,
            type: 'bot',
            content: wsMessage.payload.text,
            timestamp: new Date()
          }];
        });
        break;

      case 'bot_message':
        // Don't create a new message if we already have a streaming message
        if (streamingMessageIdRef.current) {
          const streamId = streamingMessageIdRef.current;
          setMessages(prev => {
            const messageIndex = prev.findIndex(m => m.id === streamId);
            if (messageIndex >= 0) {
              // Streaming message exists, update it with final content if different
              if (prev[messageIndex].content !== wsMessage.payload.text) {
                const updatedMessages = [...prev];
                updatedMessages[messageIndex] = {
                  ...updatedMessages[messageIndex],
                  content: wsMessage.payload.text
                };
                return updatedMessages;
              }
              return prev;
            }
            // No streaming message found, create new one
            return [...prev, {
              id: crypto.randomUUID(),
              type: 'bot',
              content: wsMessage.payload.text,
              timestamp: new Date()
            }];
          });
        } else {
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            type: 'bot',
            content: wsMessage.payload.text,
            timestamp: new Date()
          }]);
        }
        streamingMessageIdRef.current = null;
        break;

      case 'bot_typing':
        setIsTyping(wsMessage.payload.isTyping);
        break;

      case 'tool_use':
        // Track in tool panel
        const toolName = wsMessage.payload.tool;
        const toolInput = wsMessage.payload.input;
        const execId = addExecution(toolName, toolInput);
        toolExecutionMapRef.current[toolName] = execId;

        // Add to messages - only update existing streaming message, don't create new one
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];

          if (lastMessage && lastMessage.type === 'bot' && lastMessage.id === streamingMessageIdRef.current) {
            const updatedMessages = [...prev];
            const existingToolCalls = lastMessage.toolCalls || [];
            updatedMessages[updatedMessages.length - 1] = {
              ...lastMessage,
              toolCalls: [...existingToolCalls, { name: toolName, input: toolInput }]
            };
            return updatedMessages;
          }

          // Don't create empty message if no streaming message exists
          // Tool call will be shown in the next bot message
          return prev;
        });
        break;

      case 'tool_result':
        // Update tool panel
        const resultToolName = wsMessage.payload.tool;
        const resultExecId = toolExecutionMapRef.current[resultToolName];
        if (resultExecId) {
          const result = wsMessage.payload.result;
          if (result?.success === false || result?.error) {
            failExecution(resultExecId, result.error || 'Unknown error');
          } else {
            completeExecution(resultExecId, result);
          }
          delete toolExecutionMapRef.current[resultToolName];
        }
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
          content: `${wsMessage.payload.error}`,
          timestamp: new Date()
        }]);
        break;

      case 'usage':
        setTokenUsage({
          input_tokens: wsMessage.payload.input_tokens,
          output_tokens: wsMessage.payload.output_tokens,
          cost: wsMessage.payload.cost
        });
        streamingMessageIdRef.current = null;
        break;

      case 'provider_switch':
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          type: 'provider_switch',
          content: `${wsMessage.payload.from} → ${wsMessage.payload.to}`,
          providerSwitch: {
            from: wsMessage.payload.from,
            to: wsMessage.payload.to,
            reason: wsMessage.payload.reason
          },
          timestamp: new Date()
        }]);
        break;
    }
  }, [addExecution, completeExecution, failExecution]);

  const { status, sendMessage, sendStop } = useWebSocket({ onMessage: handleMessage });

  const handleSend = useCallback((text: string, images?: ContentPart[]) => {
    // Reset streaming message ID when user sends a new message
    streamingMessageIdRef.current = null;

    if (sendMessage(text, images)) {
      let content = text;
      let contentParts: ContentPart[] | undefined;

      if (images && images.length > 0) {
        contentParts = [
          { type: 'text', text },
          ...images
        ];
        if (!text.trim()) {
          content = 'Image' + (images.length > 1 ? `s (${images.length})` : '');
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
    <div className={`app ${toolPanelOpen ? 'panel-open' : ''}`}>
      <Header
        status={status}
        visible={headerVisible}
      />

      <main className="main-content">
        <div className="chat-container">
          <MessageList messages={messages} isTyping={isTyping} />
        </div>
      </main>

      <MessageInput
        onSend={handleSend}
        onStop={sendStop}
        isProcessing={isTyping}
        disabled={status !== 'connected'}
      />

      <ToolPanelToggle
        isOpen={toolPanelOpen}
        onClick={togglePanel}
        hasActivity={hasRunningTools}
      />

      <ToolPanel
        isOpen={toolPanelOpen}
        onClose={closePanel}
        executions={executions}
        tokenUsage={tokenUsage}
      />
    </div>
  );
}

export default App;
