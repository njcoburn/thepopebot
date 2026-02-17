'use client';

import { Streamdown } from 'streamdown';
import { cn } from '../utils.js';
import { SpinnerIcon, FileTextIcon } from './icons.js';

export function PreviewMessage({ message, isLoading }) {
  const isUser = message.role === 'user';

  // Extract text from parts (AI SDK v5+) or fall back to content
  const text =
    message.parts
      ?.filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join('\n') ||
    message.content ||
    '';

  // Extract file parts
  const fileParts = message.parts?.filter((p) => p.type === 'file') || [];
  const imageParts = fileParts.filter((p) => p.mediaType?.startsWith('image/'));
  const otherFileParts = fileParts.filter((p) => !p.mediaType?.startsWith('image/'));

  return (
    <div
      className={cn(
        'flex gap-4 w-full',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        )}
      >
        {imageParts.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {imageParts.map((part, i) => (
              <img
                key={i}
                src={part.url}
                alt="attachment"
                className="max-h-64 max-w-full rounded-lg object-contain"
              />
            ))}
          </div>
        )}
        {otherFileParts.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {otherFileParts.map((part, i) => (
              <div
                key={i}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs',
                  isUser
                    ? 'bg-primary-foreground/20'
                    : 'bg-foreground/10'
                )}
              >
                <FileTextIcon size={12} />
                <span className="max-w-[150px] truncate">
                  {part.name || part.mediaType || 'file'}
                </span>
              </div>
            ))}
          </div>
        )}
        {text ? (
          isUser ? (
            <div className="whitespace-pre-wrap break-words">{text}</div>
          ) : (
            <Streamdown mode={isLoading ? 'streaming' : 'static'}>{text}</Streamdown>
          )
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <SpinnerIcon size={14} />
            <span>Working...</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ThinkingMessage() {
  return (
    <div className="flex gap-4 w-full justify-start">
      <div className="flex items-center gap-2 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
        <SpinnerIcon size={14} />
        <span>Thinking...</span>
      </div>
    </div>
  );
}
