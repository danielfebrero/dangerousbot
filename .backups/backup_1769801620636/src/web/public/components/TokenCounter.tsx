import React, { useState } from 'react';

interface TokenCounterProps {
  inputTokens: number;
  outputTokens: number;
  messageCount: number;
}

export function TokenCounter({ inputTokens, outputTokens, messageCount }: TokenCounterProps) {
  const [showPopup, setShowPopup] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressed, setCompressed] = useState(false);

  const formatNumber = (n: number) => n.toLocaleString('fr-FR');
  
  // Estimation grossière: après compression, on garde ~10 messages récents + résumé
  const estimatedAfterCompression = Math.min(inputTokens, 3000 + (messageCount > 10 ? 2000 : messageCount * 200));

  const handleCompress = async () => {
    setIsCompressing(true);
    try {
      const response = await fetch('/api/compress', { method: 'POST' });
      if (response.ok) {
        setCompressed(true);
        setTimeout(() => setCompressed(false), 3000);
      }
    } catch (error) {
      console.error('Compression failed:', error);
    } finally {
      setIsCompressing(false);
    }
  };

  if (!inputTokens && !outputTokens) return null;

  return (
    <div 
      className="token-counter"
      onMouseEnter={() => setShowPopup(true)}
      onMouseLeave={() => setShowPopup(false)}
    >
      <span className="token-display">
        📊 {formatNumber(inputTokens)} in · {formatNumber(outputTokens)} out
      </span>

      {showPopup && (
        <div className="token-popup">
          <div className="token-popup-content">
            <h4>📊 Détails du contexte</h4>
            <div className="token-stats">
              <div className="stat-row">
                <span>Messages en mémoire:</span>
                <strong>{messageCount}</strong>
              </div>
              <div className="stat-row">
                <span>Tokens actuels:</span>
                <strong>{formatNumber(inputTokens)}</strong>
              </div>
              <div className="stat-row estimated">
                <span>Après compression:</span>
                <strong>~{formatNumber(estimatedAfterCompression)}</strong>
              </div>
            </div>
            
            {inputTokens > 10000 && (
              <button 
                className={`compress-btn ${compressed ? 'success' : ''}`}
                onClick={handleCompress}
                disabled={isCompressing || compressed}
              >
                {isCompressing ? '⏳ Compression...' : compressed ? '✅ Compacté !' : '🗜️ Compacter maintenant'}
              </button>
            )}
            
            {inputTokens <= 10000 && (
              <p className="no-compress-needed">✅ Contexte optimal, pas besoin de compacter</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
