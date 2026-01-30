import React from 'react';

export function TypingIndicator() {
  return (
    <div className="message bot">
      <div className="message-avatar">🤖</div>
      <div className="typing-indicator">
        <div className="typing-dots">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
