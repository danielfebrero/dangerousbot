import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ContentPart } from '../types';

interface MessageInputProps {
  onSend: (text: string, images?: ContentPart[]) => void;
  onStop?: () => void;
  isProcessing?: boolean;
  disabled?: boolean;
  tokenUsage?: { input_tokens: number; output_tokens: number; cost: number } | null;
}

export function MessageInput({ onSend, onStop, isProcessing, disabled, tokenUsage }: MessageInputProps) {
  const [text, setText] = useState('');
  const [selectedImages, setSelectedImages] = useState<ContentPart[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages: ContentPart[] = [];
    
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = reader.result as string;
          resolve(base64.split(',')[1]); // Remove data:image/xxx;base64, prefix
        };
      });
      reader.readAsDataURL(file);
      
      const data = await base64Promise;
      newImages.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: file.type,
          data
        }
      });
    }

    setSelectedImages(prev => [...prev, ...newImages]);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const removeImage = useCallback((index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = text.trim();
    if ((trimmed || selectedImages.length > 0) && !disabled) {
      onSend(trimmed, selectedImages.length > 0 ? selectedImages : undefined);
      setText('');
      setSelectedImages([]);
    }
  }, [text, selectedImages, disabled, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, [text]);

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="message-input-container">
      {tokenUsage && (
        <div className="token-counter">
          Tokens: {tokenUsage.input_tokens + tokenUsage.output_tokens} | Coût: ${tokenUsage.cost.toFixed(4)}
        </div>
      )}
      <div className="message-input-wrapper">
        {selectedImages.length > 0 && (
          <div className="image-preview">
            {selectedImages.map((img, idx) => (
              <div key={idx} className="image-preview-item">
                <img 
                  src={`data:${img.source.media_type};base64,${img.source.data}`}
                  alt={`Selected ${idx + 1}`}
                />
                <button
                  type="button"
                  className="image-remove"
                  onClick={() => removeImage(idx)}
                  title="Remove image"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageSelect}
          accept="image/*"
          multiple
          style={{ display: 'none' }}
        />
        <button
          type="button"
          className="input-button"
          onClick={handleAttachClick}
          disabled={disabled}
          title="Attach image"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </button>
        <textarea
          ref={textareaRef}
          className="message-input"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Écris ton message..."
          rows={1}
          disabled={disabled}
        />
        {isProcessing ? (
          <button
            type="button"
            className="input-button stop-button"
            onClick={onStop}
            title="Arrêter la génération"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button 
            type="button"
            className="input-button send-button"
            onClick={handleSubmit}
            disabled={disabled || (!text.trim() && selectedImages.length === 0)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
