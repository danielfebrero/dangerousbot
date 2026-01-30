import React from 'react';
import { ConnectionStatus } from '../types';

interface HeaderProps {
  status: ConnectionStatus;
}

export function Header({ status }: HeaderProps) {
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
      <div className={`status ${status}`}>
        <span className="status-dot" />
        <span className="status-text">{statusText[status]}</span>
      </div>
    </header>
  );
}
