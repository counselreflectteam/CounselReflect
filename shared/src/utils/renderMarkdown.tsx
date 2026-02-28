import React from 'react';

/**
 * Simple markdown renderer for chatbot messages
 * Supports: code blocks, inline code, bold, italic, bullet points
 */
export const renderMarkdown = (text: string): React.ReactNode => {
  // Split by code blocks first
  const parts = text.split(/(```[\s\S]*?```|`[^`]+`)/g);

  return parts.map((part, i) => {
    // Code blocks
    if (part.startsWith('```') && part.endsWith('```')) {
      const code = part.slice(3, -3).replace(/^\w+\n/, ''); // Remove language identifier
      return <pre key={i} className="bg-slate-200 dark:bg-slate-900 rounded p-2 my-2 text-xs overflow-x-auto"><code>{code}</code></pre>;
    }
    // Inline code
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-slate-200 dark:bg-slate-900 rounded px-1 text-xs">{part.slice(1, -1)}</code>;
    }

    // Process other markdown
    let processed = part
      // Bold
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      // Bullet points
      .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>');

    // Wrap lists
    if (processed.includes('<li>')) {
      processed = processed.replace(/(<li>.*<\/li>)+/g, '<ul class="list-disc pl-4 my-1">$&</ul>');
    }

    return <span key={i} dangerouslySetInnerHTML={{ __html: processed }} />;
  });
};
