import React from 'react';
import { Message } from '../types';

interface MessageItemProps {
  message: Message;
}

export function MessageItem({ message }: MessageItemProps) {
  return (
    <div className={`message ${message.type}`}>
      <div className="message-content">
        {message.type === 'tool' ? (
          <span className="tool-name">🔧 {message.toolName}</span>
        ) : (
          message.content
        )}
      </div>
    </div>
  );
}
