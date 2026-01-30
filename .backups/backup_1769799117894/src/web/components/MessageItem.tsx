import React from 'react';
import { Message, ImageContent } from '../types';
import { Markdown } from './Markdown';
import { ToolBadge } from './ToolBadge';

interface MessageItemProps {
  message: Message;
}

export function MessageItem({ message }: MessageItemProps) {
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
        return (
          <>
            {message.providerSwitch?.from} → {message.providerSwitch?.to}
          </>
        );

      case 'user':
        return (
          <>
            {renderImages()}
            {message.content && <span>{message.content}</span>}
          </>
        );

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

  return (
    <div className={`message ${message.type}`}>
      <div className="message-content">
        {renderContent()}
        {renderToolCalls()}
      </div>
    </div>
  );
}
