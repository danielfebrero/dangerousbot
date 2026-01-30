import React, { useState, useEffect, useRef } from 'react';
import { TokenUsage } from '../types';

interface TokenCounterProps {
  usage: TokenUsage | null;
  onSystemMessage?: (message: string) => void;
}

export function TokenCounter({ usage, onSystemMessage }: TokenCounterProps) {
  const [showPopup, setShowPopup] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressed, setCompressed] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setShowPopup(true);
  };

  const handleMouseLeave = () => {
    // Délai avant de cacher pour permettre de bouger vers le popup
    hideTimeoutRef.current = setTimeout(() => {
      setShowPopup(false);
    }, 150);
  };

  // Récupérer le nombre de messages
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/stats');
        if (response.ok) {
          const data = await response.json();
          setMessageCount(data.messageCount || 0);
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      }
    };
    
    fetchStats();
    // Rafraîchir toutes les 5 secondes
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!usage) return null;

  const formatNumber = (n: number) => n.toLocaleString('fr-FR');
  
  // Utiliser le coût calculé par le provider si disponible, sinon estimer avec Claude pricing
  let costInput: number;
  let costOutput: number;
  let totalCost: number;
  
  if (usage.cost) {
    // Coût calculé par le provider (Kimi ou Claude)
    costInput = usage.cost.input_cost;
    costOutput = usage.cost.output_cost;
    totalCost = usage.cost.total_cost;
  } else {
    // Fallback: estimation Claude Opus 4.5 pricing ($15/M input, $75/M output)
    costInput = (usage.input_tokens / 1_000_000) * 15;
    costOutput = (usage.output_tokens / 1_000_000) * 75;
    totalCost = costInput + costOutput;
  }
  
  const formatCost = (c: number) => c < 0.01 ? '<$0.01' : `${c.toFixed(3)}`;

  // Estimation après compression: ~3000 tokens de base + ~200 par message récent (10 gardés)
  const estimatedAfterCompression = Math.min(usage.input_tokens, 3000 + Math.min(messageCount, 10) * 300);
  const savings = usage.input_tokens - estimatedAfterCompression;
  const savingsPercent = Math.round((savings / usage.input_tokens) * 100);

  const handleCompress = async () => {
    setIsCompressing(true);
    onSystemMessage?.('🗜️ Compression du contexte en cours...');
    
    try {
      const response = await fetch('/api/compress', { method: 'POST' });
      if (response.ok) {
        setCompressed(true);
        onSystemMessage?.('✅ Contexte compressé avec succès ! Les anciens messages ont été résumés.');
        setTimeout(() => setCompressed(false), 3000);
      } else {
        onSystemMessage?.('❌ Échec de la compression');
      }
    } catch (error) {
      console.error('Compression failed:', error);
      onSystemMessage?.('❌ Erreur lors de la compression');
    } finally {
      setIsCompressing(false);
    }
  };

  const needsCompression = usage.input_tokens > 15000;

  return (
    <div 
      className="token-counter"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="token-item input">
        <span className="token-icon">📥</span>
        <span className="token-value">{formatNumber(usage.input_tokens)}</span>
        <span className="token-label">in</span>
      </div>
      <div className="token-item output">
        <span className="token-icon">📤</span>
        <span className="token-value">{formatNumber(usage.output_tokens)}</span>
        <span className="token-label">out</span>
      </div>
      <div className="token-item cost">
        <span className="token-icon">💰</span>
        <span className="token-value">{formatCost(totalCost)}</span>
      </div>

      {showPopup && (
        <div 
          className="token-popup"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="token-popup-header">
            📊 Détails du contexte
          </div>
          <div className="token-popup-stats">
            <div className="stat-row">
              <span className="stat-label">Messages en mémoire</span>
              <span className="stat-value">{messageCount}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Tokens actuels</span>
              <span className="stat-value highlight">{formatNumber(usage.input_tokens)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Après compression</span>
              <span className="stat-value success">~{formatNumber(estimatedAfterCompression)}</span>
            </div>
            {needsCompression && (
              <div className="stat-row savings">
                <span className="stat-label">Économie potentielle</span>
                <span className="stat-value">-{savingsPercent}%</span>
              </div>
            )}
          </div>
          
          {needsCompression ? (
            <button 
              className={`compress-btn ${compressed ? 'success' : ''}`}
              onClick={handleCompress}
              disabled={isCompressing || compressed}
            >
              {isCompressing ? '⏳ Compression...' : compressed ? '✅ Compacté !' : '🗜️ Compacter maintenant'}
            </button>
          ) : (
            <div className="no-compress">
              ✅ Contexte optimal
            </div>
          )}
        </div>
      )}
    </div>
  );
}
