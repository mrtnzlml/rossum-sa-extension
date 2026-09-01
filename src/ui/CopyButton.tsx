import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import styles from './CopyButton.module.css';

// Copy-to-clipboard with a transient confirmation (design system). This pattern was
// hand-written in seven places before this component existed; each one owned its own
// timer and its own label swap, and several mutated `textContent` directly, which
// fights the renderer. `text` may be a string or a getter, so a caller can avoid
// serialising something expensive on every render.
export default function CopyButton({
  text,
  label = 'Copy',
  className,
}: {
  text: string | (() => string);
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The timer is owned by the effect that owns the component: a remount otherwise
  // leaves it running against a destroyed node.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <button
      type="button"
      class={styles.copy + (className ? ' ' + className : '')}
      onClick={() => {
        const value = typeof text === 'function' ? text() : text;
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1000);
        });
      }}
    >
      {copied ? '\u2713 Copied' : label}
    </button>
  );
}
