import React, { useState } from 'react';
import { Message, ImageContent } from '../types';
import { Markdown } from './Markdown';
import { ToolBadge } from './ToolBadge';
import { ToolCallVisualizer } from './ToolCallVisualizer';
import { ProviderSwitchMessage } from './ProviderSwitchMessage';

interface MessageItemProps {
  message: Message;
}

// Format relative time (x time ago)
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 10) return 'à l\'instant';
  if (diffSecs < 60) return `il y a ${diffSecs}s`;
  if (diffMins < 60) return `il y a ${diffMins} min`;
  if (diffHours < 24) return `il y a ${diffHours}h`;
  if (diffDays < 7) return `il y a ${diffDays}j`;
  return date.toLocaleDateString('fr-FR');
}

export function MessageItem({ message }: MessageItemProps) {
  const [showTimestamp, setShowTimestamp] = useState(false);

  const renderImages = () => {
    if (!message.contentParts) return null;

    const images = message.contentParts.filter((p): p is ImageContent => p.type === 'image');
    if (images.length === 0) return null;

    return (
      <div className="message-images">
        {images.map((img, idx) => (
          <img
            key={idx}
            src={`data:${img.source.media_type};base64,${img.source.data}`}
            alt={`Image ${idx + 1}`}
            className="message-image"
            onClick={() => window.open(`data:${img.source.media_type};base64,${img.source.data}`, '_blank')}
          />
        ))}
      </div>
    );
  };

  const renderContent = () => {
    // If content is empty but we have tool_calls, don't show anything
    if (!message.content && message.toolCalls && message.toolCalls.length > 0) {
      return null;
    }

    switch (message.type) {
      case 'bot':
        return <Markdown content={message.content} />;

      case 'provider_switch':
        return <ProviderSwitchMessage message={message} />;

      case 'user':
        return (
          <>
            {renderImages()}
            {message.content && <span>{message.content}</span>}
          </>
        );

      case 'tool_execution':
        if (message.toolExecution) {
          return <ToolCallVisualizer execution={message.toolExecution} />;
        }
        return null;

      case 'system':
      default:
        return message.content;
    }
  };

  const renderToolCalls = () => {
    if (!message.toolCalls || message.toolCalls.length === 0) return null;

    return (
      <div className="tool-calls">
        {message.toolCalls.map((tc, idx) => (
          <ToolBadge key={`${tc.name}-${idx}`} toolCall={tc} />
        ))}
      </div>
    );
  };

  // Special rendering for tool_execution messages
  if (message.type === 'tool_execution' && message.toolExecution) {
    return (
      <div 
        className={`message ${message.type}`}
        onMouseEnter={() => setShowTimestamp(true)}
        onMouseLeave={() => setShowTimestamp(false)}
      >
        <ToolCallVisualizer execution={message.toolExecution} />
        {showTimestamp && (
          <div className="message-timestamp-hover">
            {formatRelativeTime(message.timestamp)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      className={`message ${message.type}`}
      onMouseEnter={() => setShowTimestamp(true)}
      onMouseLeave={() => setShowTimestamp(false)}
    >
      <div className="message-content">
        {renderContent()}
        {renderToolCalls()}
      </div>
      {showTimestamp && (
        <div className="message-timestamp-hover">
          {formatRelativeTime(message.timestamp)}
        </div>
      )}
    </div>
  );
}
