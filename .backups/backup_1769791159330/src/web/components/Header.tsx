import React from 'react';
import { ConnectionStatus, TokenUsage } from '../types';
import { TokenCounter } from './TokenCounter';

interface HeaderProps {
  status: ConnectionStatus;
  tokenUsage: TokenUsage | null;
  onSystemMessage?: (message: string) => void;
}

export function Header({ status, tokenUsage, onSystemMessage }: HeaderProps) {
  const statusText = {
    connecting: 'Connexion...',
    connected: 'Connecté',
    disconnected: 'Déconnecté',
    error: 'Erreur de connexion'
  };

  return (
    <header className="header">
      <div className="logo">
        <span className="logo-icon">🤖</span>
        <h1>DangerousBot</h1>
      </div>
      <TokenCounter usage={tokenUsage} onSystemMessage={onSystemMessage} />
      <div className={`status ${status}`}>
        <span className="status-dot" />
        <span className="status-text">{statusText[status]}</span>
      </div>
    </header>
  );
}
