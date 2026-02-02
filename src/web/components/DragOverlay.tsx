import React from 'react';

interface DragOverlayProps {
  isDragging: boolean;
}

export function DragOverlay({ isDragging }: DragOverlayProps) {
  if (!isDragging) return null;

  return (
    <div className="drag-overlay">
      <div className="drag-overlay-content">
        <div className="drag-overlay-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17,8 12,3 7,8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div className="drag-overlay-text">
          Déposez vos images ici
        </div>
        <div className="drag-overlay-subtext">
          Relâchez pour joindre au message
        </div>
      </div>
    </div>
  );
}
