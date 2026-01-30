import React from 'react';
import { ToolExecution, TokenUsage } from '../types';
import { ToolExecutionItem } from './ToolExecutionItem';

interface ToolPanelProps {
  isOpen: boolean;
  onClose: () => void;
  executions: ToolExecution[];
  tokenUsage: TokenUsage | null;
}

export function ToolPanel({ isOpen, onClose, executions, tokenUsage }: ToolPanelProps) {
  const runningExecutions = executions.filter(e => e.status === 'running');
  const completedExecutions = executions.filter(e => e.status !== 'running');

  const formatNumber = (num: number) => {
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  return (
    <div className={`tool-panel ${isOpen ? 'open' : ''}`}>
      <div className="tool-panel-header">
        <span className="tool-panel-title">Tools</span>
        <button className="tool-panel-close" onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="tool-panel-content">
        {/* Token Usage */}
        {tokenUsage && (
          <div className="tool-section">
            <div className="tool-section-title">Usage</div>
            <div className="tool-execution-item completed" style={{ cursor: 'default' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span>In: {formatNumber(tokenUsage.input_tokens)}</span>
                <span>Out: {formatNumber(tokenUsage.output_tokens)}</span>
                {tokenUsage.cost && (
                  <span style={{ color: 'var(--warning)' }}>
                    ${tokenUsage.cost.total_cost.toFixed(4)}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Running Tools */}
        {runningExecutions.length > 0 && (
          <div className="tool-section">
            <div className="tool-section-title">Running</div>
            {runningExecutions.map(exec => (
              <ToolExecutionItem key={exec.id} execution={exec} />
            ))}
          </div>
        )}

        {/* Completed Tools */}
        {completedExecutions.length > 0 && (
          <div className="tool-section">
            <div className="tool-section-title">History</div>
            {completedExecutions.slice(0, 20).map(exec => (
              <ToolExecutionItem key={exec.id} execution={exec} />
            ))}
          </div>
        )}

        {/* Empty State */}
        {executions.length === 0 && !tokenUsage && (
          <div className="tool-panel-empty">
            No tool executions yet
          </div>
        )}
      </div>
    </div>
  );
}
