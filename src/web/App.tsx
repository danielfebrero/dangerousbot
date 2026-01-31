import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { Header } from './components/Header';
import { MessageList } from './components/MessageList';
import { MessageInput } from './components/MessageInput';
import { DragOverlay } from './components/DragOverlay';
import { Message, WSMessage, TokenUsage, ContentPart, ToolCallExecution } from './types';
import './styles/global.css';

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [droppedImages, setDroppedImages] = useState<ContentPart[]>([]);
  const [showAllSources, setShowAllSources] = useState(true);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const lastScrollY = useRef(0);

  // Load settings from backend on mount
  useEffect(() => {
    fetch('/api/webapp/settings')
      .then(res => res.json())
      .then(data => {
        if (typeof data.showAllSources === 'boolean') {
          setShowAllSources(data.showAllSources);
        }
      })
      .catch(err => console.error('Failed to load settings:', err))
      .finally(() => setIsSettingsLoaded(true));
  }, []);

  // Save settings when changed
  const handleToggleSources = useCallback((showAll: boolean) => {
    setShowAllSources(showAll);
    fetch('/api/webapp/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showAllSources: showAll })
    }).catch(err => console.error('Failed to save settings:', err));
  }, []);

  // Track tool execution IDs for matching results
  const toolExecutionMapRef = useRef<Record<string, string>>({});
  
  // Track active tool executions for chat display
  const [activeToolExecutions, setActiveToolExecutions] = useState<ToolCallExecution[]>([]);
  const activeToolExecutionsRef = useRef<ToolCallExecution[]>([]);

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
          images?: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>;
          source?: 'webapp' | 'telegram';
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

          // Parse provider switch details from content if it's a provider switch message
          let providerSwitch = undefined;
          if (isProviderSwitch) {
            // Try to extract from format "Provider changé : X → Y" or similar
            const match = msg.content.match(/([A-Za-z]+)\s*→\s*([A-Za-z]+)/);
            if (match) {
              providerSwitch = {
                from: match[1].toLowerCase(),
                to: match[2].toLowerCase(),
                reason: msg.content.includes('indisponible') ? 'Provider indisponible, bascule automatique' : 'Bascule manuelle'
              };
            } else {
              // Fallback if no arrow pattern found
              providerSwitch = {
                from: 'unknown',
                to: 'unknown',
                reason: msg.content
              };
            }
          }

          return {
            id: crypto.randomUUID(),
            type: isProviderSwitch ? 'provider_switch' as const : (msg.role === 'user' ? 'user' as const : msg.role === 'assistant' ? 'bot' as const : 'system' as const),
            content: msg.content,
            contentParts,
            toolCalls: msg.tool_calls,
            providerSwitch,
            source: msg.source,
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
        const executionId = wsMessage.payload.executionId;
        
        // Check if this execution already exists using the ref to avoid stale closure
        const existingExec = activeToolExecutionsRef.current.find(e => e.id === executionId);
        if (existingExec) {
          // Already exists, don't create a duplicate
          break;
        }
        
        // Create a new tool execution message in the chat
        // Use executionId as the message ID for easy lookup on tool_result
        const newExecution: ToolCallExecution = {
          id: executionId,  // Use server executionId
          toolName: toolName,
          input: toolInput,
          status: 'running',
          startTime: new Date()
        };
        
        // Add to active executions
        activeToolExecutionsRef.current = [...activeToolExecutionsRef.current, newExecution];
        setActiveToolExecutions(activeToolExecutionsRef.current);
        
        // Add as a separate message in the chat - use executionId as message ID
        setMessages(prev => {
          // Check again in the updater function to avoid race conditions
          if (prev.find(m => m.id === executionId)) {
            return prev;
          }
          return [...prev, {
            id: executionId,  // Use server executionId for easy lookup
            type: 'tool_execution',
            content: '',
            toolExecution: newExecution,
            timestamp: new Date()
          }];
        });
        break;

      case 'tool_result':
        // Update tool execution
        const resultExecutionId = wsMessage.payload.executionId;
        
        // Update the tool execution message in chat using executionId
        setMessages(prev => {
          return prev.map(msg => {
            // Use message.id (which is executionId) for lookup
            if (msg.type === 'tool_execution' && msg.id === resultExecutionId) {
              const result = wsMessage.payload.result;
              const isError = result?.success === false || result?.error;
              
              return {
                ...msg,
                toolExecution: {
                  ...msg.toolExecution,
                  status: isError ? 'error' : 'completed',
                  output: isError ? undefined : result,
                  error: isError ? (result.error || 'Unknown error') : undefined,
                  endTime: new Date()
                }
              };
            }
            return msg;
          });
        });
        
        // Update active executions ref using executionId
        activeToolExecutionsRef.current = activeToolExecutionsRef.current.map(exec => {
          if (exec.id === resultExecutionId) {
            const result = wsMessage.payload.result;
            const isError = result?.success === false || result?.error;
            return {
              ...exec,
              status: isError ? 'error' : 'completed',
              output: isError ? undefined : result,
              error: isError ? (result.error || 'Unknown error') : undefined,
              endTime: new Date()
            };
          }
          return exec;
        });
        setActiveToolExecutions(activeToolExecutionsRef.current);
        
        delete toolExecutionMapRef.current[resultExecutionId];
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
  }, []);

  const { status, sendMessage, sendStop } = useWebSocket({ onMessage: handleMessage });

  // Handle dropped files from drag overlay
  const handleFilesDrop = useCallback((files: File[]) => {
    // Convert files to ContentPart and send immediately
    const processFiles = async () => {
      const newImages: ContentPart[] = [];

      for (const file of files) {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onloadend = () => {
            const base64 = reader.result as string;
            resolve(base64.split(',')[1]);
          };
        });
        reader.readAsDataURL(file);

        const data = await base64Promise;
        newImages.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: file.type,
            data
          }
        });
      }

      // Store dropped images temporarily
      setDroppedImages(newImages);
    };

    processFiles();
  }, []);

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
        source: 'webapp',
        timestamp: new Date()
      }]);
    }
  }, [sendMessage]);

  // Filter messages based on showAllSources setting
  const filteredMessages = showAllSources 
    ? messages 
    : messages.filter(m => !m.source || m.source === 'webapp');

  return (
    <div className="app">
      <Header
        status={status}
        visible={headerVisible}
        tokenUsage={tokenUsage}
        showAllSources={showAllSources}
        onToggleSources={handleToggleSources}
      />

      <main className="main-content">
        <div className="chat-container">
          <MessageList messages={filteredMessages} isTyping={isTyping} />
        </div>
      </main>

      <MessageInput
        onSend={handleSend}
        onStop={sendStop}
        isProcessing={isTyping}
        disabled={status !== 'connected'}
        droppedImages={droppedImages}
        onDroppedImagesClear={() => setDroppedImages([])}
      />

      <DragOverlay
        onFilesDrop={handleFilesDrop}
        disabled={status !== 'connected'}
      />
    </div>
  );
}

export default App;
