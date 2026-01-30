import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ContentPart } from '../types';

interface MessageInputProps {
  onSend: (text: string, images?: ContentPart[]) => void;
  onStop?: () => void;
  isProcessing?: boolean;
  disabled?: boolean;
}

export function MessageInput({ onSend, onStop, isProcessing, disabled }: MessageInputProps) {
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
          resolve(base64.split(',')[1]);
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
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [text]);

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="message-input-container">
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
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="message-input-wrapper">
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
          aria-label="Attach image"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          className="message-input"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message..."
          rows={1}
          disabled={disabled}
        />

        {isProcessing ? (
          <button
            type="button"
            className="input-button stop-button"
            onClick={onStop}
            aria-label="Stop"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className="input-button send-button"
            onClick={handleSubmit}
            disabled={disabled || (!text.trim() && selectedImages.length === 0)}
            aria-label="Send"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
