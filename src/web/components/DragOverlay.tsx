import React, { useState, useEffect, useCallback } from 'react';

interface DragOverlayProps {
  onFilesDrop: (files: File[]) => void;
  disabled?: boolean;
}

export function DragOverlay({ onFilesDrop, disabled }: DragOverlayProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);

  const handleDragEnter = useCallback((e: DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    
    // Only handle if files are being dragged
    if (e.dataTransfer?.types.includes('Files')) {
      setDragCounter(prev => prev + 1);
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    
    setDragCounter(prev => {
      const newCount = prev - 1;
      if (newCount <= 0) {
        setIsDragging(false);
        return 0;
      }
      return newCount;
    });
  }, [disabled]);

  const handleDragOver = useCallback((e: DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    // Set drop effect to copy for visual feedback
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, [disabled]);

  const handleDrop = useCallback((e: DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(false);
    setDragCounter(0);
    
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const imageFiles = Array.from(files).filter(file => 
        file.type.startsWith('image/')
      );
      
      if (imageFiles.length > 0) {
        onFilesDrop(imageFiles);
      }
    }
  }, [disabled, onFilesDrop]);

  useEffect(() => {
    // Add global event listeners
    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);

    return () => {
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

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
