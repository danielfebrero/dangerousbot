import { useState, useCallback, useRef, useEffect } from 'react';
import { useThreadedWebSocket, Thread } from './hooks/useThreadedWebSocket';
import { useBrowserNotification } from './hooks/useBrowserNotification';
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
  const [showAllSources, setShowAllSources] = useState(true);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [droppedImages, setDroppedImages] = useState<ContentPart[]>([]);
  const dragCounterRef = useRef(0);
  
  // Thread management
  const [threads, setThreads] = useState<Thread[]>([]);
  const [showThreadPanel, setShowThreadPanel] = useState(true); // Visible by default
  const [currentThreadTitle, setCurrentThreadTitle] = useState('New Thread');
  const lastScrollY = useRef(0);

  // Pagination state
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalMessageCount, setTotalMessageCount] = useState(0);

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
  // Browser notifications
  const { sendNotification } = useBrowserNotification();
  const lastUserMessageRef = useRef<string>('');
  const streamingEndedRef = useRef(false);
  
  // Ref pour toujours avoir le threadId actuel dans les callbacks
  const currentThreadIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    currentThreadIdRef.current = currentThreadId;
  }, [currentThreadId]);

  const handleThreadSwitched = useCallback((threadId: string, title: string) => {
    setCurrentThreadTitle(title);
    setMessages([]);
    streamingMessageIdRef.current = null;
    // Annuler tout tool execution en cours
    toolExecutionMapRef.current = {};
    activeToolExecutionsRef.current = [];
    setActiveToolExecutions([]);
    // Réinitialiser l'état de streaming
    streamingEndedRef.current = false;
  }, []);

  const handleThreadsList = useCallback((newThreads: Thread[], activeThreadId: string) => {
    setThreads(newThreads);
    const activeThread = newThreads.find(t => t.id === activeThreadId);
    if (activeThread) {
      setCurrentThreadTitle(activeThread.title);
    }
  }, []);

  // Helper function to parse history messages
  const parseHistoryMessages = useCallback((historyMessages: any[]): Message[] => {
    return historyMessages.map((msg: any) => {
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
        id: `msg_${msg.id || crypto.randomUUID()}`,
        type: isProviderSwitch ? 'provider_switch' as const : (msg.role === 'user' ? 'user' as const : msg.role === 'assistant' ? 'bot' as const : 'system' as const),
        content: msg.content,
        contentParts,
        toolCalls: msg.toolCalls,
        providerSwitch,
        source: msg.source,
        timestamp: new Date(msg.timestamp)
      };
    });
  }, []);

  const handleMessage = useCallback((wsMessage: WSMessage) => {
    // Ignorer les messages qui ne sont pas pour le thread actuel
    // (sauf pour certains types globaux comme connected, threads_list, etc.)
    const isGlobalMessage = ['connected', 'threads_list', 'thread_switched', 'thread_created', 'thread_renamed', 'thread_deleted', 'thread_cleared', 'restart_signal'].includes(wsMessage.type);
    
    // Utiliser le ref pour avoir toujours la valeur actuelle
    const activeThreadId = currentThreadIdRef.current;
    const messageThreadId = wsMessage.threadId;
    
    if (!isGlobalMessage && messageThreadId && messageThreadId !== activeThreadId) {
      // Message pour un autre thread, l'ignorer
      console.log(`[App] Ignoring message for thread ${messageThreadId}, current is ${activeThreadId}`);
      return;
    }
    
    switch (wsMessage.type) {
      case 'history':
        const historyMessages = wsMessage.payload.messages || [];
        const offset = wsMessage.payload.offset || 0;
        const hasMore = wsMessage.payload.hasMore || false;
        const totalCount = wsMessage.payload.totalCount || historyMessages.length;

        const loadedMessages = parseHistoryMessages(historyMessages);

        if (offset === 0) {
          // Initial load - replace messages
          setMessages(loadedMessages);
          setCurrentOffset(loadedMessages.length);
        } else {
          // Loading more - prepend older messages
          setMessages(prev => [...loadedMessages, ...prev]);
          setCurrentOffset(prev => prev + loadedMessages.length);
        }

        setHasMoreMessages(hasMore);
        setTotalMessageCount(totalCount);
        setIsLoadingMore(false);
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
        // When the bot starts typing, clear any previous streaming message id so
        // that a new response will create a new message instead of appending
        // to the previous one.
        if (wsMessage.payload.isTyping) {
          streamingMessageIdRef.current = null;
          streamingEndedRef.current = false;
        } else {
          // Bot stopped typing
          streamingEndedRef.current = true;
        }
        break;

      case 'bot_message':
        streamingMessageIdRef.current = null;
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          type: 'bot',
          content: wsMessage.payload.text,
          timestamp: new Date()
        }]);
        // Send notification when bot finishes responding
        sendNotification({
          title: 'DangerousBot',
          body: wsMessage.payload.text.slice(0, 100) + (wsMessage.payload.text.length > 100 ? '...' : ''),
          tag: 'dangerousbot-response'
        });
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
    clearThread,
    loadMoreHistory
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

  // Handler for loading more messages (called by MessageList on scroll to top)
  const handleLoadMore = useCallback(() => {
    if (hasMoreMessages && !isLoadingMore) {
      setIsLoadingMore(true);
      loadMoreHistory(currentOffset);
    }
  }, [hasMoreMessages, isLoadingMore, currentOffset, loadMoreHistory]);

  const handleSendMessage = useCallback((text: string, images?: ContentPart[]) => {
    lastUserMessageRef.current = text;
    const success = sendMessage(text, images);
    if (success) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        type: 'user',
        content: text,
        contentParts: images && images.length > 0 ? images : undefined,
        timestamp: new Date()
      }]);
    }
  }, [sendMessage]);

  const handleStop = useCallback(() => {
    sendStop();
  }, [sendStop]);

  const handleNewThread = useCallback(() => {
    createThread('New Thread');
  }, [createThread]);

  const handleSwitchThread = useCallback((threadId: string) => {
    switchThread(threadId);
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

  // Drag & Drop handlers at app level
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));

    if (imageFiles.length === 0) return;

    for (const file of imageFiles) {
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
          } as ContentPart]);
        }
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleClearDroppedImages = useCallback(() => {
    setDroppedImages([]);
  }, []);

  return (
    <div
      className={`app ${showThreadPanel ? 'with-sidebar' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <DragOverlay isDragging={isDragging} />

      {/* Thread Panel - Fixed Sidebar */}
      {showThreadPanel && (
        <div className="thread-panel">
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
      )}

      <div className="main-wrapper">
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
            threadPanelVisible={showThreadPanel}
          />
        </div>

        <main className="main-content">
          <MessageList
            messages={messages}
            showAllSources={showAllSources}
            isTyping={isTyping}
            hasMore={hasMoreMessages}
            isLoadingMore={isLoadingMore}
            onLoadMore={handleLoadMore}
          />
        </main>

        <MessageInput
          onSend={handleSendMessage}
          onStop={handleStop}
          isProcessing={isTyping}
          disabled={status !== 'connected'}
          droppedImages={droppedImages}
          onDroppedImagesClear={handleClearDroppedImages}
        />
      </div>
    </div>
  );
}

export default App;
