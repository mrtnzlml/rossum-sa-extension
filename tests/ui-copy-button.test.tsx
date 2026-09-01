// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { h, render } from 'preact';
import CopyButton from '../src/ui/CopyButton.jsx';

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

describe('CopyButton', () => {
  it('copies the text it is given', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    render(<CopyButton text="hello" />, root);
    (root.querySelector('button') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('confirms after a copy and returns to the resting label', async () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    document.body.appendChild(root);
    render(<CopyButton text="hello" />, root);
    const btn = root.querySelector('button') as HTMLButtonElement;
    expect(btn.textContent).toBe('Copy');
    btn.click();
    // Preact defers the re-render triggered by setState to a microtask
    // (`Promise.resolve().then(process)`), one tick after the clipboard
    // promise's own `.then()` resolves — a single `await Promise.resolve()`
    // observes the pre-render DOM. Wait on the condition instead of a fixed
    // tick count, and flush the equivalent microtask after advancing the fake
    // clock with the async variant so the timeout's own re-render is visible.
    await vi.waitFor(() => expect(btn.textContent).toContain('Copied'));
    await vi.advanceTimersByTimeAsync(1200);
    expect(btn.textContent).toBe('Copy');
    vi.useRealTimers();
  });

  // Takes a getter so a caller can copy something expensive to serialise without
  // building it on every render.
  it('accepts a function for the text', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    render(<CopyButton text={() => 'lazy'} />, root);
    (root.querySelector('button') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('lazy');
  });
});
