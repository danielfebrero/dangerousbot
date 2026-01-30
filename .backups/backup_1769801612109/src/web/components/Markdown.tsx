import React, { useMemo } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js';

// Configure marked avec highlight.js
marked.setOptions({
  gfm: true,
  breaks: true
});

// Custom renderer pour highlight.js
const renderer = new marked.Renderer();

renderer.code = function({ text, lang }: { text: string; lang?: string }) {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
  const highlighted = hljs.highlight(text, { language }).value;
  return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
};

renderer.codespan = function({ text }: { text: string }) {
  return `<code class="inline-code">${text}</code>`;
};

marked.use({ renderer });

interface MarkdownProps {
  content: string;
}

export function Markdown({ content }: MarkdownProps) {
  const html = useMemo(() => {
    try {
      return marked.parse(content) as string;
    } catch {
      return content;
    }
  }, [content]);

  return (
    <div 
      className="markdown-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
