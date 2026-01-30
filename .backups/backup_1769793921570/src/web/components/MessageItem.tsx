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
          <div key={idx} className="message-image-wrapper">
            <img 
              src={`data:${img.source.media_type};base64,${img.source.data}`}
              alt={`Image ${idx + 1}`}
              className="message-image"
              onClick={() => window.open(`data:${img.source.media_type};base64,${img.source.data}`, '_blank')}
              title="Click to open full size"
            />
          </div>
        ))}
      </div>
    );
  };

  const renderContent = () => {
    // Si le contenu est vide (message avec seulement tool_calls), ne rien afficher
    if (!message.content && message.toolCalls && message.toolCalls.length > 0) {
      return null;
    }
    
    switch (message.type) {
      case 'bot':
        return <Markdown content={message.content} />;
      case 'provider_switch':
        return (
          <div className="provider-switch">
            <span className="provider-icon">🔄</span>
            <span className="provider-from">{message.providerSwitch?.from || 'unknown'}</span>
            <span className="provider-arrow">→</span>
            <span className="provider-to">{message.providerSwitch?.to || 'unknown'}</span>
            {message.providerSwitch?.reason && message.providerSwitch.reason !== 'user_request' && (
              <span className="provider-reason">({message.providerSwitch.reason})</span>
            )}
          </div>
        );
      case 'user':
        return (
          <>
            {renderImages()}
            {message.content && <div className="user-text">{message.content}</div>}
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
      <div className="message-tools">
        {message.toolCalls.map((tc, idx) => (
          <ToolBadge key={`${tc.name}-${idx}`} toolCall={tc} />
        ))}
      </div>
    );
  };

  return (
    <div className={`message ${message.type}`}>
      {renderToolCalls()}
      <div className="message-content">
        {renderContent()}
      </div>
    </div>
  );
}
