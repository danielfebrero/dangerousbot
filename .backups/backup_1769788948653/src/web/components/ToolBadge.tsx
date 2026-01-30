import React, { useState } from 'react';
import { ToolCall } from '../types';

interface ToolBadgeProps {
  toolCall: ToolCall;
}

// Emojis as UTF-8 strings for cross-browser compatibility (including Firefox)
const TOOL_ICONS: Record<string, string> = {
  'execute_code': '💻',
  'shell': '🐚',
  'read_file': '📄',
  'write_file': '📝',
  'edit_file': '✏️',
  'delete_file': '🗑️',
  'list_files': '📁',
  'remember': '🧠',
  'recall': '📚',
  'self_update': '🔄',
  'restart_server': '🔁',
  'switch_provider': '🔀',
  'consult_mistral': '💭',
};

function getToolIcon(toolName: string): string {
  return TOOL_ICONS[toolName] || '🔧';
}

export function ToolBadge({ toolCall }: ToolBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const formatInput = (input: unknown): string => {
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      return String(input);
    }
  };

  return (
    <span 
      className="tool-badge"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {getToolIcon(toolCall.name)} {toolCall.name}
      {showTooltip && (
        <div className="tool-tooltip">
          <div className="tool-tooltip-header">{toolCall.name}</div>
          <pre className="tool-tooltip-content">{formatInput(toolCall.input)}</pre>
        </div>
      )}
    </span>
  );
}
