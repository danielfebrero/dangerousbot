import React, { useState } from 'react';
import { ToolCall } from '../types';

interface ToolBadgeProps {
  toolCall: ToolCall;
}

const TOOL_ICONS: Record<string, string> = {
  'execute_code': '\ud83d\udcbb',
  'shell': '\ud83d\udc1a',
  'read_file': '\ud83d\udcc4',
  'write_file': '\ud83d\udcdd',
  'edit_file': '\u270f\ufe0f',
  'delete_file': '\ud83d\uddd1\ufe0f',
  'list_files': '\ud83d\udcc1',
  'remember': '\ud83e\udde0',
  'recall': '\ud83d\udcda',
  'self_update': '\ud83d\udd04',
  'restart_server': '\ud83d\udd01',
  'switch_provider': '\ud83d\udd00',
  'consult_mistral': '\ud83d\udcad',
};

function getToolIcon(toolName: string): string {
  return TOOL_ICONS[toolName] || '\ud83d\udd27';
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
