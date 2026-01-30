import React from 'react';
import { ConnectionStatus } from '../types';

interface HeaderProps {
  status: ConnectionStatus;
  visible: boolean;
}

export function Header({ status, visible }: HeaderProps) {
  return (
    <header className={`header ${visible ? '' : 'hidden'}`}>
      <div className="logo">DangerousBot</div>

      <div className={`status ${status}`}>
        <span className="status-dot" />
      </div>
    </header>
  );
}
