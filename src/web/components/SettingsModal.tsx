import React from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  showAllSources: boolean;
  onToggleSources: (showAll: boolean) => void;
}

export function SettingsModal({ isOpen, onClose, showAllSources, onToggleSources }: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="setting-item">
            <div className="setting-info">
              <label className="setting-label">Show messages from all sources</label>
              <p className="setting-description">
                When enabled, shows messages from both webapp and Telegram.
                When disabled, only shows webapp messages.
              </p>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={showAllSources}
                onChange={(e) => onToggleSources(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
