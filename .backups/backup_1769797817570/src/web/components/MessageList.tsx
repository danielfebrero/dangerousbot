import React, { useEffect, useRef } from 'react';
import { Message } from '../types';
import { MessageItem } from './MessageItem';
import { TypingIndicator } from './TypingIndicator';

interface MessageListProps {
  messages: Message[];
  isTyping: boolean;
}

export function MessageList({ messages, isTyping }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      // Scroll the parent chat-container
      const chatContainer = containerRef.current.closest('.chat-container');
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }
  }, [messages, isTyping]);

  return (
    <div className="message-list" ref={containerRef}>
      {messages.map(message => (
        <MessageItem key={message.id} message={message} />
      ))}
      {isTyping && <TypingIndicator />}
    </div>
  );
}
