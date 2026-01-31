import React from 'react';
import { Message } from '../types';

interface ProviderSwitchMessageProps {
  message: Message;
}

const providerIcons: Record<string, string> = {
  claude: '🧠',
  kimi: '🌙',
  mistral: '🌪️',
  unknown: '❓'
};

const providerNames: Record<string, string> = {
  claude: 'Claude',
  kimi: 'Kimi',
  mistral: 'Mistral',
  unknown: 'Inconnu'
};

export function ProviderSwitchMessage({ message }: ProviderSwitchMessageProps) {
  const from = message.providerSwitch?.from || 'unknown';
  const to = message.providerSwitch?.to || 'unknown';
  const reason = message.providerSwitch?.reason || 'Basculé automatiquement';
  
  const isFallback = reason.toLowerCase().includes('indisponible') || 
                     reason.toLowerCase().includes('unavailable') ||
                     reason.toLowerCase().includes('failed');
  
  const isManual = reason.toLowerCase().includes('user_request') ||
                   reason.toLowerCase().includes('manuel');

  return (
    <div className="provider-switch-container">
      <div className={`provider-switch-badge ${isFallback ? 'fallback' : isManual ? 'manual' : 'auto'}`}>
        <div className="provider-switch-icons">
          <span className="provider-icon from" title={providerNames[from]}>
            {providerIcons[from]}
          </span>
          <span className="provider-arrow">
            {isFallback ? '⚡' : isManual ? '↔️' : '→'}
          </span>
          <span className="provider-icon to" title={providerNames[to]}>
            {providerIcons[to]}
          </span>
        </div>
        <div className="provider-switch-info">
          <span className="provider-names">
            {providerNames[from]} → {providerNames[to]}
          </span>
          <span className={`provider-reason ${isFallback ? 'fallback-reason' : ''}`}>
            {isFallback ? '⚠️ ' : ''}{reason}
          </span>
        </div>
      </div>
    </div>
  );
}
