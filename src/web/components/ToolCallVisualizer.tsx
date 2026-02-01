import React, { useState } from 'react';
import { ToolCallExecution } from '../types';

interface ToolCallVisualizerProps {
  execution: ToolCallExecution;
}

const toolIcons: Record<string, string> = {
  read_file: '📄',
  write_file: '✏️',
  edit_file: '🔧',
  delete_file: '🗑️',
  list_files: '📁',
  shell: '🐚',
  execute_code: '💻',
  remember: '🧠',
  recall: '📚',
  self_update: '🔄',
  restart_server: '🔁',
  switch_provider: '🔀',
  consult_mistral: '💭',
  web_search: '🔍',
  get_kimi_balance: '💰',
  todo: '✅',
  retrieve_code: '🔎',
};

const toolColors: Record<string, string> = {
  read_file: '#60a5fa',
  write_file: '#34d399',
  edit_file: '#fbbf24',
  delete_file: '#f87171',
  list_files: '#a78bfa',
  shell: '#f472b6',
  execute_code: '#22d3ee',
  remember: '#a3e635',
  recall: '#60a5fa',
  self_update: '#fbbf24',
  restart_server: '#f87171',
  switch_provider: '#a78bfa',
  consult_mistral: '#f472b6',
  web_search: '#22d3ee',
  get_kimi_balance: '#34d399',
  todo: '#a3e635',
  retrieve_code: '#60a5fa',
};

export function ToolCallVisualizer({ execution }: ToolCallVisualizerProps) {
  const [expanded, setExpanded] = useState(false);
  const [showOutput, setShowOutput] = useState(false);

  const icon = toolIcons[execution.toolName] || '🔧';
  const color = toolColors[execution.toolName] || '#60a5fa';

  const formatDuration = () => {
    if (!execution.endTime) return null;
    const duration = execution.endTime.getTime() - execution.startTime.getTime();
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(1)}s`;
  };

  const formatInput = () => {
    if (typeof execution.input === 'object' && execution.input !== null) {
      const entries = Object.entries(execution.input);
      if (entries.length === 0) return '';
      // Show first 2 params max in collapsed view
      const mainParams = entries.slice(0, 2).map(([key, val]) => {
        const valueStr = typeof val === 'string' ? val : JSON.stringify(val);
        const truncated = valueStr.length > 30 ? valueStr.substring(0, 30) + '...' : valueStr;
        return `${key}: ${truncated}`;
      });
      return mainParams.join(', ');
    }
    return String(execution.input);
  };

  const getStatusIcon = () => {
    switch (execution.status) {
      case 'running':
        return <span className="tool-status-spinner" />;
      case 'completed':
        return <span className="tool-status-check">✓</span>;
      case 'warning':
        return <span className="tool-status-warning">⚠</span>;
      case 'error':
        return <span className="tool-status-error">✗</span>;
    }
  };

  return (
    <div 
      className={`tool-call-visualizer ${execution.status} ${expanded ? 'expanded' : ''}`}
      style={{ '--tool-color': color } as React.CSSProperties}
    >
      <div className="tool-call-header" onClick={() => setExpanded(!expanded)}>
        <div className="tool-call-icon">{icon}</div>
        <div className="tool-call-info">
          <div className="tool-call-name">{execution.toolName}</div>
          {!expanded && (
            <div className="tool-call-params-preview">{formatInput()}</div>
          )}
        </div>
        <div className="tool-call-status">
          {execution.status === 'completed' && formatDuration() && (
            <span className="tool-call-duration">{formatDuration()}</span>
          )}
          {getStatusIcon()}
        </div>
      </div>

      {expanded && (
        <div className="tool-call-details">
          <div className="tool-call-section">
            <div className="tool-call-section-title">Arguments</div>
            <pre className="tool-call-code">
              {JSON.stringify(execution.input, null, 2)}
            </pre>
          </div>

          {execution.status === 'warning' && execution.warning && (
            <div className="tool-call-section warning-section">
              <div className="tool-call-warning-message">
                ⚠️ {execution.warning}
              </div>
            </div>
          )}

          {execution.status !== 'running' && (
            <div className="tool-call-section">
              <div className="tool-call-section-title">
                Résultat
                <button
                  className="tool-call-toggle-output"
                  onClick={(e) => { e.stopPropagation(); setShowOutput(!showOutput); }}
                >
                  {showOutput ? 'Masquer' : 'Afficher'}
                </button>
              </div>
              {showOutput && (
                <pre className={`tool-call-code ${execution.status === 'error' ? 'error' : ''} ${execution.status === 'warning' ? 'warning' : ''}`}>
                  {execution.error
                    ? execution.error
                    : JSON.stringify(execution.output, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
