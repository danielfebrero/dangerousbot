import React, { useState } from 'react';
import { ConnectionStatus, TokenUsage } from '../types';
import { SettingsModal } from './SettingsModal';

interface HeaderProps {
  status: ConnectionStatus;
  visible: boolean;
  tokenUsage: TokenUsage | null;
  showAllSources: boolean;
  onToggleSources: (showAll: boolean) => void;
  isSettingsLoaded: boolean;
  currentThreadTitle?: string;
  onToggleThreadPanel?: () => void;
  onClearThread?: () => void;
}

export function Header({
  status,
  visible,
  tokenUsage,
  showAllSources,
  onToggleSources,
  isSettingsLoaded,
  currentThreadTitle,
  onToggleThreadPanel,
  onClearThread
}: HeaderProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const formatNumber = (n: number) => n.toLocaleString();
  const formatCost = (cost: number) => `$${cost.toFixed(4)}`;

  return (
    <>
      <header className={`header ${visible ? '' : 'hidden'}`}>
        <div className="header-left">
          <div className="logo">DangerousBot</div>
          <div className={`status ${status}`}>
            <span className="status-dot" />
          </div>
        </div>

        <div className="header-center">
          {tokenUsage && (
            <div className="usage-badge" title="Token usage">
              <span className="usage-item">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {formatNumber(tokenUsage.input_tokens)}
              </span>
              <span className="usage-divider">|</span>
              <span className="usage-item">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {formatNumber(tokenUsage.output_tokens)}
              </span>
              <span className="usage-divider">|</span>
              <span className="usage-item cost">
                {tokenUsage.cost ? formatCost(tokenUsage.cost.total_cost) : '$0.0000'}
              </span>
            </div>
          )}
        </div>

        <div className="header-right">
          {/* Thread Selector Button */}
          <button
            className="thread-button"
            onClick={onToggleThreadPanel}
            aria-label="Threads"
            title="Conversations"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            {currentThreadTitle && (
              <span className="thread-title-short">{currentThreadTitle.length > 15 ? currentThreadTitle.substring(0, 15) + '...' : currentThreadTitle}</span>
            )}
          </button>

          <button
            className="settings-button"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Settings"
            title="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v6m0 6v6m4.22-10.22l4.24-4.24M6.34 6.34L2.1 2.1m19.8 19.8l-4.24-4.24M6.34 17.66l-4.24 4.24M23 12h-6m-6 0H1m20.24-4.24l-4.24 4.24M6.34 17.66l-4.24 4.24" />
            </svg>
          </button>
        </div>
      </header>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        showAllSources={showAllSources}
        onToggleSources={onToggleSources}
      />
    </>
  );
}
