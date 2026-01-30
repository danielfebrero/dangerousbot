import React from 'react';
import { Message } from '../types';
import { Markdown } from './Markdown';

interface MessageItemProps {
  message: Message;
}

export function MessageItem({ message }: MessageItemProps) {
  const renderContent = () => {
    switch (message.type) {
      case 'tool':
        return <span className="tool-name">🔧 {message.toolName}</span>;
      case 'bot':
        return <Markdown content={message.content} />;
      case 'user':
      case 'system':
      default:
        return message.content;
    }
  };

  return (
    <div className={`message ${message.type}`}>
      <div className="message-content">
        {renderContent()}
      </div>
    </div>
  );
}
