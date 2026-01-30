import React from 'react';
import { ConnectionStatus } from '../types';

interface HeaderProps {
  status: ConnectionStatus;
  visible: boolean;
}

export function Header({ status, visible }: HeaderProps) {
  const statusText = {
    connecting: 'Connexion...',
    connected: 'Connecté',
    disconnected: 'Déconnecté',
    error: 'Erreur'
  };

  return (
    <header className={`header ${visible ? '' : 'hidden'}`}>
      <div className="logo">
        <span className="logo-icon">🤖</span>
        <span className="logo-text">DangerousBot</span>
      </div>
      
      <div className={`status ${status}`}>
        <span className="status-dot" />
        <span className="status-text">{statusText[status]}</span>
      </div>
    </header>
  );
}
