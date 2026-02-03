import React, { useState } from 'react';
import { TokenUsage } from '../types';

interface TokenCounterProps {
  usage: TokenUsage | null;
  onSystemMessage?: (message: string) => void;
  onStatsUpdate?: (stats: { estimatedTokens: number; messageCount: number }) => void;
  compact?: boolean;
}

export function TokenCounter({ usage, onSystemMessage, onStatsUpdate, compact }: TokenCounterProps) {
  const [showPopup, setShowPopup] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);

  if (!usage) {
    if (compact) {
      return (
        <div className="sidebar-item" style={{ opacity: 0.5 }}>
          <span className="sidebar-item-icon">📊</span>
          <span className="sidebar-item-text">Aucune donnée</span>
        </div>
      );
    }
    return (
      <div className="token-counter" style={{ opacity: 0.5 }}>
        <span>📊 --</span>
      </div>
    );
  }

  const handleCompress = async () => {
    if (isCompressing) return;
    setIsCompressing(true);
    
    try {
      const response = await fetch('/api/compress', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        const msg = data.compressed 
          ? `✅ Compression réussie ! Contexte réduit de ${data.tokensBefore?.toLocaleString() || '?'} à ${data.tokensAfter?.toLocaleString() || '?'} tokens.`
          : `ℹ️ ${data.message || 'Rien à compresser'}`;
        onSystemMessage?.(msg);
        
        // Update stats in parent component
        if (data.contextStats && onStatsUpdate) {
          onStatsUpdate(data.contextStats);
        }
      } else {
        onSystemMessage?.(`❌ ${data.error || 'Échec de la compression'}`);
      }
    } catch (error) {
      onSystemMessage?.(`❌ Erreur réseau lors de la compression`);
    } finally {
      setIsCompressing(false);
      setShowPopup(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  if (compact) {
    return (
      <div 
        className="sidebar-item"
        onClick={() => setShowPopup(!showPopup)}
        style={{ position: 'relative' }}
      >
        <span className="sidebar-item-icon">📊</span>
        <span className="sidebar-item-text">
          {formatNumber(usage.input_tokens + usage.output_tokens)} tokens
        </span>
        
        {showPopup && (
          <div className="token-popup" style={{ left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '10px' }}>
            <div className="token-popup-header">📊 Statistiques</div>
            <div className="token-popup-stats">
              <div className="stat-row">
                <span className="stat-label">Input:</span>
                <span className="stat-value" style={{ color: '#60a5fa' }}>{formatNumber(usage.input_tokens)}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Output:</span>
                <span className="stat-value" style={{ color: '#34d399' }}>{formatNumber(usage.output_tokens)}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Total:</span>
                <span className="stat-value">{formatNumber(usage.input_tokens + usage.output_tokens)}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Coût:</span>
                <span className="stat-value" style={{ color: '#fbbf24' }}>${usage.cost.toFixed(4)}</span>
              </div>
            </div>
            <button 
              className="compress-btn" 
              onClick={(e) => { e.stopPropagation(); handleCompress(); }}
              disabled={isCompressing}
            >
              {isCompressing ? '⏳ Compression...' : '🗜️ Compacter'}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      className="token-counter"
      onClick={() => setShowPopup(!showPopup)}
      style={{ position: 'relative' }}
    >
      <div className="token-item input">
        <span className="token-icon">📥</span>
        <span className="token-value">{formatNumber(usage.input_tokens)}</span>
      </div>
      <div className="token-item output">
        <span className="token-icon">📤</span>
        <span className="token-value">{formatNumber(usage.output_tokens)}</span>
      </div>
      <div className="token-item cost">
        <span className="token-icon">💰</span>
        <span className="token-value">${usage.cost.toFixed(4)}</span>
      </div>
      
      {showPopup && (
        <div className="token-popup">
          <div className="token-popup-header">📊 Statistiques détaillées</div>
          <div className="token-popup-stats">
            <div className="stat-row">
              <span className="stat-label">Tokens en entrée:</span>
              <span className="stat-value" style={{ color: '#60a5fa' }}>{formatNumber(usage.input_tokens)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Tokens en sortie:</span>
              <span className="stat-value" style={{ color: '#34d399' }}>{formatNumber(usage.output_tokens)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Total:</span>
              <span className="stat-value">{formatNumber(usage.input_tokens + usage.output_tokens)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Coût estimé:</span>
              <span className="stat-value" style={{ color: '#fbbf24' }}>${usage.cost.toFixed(4)}</span>
            </div>
          </div>
          <button 
            className="compress-btn" 
            onClick={(e) => { e.stopPropagation(); handleCompress(); }}
            disabled={isCompressing}
          >
            {isCompressing ? '⏳ Compression...' : '🗜️ Compacter maintenant'}
          </button>
        </div>
      )}
    </div>
  );
}
