import React from 'react';
import { Message } from '../types';
import { Markdown } from './Markdown';
import { ToolBadge } from './ToolBadge';

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
