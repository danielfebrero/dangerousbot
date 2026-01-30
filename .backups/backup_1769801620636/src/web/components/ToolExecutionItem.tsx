import React, { useState, useMemo } from 'react';
import { ToolExecution } from '../types';

interface ToolExecutionItemProps {
  execution: ToolExecution;
}

const TOOL_ICONS: Record<string, string> = {
  execute_code: '▶',
  shell: '$',
  read_file: '📄',
  write_file: '✏',
  list_files: '📁',
  search_files: '🔍',
  web_search: '🌐',
  self_update: '🔄',
  switch_provider: '⚡',
  ask_mistral: '🤖',
  default: '⚙'
};

export function ToolExecutionItem({ execution }: ToolExecutionItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const icon = TOOL_ICONS[execution.toolName] || TOOL_ICONS.default;

  const elapsedTime = useMemo(() => {
    const end = execution.endTime || new Date();
    const diff = end.getTime() - execution.startTime.getTime();
    if (diff < 1000) return `${diff}ms`;
    return `${(diff / 1000).toFixed(1)}s`;
  }, [execution.startTime, execution.endTime]);

  const formatValue = (value: unknown): string => {
    if (value === undefined || value === null) return '';
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };

  return (
    <div
      className={`tool-execution-item ${execution.status}`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="tool-execution-header">
        <span className="tool-execution-name">
          <span className="tool-badge-icon">{icon}</span>
          {execution.toolName}
        </span>
        <span className="tool-execution-time">{elapsedTime}</span>
      </div>

      {isExpanded && (
        <div className="tool-execution-details">
          {execution.input && (
            <>
              <strong>Input:</strong>
              <pre>{formatValue(execution.input)}</pre>
            </>
          )}
          {execution.output && (
            <>
              <strong>Output:</strong>
              <pre>{formatValue(execution.output)}</pre>
            </>
          )}
          {execution.error && (
            <>
              <strong style={{ color: 'var(--error)' }}>Error:</strong>
              <pre style={{ color: 'var(--error)' }}>{execution.error}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
