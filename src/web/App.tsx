import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useThreadedWebSocket, Thread } from './hooks/useThreadedWebSocket';
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
  
  // Thread management
  const [threads, setThreads] = useState<Thread[]>([]);
  const [showThreadPanel, setShowThreadPanel] = useState(false);
  const [currentThreadTitle, setCurrentThreadTitle] = useState('New Thread');
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

  // Track tool execution IDs
  const toolExecutionMapRef = useRef<Record<string, string>>({});
  const [activeToolExecutions, setActiveToolExecutions] = useState<ToolCallExecution[]>([]);
  const activeToolExecutionsRef = useRef<ToolCallExecution[]>([]);

  // Header auto-hide
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

  // Thread callbacks
  const handleThreadSwitched = useCallback((threadId: string, title: string) => {
    setCurrentThreadTitle(title);
    setMessages([]);
    streamingMessageIdRef.current = null;
  }, []);

  const handleThreadsList = useCallback((newThreads: Thread[], activeThreadId: string) => {
    setThreads(newThreads);
    const activeThread = newThreads.find(t => t.id === activeThreadId);
    if (activeThread) {
      setCurrentThreadTitle(activeThread.title);
    }
  }, []);

  const handleMessage = useCallback((wsMessage: WSMessage) => {
    switch (wsMessage.type) {
      case 'history':
        const historyMessages = wsMessage.payload.messages || [];
        const loadedMessages: Message[] = historyMessages.map((msg: any) => {
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

          let providerSwitch = undefined;
          if (isProviderSwitch) {
            const match = msg.content.match(/([A-Za-z]+)\s*→\s*([A-Za-z]+)/);
            if (match) {
              providerSwitch = {
                from: match[1].toLowerCase(),
                to: match[2].toLowerCase(),
                reason: msg.content.includes('indisponible') ? 'Provider indisponible' : 'Bascule manuelle'
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

      case 'threads_list':
        setThreads(wsMessage.payload.threads || []);
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

      case 'bot_typing':
        setIsTyping(wsMessage.payload.isTyping);
        break;

      case 'bot_message':
        streamingMessageIdRef.current = null;
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          type: 'bot',
          content: wsMessage.payload.text,
          timestamp: new Date()
        }]);
        break;

      case 'tool_use':
        const executionId = crypto.randomUUID();
        toolExecutionMapRef.current[wsMessage.payload.executionId || 'unknown'] = executionId;
        
        const newExecution: ToolCallExecution = {
          id: executionId,
          toolName: wsMessage.payload.tool,
          input: wsMessage.payload.input,
          status: 'running',
          startTime: new Date()
        };
        
        activeToolExecutionsRef.current = [...activeToolExecutionsRef.current, newExecution];
        setActiveToolExecutions(activeToolExecutionsRef.current);
        
        setMessages(prev => [...prev, {
          id: executionId,
          type: 'tool_execution',
          content: `Utilisation de ${wsMessage.payload.tool}...`,
          toolExecution: newExecution,
          timestamp: new Date()
        }]);
        break;

      case 'tool_result':
        const mappedExecutionId = toolExecutionMapRef.current[wsMessage.payload.executionId || 'unknown'];
        
        if (mappedExecutionId) {
          activeToolExecutionsRef.current = activeToolExecutionsRef.current.map(exec =>
            exec.id === mappedExecutionId
              ? { ...exec, status: 'completed', endTime: new Date(), output: wsMessage.payload.result }
              : exec
          );
          setActiveToolExecutions(activeToolExecutionsRef.current);

          setMessages(prev => prev.map(msg =>
            msg.id === mappedExecutionId && msg.toolExecution
              ? { ...msg, toolExecution: { ...msg.toolExecution, status: 'completed', output: wsMessage.payload.result } }
              : msg
          ));
        }
        break;

      case 'usage':
        setTokenUsage({
          input_tokens: wsMessage.payload.input_tokens,
          output_tokens: wsMessage.payload.output_tokens,
          cost: wsMessage.payload.cost
        });
        break;

      case 'error':
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          type: 'system',
          content: `Erreur: ${wsMessage.payload.error}`,
          timestamp: new Date()
        }]);
        break;

      case 'thread_switched':
      case 'thread_created':
      case 'thread_renamed':
      case 'thread_deleted':
        // Refresh threads list
        listThreads();
        break;
    }
  }, []);

  const {
    status,
    currentThreadId,
    sendMessage,
    sendStop,
    createThread,
    switchThread,
    renameThread,
    deleteThread,
    listThreads,
    clearThread
  } = useThreadedWebSocket({
    onMessage: handleMessage,
    onThreadSwitched: handleThreadSwitched,
    onThreadsList: handleThreadsList
  });

  // Load threads on mount
  useEffect(() => {
    if (status === 'connected') {
      listThreads();
    }
  }, [status, listThreads]);

  const handleSendMessage = useCallback((text: string) => {
    const success = sendMessage(text, droppedImages);
    if (success) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        type: 'user',
        content: text,
        contentParts: droppedImages.length > 0 ? droppedImages : undefined,
        timestamp: new Date()
      }]);
      setDroppedImages([]);
    }
  }, [sendMessage, droppedImages]);

  const handleStop = useCallback(() => {
    sendStop();
  }, [sendStop]);

  const handleNewThread = useCallback(() => {
    createThread('New Thread');
    setShowThreadPanel(false);
  }, [createThread]);

  const handleSwitchThread = useCallback((threadId: string) => {
    switchThread(threadId);
    setShowThreadPanel(false);
  }, [switchThread]);

  const handleRenameThread = useCallback((threadId: string, newTitle: string) => {
    renameThread(threadId, newTitle);
  }, [renameThread]);

  const handleDeleteThread = useCallback((threadId: string) => {
    if (confirm('Supprimer ce thread et tout son historique ?')) {
      deleteThread(threadId);
    }
  }, [deleteThread]);

  const handleClearThread = useCallback(() => {
    if (confirm('Effacer tous les messages de ce thread ?')) {
      clearThread();
      setMessages([]);
    }
  }, [clearThread]);

  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      
      if (e.dataTransfer?.files) {
        const files = Array.from(e.dataTransfer.files);
        files.forEach(file => {
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const data = (event.target?.result as string)?.split(',')[1];
              if (data) {
                setDroppedImages(prev => [...prev, {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: file.type,
                    data
                  }
                }]);
              }
            };
            reader.readAsDataURL(file);
          }
        });
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  return (
    <div className="app">
      <DragOverlay isDragging={isDragging} />
      
      {/* Thread Panel */}
      {showThreadPanel && (
        <div className="thread-panel-overlay" onClick={() => setShowThreadPanel(false)}>
          <div className="thread-panel" onClick={e => e.stopPropagation()}>
            <div className="thread-panel-header">
              <h3>Conversations</h3>
              <button className="new-thread-btn" onClick={handleNewThread}>
                + Nouveau
              </button>
            </div>
            <div className="thread-list">
              {threads.map(thread => (
                <div
                  key={thread.id}
                  className={`thread-item ${thread.id === currentThreadId ? 'active' : ''}`}
                  onClick={() => handleSwitchThread(thread.id)}
                >
                  <span className="thread-title">{thread.title}</span>
                  {thread.id === currentThreadId && <span className="thread-active-badge">●</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className={`header-container ${headerVisible ? 'visible' : 'hidden'}`}>
        <Header 
          connectionStatus={status}
          tokenUsage={tokenUsage}
          showAllSources={showAllSources}
          onToggleSources={handleToggleSources}
          isSettingsLoaded={isSettingsLoaded}
          currentThreadTitle={currentThreadTitle}
          onToggleThreadPanel={() => setShowThreadPanel(!showThreadPanel)}
          onClearThread={handleClearThread}
        />
      </div>

      <main className="main-content">
        <MessageList 
          messages={messages} 
          showAllSources={showAllSources}
          isTyping={isTyping}
        />
      </main>

      <MessageInput 
        onSend={handleSendMessage}
        onStop={handleStop}
        isConnected={status === 'connected'}
        isTyping={isTyping}
        droppedImages={droppedImages}
        setDroppedImages={setDroppedImages}
      />
    </div>
  );
}

export default App;
