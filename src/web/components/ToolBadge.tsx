import React, { useState } from 'react';
import { ToolCall } from '../types';

interface ToolBadgeProps {
  toolCall: ToolCall;
}

const TOOL_ICONS: Record<string, string> = {
  'execute_code': String.fromCodePoint(0x1F4BB),
  'shell': String.fromCodePoint(0x1F41A),
  'read_file': String.fromCodePoint(0x1F4C4),
  'write_file': String.fromCodePoint(0x1F4DD),
  'edit_file': String.fromCodePoint(0x270F, 0xFE0F),
  'delete_file': String.fromCodePoint(0x1F5D1, 0xFE0F),
  'list_files': String.fromCodePoint(0x1F4C1),
  'remember': String.fromCodePoint(0x1F9E0),
  'recall': String.fromCodePoint(0x1F4DA),
  'self_update': String.fromCodePoint(0x1F504),
  'restart_server': String.fromCodePoint(0x1F501),
  'switch_provider': String.fromCodePoint(0x1F500),
  'consult_mistral': String.fromCodePoint(0x1F4AD),
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
