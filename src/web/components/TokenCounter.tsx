import React from 'react';
import { TokenUsage } from '../types';

interface TokenCounterProps {
  usage: TokenUsage | null;
}

export function TokenCounter({ usage }: TokenCounterProps) {
  if (!usage) return null;

  const total = usage.input_tokens + usage.output_tokens;
  
  // Estimation du coût (Claude Opus 4.5 pricing approximatif)
  // $15/M input, $75/M output
  const costInput = (usage.input_tokens / 1_000_000) * 15;
  const costOutput = (usage.output_tokens / 1_000_000) * 75;
  const totalCost = costInput + costOutput;

  const formatNumber = (n: number) => n.toLocaleString('fr-FR');
  const formatCost = (c: number) => c < 0.01 ? '<$0.01' : `$${c.toFixed(3)}`;

  return (
    <div className="token-counter">
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
    </div>
  );
}
