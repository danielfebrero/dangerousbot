import React from 'react';
import { ConnectionStatus, TokenUsage } from '../types';
import { TokenCounter } from './TokenCounter';

interface HeaderProps {
  status: ConnectionStatus;
  tokenUsage: TokenUsage | null;
}

export function Header({ status, tokenUsage }: HeaderProps) {
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
      <TokenCounter usage={tokenUsage} />
      <div className={`status ${status}`}>
        <span className="status-dot" />
        <span className="status-text">{statusText[status]}</span>
      </div>
    </header>
  );
}
