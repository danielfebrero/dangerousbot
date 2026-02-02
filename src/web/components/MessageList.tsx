import React, { useEffect, useRef, useCallback } from 'react';
import { Message } from '../types';
import { MessageItem } from './MessageItem';
import { TypingIndicator } from './TypingIndicator';

interface MessageListProps {
  messages: Message[];
  showAllSources?: boolean;
  isTyping: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onForceRestart?: () => void;
}

export function MessageList({ messages, isTyping, hasMore, isLoadingMore, onLoadMore, onForceRestart }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(messages.length);
  const prevScrollHeightRef = useRef(0);

  // Auto-scroll to bottom when new messages arrive (not when loading older messages)
  useEffect(() => {
    if (containerRef.current) {
      const mainContent = containerRef.current.closest('.main-content');
      if (mainContent) {
        // Only scroll to bottom if we're adding new messages (not prepending old ones)
        if (messages.length > prevMessagesLengthRef.current) {
          const isLoadingOlder = prevScrollHeightRef.current > 0;
          if (!isLoadingOlder) {
            mainContent.scrollTop = mainContent.scrollHeight;
          } else {
            // Maintain scroll position when prepending older messages
            const newScrollHeight = mainContent.scrollHeight;
            const scrollDiff = newScrollHeight - prevScrollHeightRef.current;
            mainContent.scrollTop = scrollDiff;
            prevScrollHeightRef.current = 0;
          }
        } else if (prevMessagesLengthRef.current === 0) {
          // Initial load - scroll to bottom
          mainContent.scrollTop = mainContent.scrollHeight;
        }
        prevMessagesLengthRef.current = messages.length;
      }
    }
  }, [messages]);

  // Scroll to bottom when typing indicator appears
  useEffect(() => {
    if (isTyping && containerRef.current) {
      const mainContent = containerRef.current.closest('.main-content');
      if (mainContent) {
        mainContent.scrollTop = mainContent.scrollHeight;
      }
    }
  }, [isTyping]);

  // Detect scroll to top to load more messages
  const handleScroll = useCallback((e: Event) => {
    const target = e.target as HTMLElement;
    if (target.scrollTop < 100 && hasMore && !isLoadingMore && onLoadMore) {
      prevScrollHeightRef.current = target.scrollHeight;
      onLoadMore();
    }
  }, [hasMore, isLoadingMore, onLoadMore]);

  useEffect(() => {
    const mainContent = containerRef.current?.closest('.main-content');
    if (mainContent) {
      mainContent.addEventListener('scroll', handleScroll);
      return () => mainContent.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  return (
    <div className="message-list" ref={containerRef}>
      {isLoadingMore && (
        <div className="loading-more">
          <div className="loading-spinner" />
          <span>Chargement...</span>
        </div>
      )}
      {hasMore && !isLoadingMore && (
        <div className="load-more-indicator">
          <span>↑ Scroll pour charger plus</span>
        </div>
      )}
      {messages.map(message => (
        <MessageItem 
          key={message.id} 
          message={message} 
          onForceRestart={message.forceRestart ? onForceRestart : undefined}
        />
      ))}
      {isTyping && <TypingIndicator />}
    </div>
  );
}
