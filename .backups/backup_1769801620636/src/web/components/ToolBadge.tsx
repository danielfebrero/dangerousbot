import React, { useState, useRef } from 'react';
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
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const formatInput = (input: unknown): string => {
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      return String(input);
    }
  };

  const handleMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setShowTooltip(true);
  };

  const handleMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false);
    }, 200);
  };

  return (
    <span 
      className="tool-badge"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ position: 'relative' }}
    >
      {getToolIcon(toolCall.name)} {toolCall.name}
      {showTooltip && (
        <div 
          className="tool-tooltip"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="tool-tooltip-header">{toolCall.name}</div>
          <pre className="tool-tooltip-content">{formatInput(toolCall.input)}</pre>
        </div>
      )}
    </span>
  );
}
