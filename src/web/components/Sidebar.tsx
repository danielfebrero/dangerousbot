import React, { useState } from 'react';
import { TokenUsage } from '../types';
import { TokenCounter } from './TokenCounter';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  tokenUsage: TokenUsage | null;
  onSystemMessage?: (message: string) => void;
}

export function Sidebar({ collapsed, onToggle, tokenUsage, onSystemMessage }: SidebarProps) {
  const [activeSection, setActiveSection] = useState('chat');

  const menuItems = [
    { id: 'chat', icon: '💬', label: 'Chat' },
    { id: 'history', icon: '📜', label: 'Historique' },
    { id: 'tools', icon: '🛠️', label: 'Outils' },
    { id: 'settings', icon: '⚙️', label: 'Paramètres' },
  ];

  const toolItems = [
    { id: 'files', icon: '📁', label: 'Fichiers' },
    { id: 'code', icon: '💻', label: 'Exécuter code' },
    { id: 'shell', icon: '🐚', label: 'Terminal' },
    { id: 'memory', icon: '🧠', label: 'Mémoire' },
  ];

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && (
          <div className="logo">
            <span className="logo-icon">🤖</span>
            <span className="logo-text">DangerousBot</span>
          </div>
        )}
        <button 
          className="sidebar-toggle" 
          onClick={onToggle}
          title={collapsed ? 'Développer' : 'Réduire'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {collapsed ? (
              <path d="M9 18l6-6-6-6" />
            ) : (
              <path d="M15 18l-6-6 6-6" />
            )}
          </svg>
        </button>
      </div>

      <div className="sidebar-content">
        {/* Menu principal */}
        <div className="sidebar-section">
          {!collapsed && <div className="sidebar-section-title">Menu</div>}
          {menuItems.map(item => (
            <div
              key={item.id}
              className={`sidebar-item ${activeSection === item.id ? 'active' : ''}`}
              onClick={() => setActiveSection(item.id)}
              title={collapsed ? item.label : undefined}
            >
              <span className="sidebar-item-icon">{item.icon}</span>
              <span className="sidebar-item-text">{item.label}</span>
            </div>
          ))}
        </div>

        {/* Tools rapides */}
        <div className="sidebar-section">
          {!collapsed && <div className="sidebar-section-title">Outils rapides</div>}
          {toolItems.map(item => (
            <div
              key={item.id}
              className="sidebar-item"
              title={collapsed ? item.label : undefined}
            >
              <span className="sidebar-item-icon">{item.icon}</span>
              <span className="sidebar-item-text">{item.label}</span>
            </div>
          ))}
        </div>

        {/* Token Counter dans la sidebar */}
        {!collapsed && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">Utilisation</div>
            <TokenCounter 
              usage={tokenUsage} 
              onSystemMessage={onSystemMessage}
              compact
            />
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <div className="user-profile" title={collapsed ? 'Dani' : undefined}>
          <div className="user-avatar">D</div>
          {!collapsed && (
            <div className="user-info">
              <div className="user-name">Dani</div>
              <div className="user-status">En ligne</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
