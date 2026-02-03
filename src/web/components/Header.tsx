import React, { useState } from 'react';
import { ConnectionStatus, TokenUsage, TokenStats } from '../types';
import { SettingsModal } from './SettingsModal';

interface HeaderProps {
  connectionStatus: ConnectionStatus;
  tokenUsage: TokenUsage | null;
  tokenStats: TokenStats | null;
  showAllSources: boolean;
  onToggleSources: (showAll: boolean) => void;
  isSettingsLoaded: boolean;
  currentThreadTitle?: string;
  onToggleThreadPanel?: () => void;
  onClearThread?: () => void;
  threadPanelVisible?: boolean;
}

export function Header({
  connectionStatus,
  tokenUsage,
  tokenStats,
  showAllSources,
  onToggleSources,
  isSettingsLoaded,
  currentThreadTitle,
  onToggleThreadPanel,
  onClearThread,
  threadPanelVisible
}: HeaderProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showTokenDetails, setShowTokenDetails] = useState(false);

  const formatNumber = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toLocaleString();
  };
  const formatCost = (cost: number) => `$${cost.toFixed(4)}`;

  return (
    <>
      <header className="header">
        <div className="header-left">
          <div className="logo">DangerousBot</div>
          <div className={`status ${connectionStatus}`}>
            <span className="status-dot" />
          </div>
        </div>

        <div className="header-center">
          {(tokenStats || tokenUsage) && (
            <div
              className="usage-badge"
              title="Token usage - Click for details"
              onClick={() => setShowTokenDetails(!showTokenDetails)}
              style={{ cursor: 'pointer', position: 'relative' }}
            >
              {/* Context usage bar */}
              {tokenStats && (
                <div className="context-bar" title={`Contexte: ${formatNumber(tokenStats.estimatedContextTokens)} / ${formatNumber(tokenStats.contextLimit)} tokens (${tokenStats.contextUsagePercent.toFixed(0)}%)`}>
                  <div
                    className="context-bar-fill"
                    style={{
                      width: `${Math.min(100, tokenStats.contextUsagePercent)}%`,
                      backgroundColor: tokenStats.contextUsagePercent > 80 ? '#ef4444' : tokenStats.contextUsagePercent > 50 ? '#f59e0b' : '#22c55e'
                    }}
                  />
                </div>
              )}
              <span className="usage-item">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {tokenStats ? formatNumber(tokenStats.sessionInputTokens) : (tokenUsage ? formatNumber(tokenUsage.input_tokens) : '0')}
              </span>
              <span className="usage-divider">|</span>
              <span className="usage-item">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {tokenStats ? formatNumber(tokenStats.sessionOutputTokens) : (tokenUsage ? formatNumber(tokenUsage.output_tokens) : '0')}
              </span>
              <span className="usage-divider">|</span>
              <span className="usage-item cost">
                {tokenStats ? formatCost(tokenStats.sessionTotalCost) : (tokenUsage?.cost ? formatCost(tokenUsage.cost.total_cost) : '$0.0000')}
              </span>

              {/* Token details popup */}
              {showTokenDetails && tokenStats && (
                <div className="token-details-popup" onClick={(e) => e.stopPropagation()}>
                  <div className="token-details-header">Token Stats</div>
                  <div className="token-details-section">
                    <div className="token-details-title">Contexte estimé</div>
                    <div className="token-details-row">
                      <span>Tokens:</span>
                      <span>{formatNumber(tokenStats.estimatedContextTokens)} / {formatNumber(tokenStats.contextLimit)}</span>
                    </div>
                    <div className="token-details-row">
                      <span>Utilisation:</span>
                      <span style={{ color: tokenStats.contextUsagePercent > 80 ? '#ef4444' : '#22c55e' }}>
                        {tokenStats.contextUsagePercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="token-details-section">
                    <div className="token-details-title">Session (cumulatif)</div>
                    <div className="token-details-row">
                      <span>Input:</span>
                      <span style={{ color: '#60a5fa' }}>{formatNumber(tokenStats.sessionInputTokens)}</span>
                    </div>
                    <div className="token-details-row">
                      <span>Output:</span>
                      <span style={{ color: '#34d399' }}>{formatNumber(tokenStats.sessionOutputTokens)}</span>
                    </div>
                    <div className="token-details-row">
                      <span>Coût total:</span>
                      <span style={{ color: '#fbbf24' }}>{formatCost(tokenStats.sessionTotalCost)}</span>
                    </div>
                  </div>
                  {tokenStats.lastRequestInputTokens > 0 && (
                    <div className="token-details-section">
                      <div className="token-details-title">Dernière requête</div>
                      <div className="token-details-row">
                        <span>Input:</span>
                        <span>{formatNumber(tokenStats.lastRequestInputTokens)}</span>
                      </div>
                      <div className="token-details-row">
                        <span>Output:</span>
                        <span>{formatNumber(tokenStats.lastRequestOutputTokens)}</span>
                      </div>
                      <div className="token-details-row">
                        <span>Coût:</span>
                        <span>{formatCost(tokenStats.lastRequestCost)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="header-right">
          {/* Thread Toggle Button */}
          <button
            className={`thread-button ${threadPanelVisible ? 'active' : ''}`}
            onClick={onToggleThreadPanel}
            aria-label="Toggle Threads"
            title={threadPanelVisible ? "Masquer conversations" : "Afficher conversations"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
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
