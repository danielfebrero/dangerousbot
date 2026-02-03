import { useMemo, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js';

// Configure marked avec highlight.js
marked.setOptions({
  gfm: true,
  breaks: true
});

// Custom renderer pour highlight.js
const renderer = new marked.Renderer();

// Escape HTML pour stocker dans data attribute
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

renderer.code = function({ text, lang }: { text: string; lang?: string }) {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
  const highlighted = hljs.highlight(text, { language }).value;
  const escapedText = escapeHtml(text);
  return `<div class="code-block-wrapper">
    <button class="copy-btn copy-code-btn" data-copy-text="${escapedText}" title="Copier le code">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    </button>
    <pre><code class="hljs language-${language}">${highlighted}</code></pre>
  </div>`;
};

renderer.codespan = function({ text }: { text: string }) {
  return `<code class="inline-code">${text}</code>`;
};

// Custom renderer pour les blockquotes avec bouton copie
renderer.blockquote = function({ text }: { text: string }) {
  // Le text contient déjà du HTML parsé, on doit extraire le texte brut pour la copie
  const plainText = text.replace(/<[^>]*>/g, '').trim();
  const escapedText = escapeHtml(plainText);
  return `<div class="blockquote-wrapper">
    <button class="copy-btn copy-quote-btn" data-copy-text="${escapedText}" title="Copier la citation">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    </button>
    <blockquote>${text}</blockquote>
  </div>`;
};

// Custom renderer pour les liens - ouvrir dans un nouvel onglet
renderer.link = function({ href, text }: { href: string; text: string }) {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
};

marked.use({ renderer });

interface MarkdownProps {
  content: string;
}

export function Markdown({ content }: MarkdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    try {
      return marked.parse(content) as string;
    } catch {
      return content;
    }
  }, [content]);

  // Fonction pour gérer la copie
  const handleCopy = useCallback(async (e: Event) => {
    const button = e.currentTarget as HTMLButtonElement;
    const textToCopy = button.getAttribute('data-copy-text') || '';

    // Decode HTML entities
    const textarea = document.createElement('textarea');
    textarea.innerHTML = textToCopy;
    const decodedText = textarea.value;

    try {
      await navigator.clipboard.writeText(decodedText);
      button.classList.add('copied');
      button.title = 'Copié !';

      setTimeout(() => {
        button.classList.remove('copied');
        button.title = button.classList.contains('copy-code-btn')
          ? 'Copier le code'
          : 'Copier la citation';
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  // Attacher les event listeners après le rendu
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const copyButtons = container.querySelectorAll('.copy-btn');
    copyButtons.forEach(btn => {
      btn.addEventListener('click', handleCopy);
    });

    return () => {
      copyButtons.forEach(btn => {
        btn.removeEventListener('click', handleCopy);
      });
    };
  }, [html, handleCopy]);

  return (
    <div
      ref={containerRef}
      className="markdown-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
