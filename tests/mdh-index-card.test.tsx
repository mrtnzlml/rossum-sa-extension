// @vitest-environment jsdom
//
// IndexCard is shared by the Search Indexes panel, the Indexes panel and the
// Stages view. The three props added for the Search Indexes migration all
// default so the other two callers behave exactly as before — these tests pin
// both the defaults and the new behaviour.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import IndexCard from '../src/mdh/components/IndexCard.jsx';

vi.mock('../src/mdh/components/JsonEditor.jsx', () => ({
  default: () => <div class="json-editor-stub" />,
}));

function mount(node: any) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  render(node, root);
  return root;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('IndexCard new props', () => {
  it('starts expanded by default, so existing callers are unchanged', () => {
    const root = mount(<IndexCard name="x" definition={{ a: 1 }} />);
    expect(root.querySelector('.record-card-body')).not.toBeNull();
  });

  it('renders a notice, and keeps it visible when the card is collapsed', () => {
    const root = mount(<IndexCard name="x" definition={{ a: 1 }} notice={<span>heads up</span>} />);
    expect(root.querySelector('.record-card-notice')!.textContent).toContain('heads up');

    // The notice sits outside the body, so collapsing must not hide it.
    act(() => {
      root.querySelector<HTMLElement>('.record-card-header')!.click();
    });
    expect(root.querySelector('.record-card-body')).toBeNull();
    expect(root.querySelector('.record-card-notice')!.textContent).toContain('heads up');
  });

  it('renders no notice element when the prop is absent', () => {
    const root = mount(<IndexCard name="x" definition={{ a: 1 }} />);
    expect(root.querySelector('.record-card-notice')).toBeNull();
  });

  it('renders an Edit button only when onEdit is given, and calls it', () => {
    const onEdit = vi.fn();
    const bare = mount(<IndexCard name="x" definition={{ a: 1 }} />);
    expect(bare.querySelector('.action-edit')).toBeNull();

    const root = mount(<IndexCard name="x" definition={{ a: 1 }} onEdit={onEdit} />);
    root.querySelector<HTMLElement>('.action-edit')!.click();
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('puts a badge title on the badge when one is supplied', () => {
    const root = mount(
      <IndexCard name="x" definition={{ a: 1 }} badges={[{ text: 'ready', title: 'Built' }]} />,
    );
    expect(root.querySelector('.index-badge')!.getAttribute('title')).toBe('Built');
  });

  it('omits the title attribute when a badge has none', () => {
    const root = mount(<IndexCard name="x" definition={{ a: 1 }} badges={[{ text: 'ready' }]} />);
    expect(root.querySelector('.index-badge')!.hasAttribute('title')).toBe(false);
  });
});

// Finding 3, 2026-08-31 review: on a dynamic index (checkNeedsPath) Run used to
// stay enabled with an empty path box, and checkPipeline then emitted path: [] —
// a search with no path matches nothing, silently.
describe('IndexCard — Check strip', () => {
  it('disables Run until a path is given when the index needs one', () => {
    const onCheck = vi.fn().mockResolvedValue([]);
    const root = mount(
      <IndexCard
        name="x"
        definition={{ mappings: { dynamic: true } }}
        onCheck={onCheck}
        checkNeedsPath
      />,
    );
    act(() => {
      root.querySelector<HTMLElement>('.action-check')!.click();
    });
    const run = root.querySelector<HTMLButtonElement>('[data-testid="check-run"]')!;
    expect(run.disabled).toBe(true);

    const path = root.querySelector<HTMLInputElement>('[data-testid="check-path"]')!;
    act(() => {
      path.value = 'vendor_name';
      path.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(root.querySelector<HTMLButtonElement>('[data-testid="check-run"]')!.disabled).toBe(
      false,
    );

    // Whitespace-only is not a path either.
    act(() => {
      path.value = '   ';
      path.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(root.querySelector<HTMLButtonElement>('[data-testid="check-run"]')!.disabled).toBe(true);
  });

  it('does not require a path when the index already declares fields', () => {
    const onCheck = vi.fn().mockResolvedValue([]);
    const root = mount(
      <IndexCard
        name="x"
        definition={{ mappings: { dynamic: false, fields: { name: {} } } }}
        onCheck={onCheck}
        checkNeedsPath={false}
      />,
    );
    act(() => {
      root.querySelector<HTMLElement>('.action-check')!.click();
    });
    expect(root.querySelector('[data-testid="check-path"]')).toBeNull();
    expect(root.querySelector<HTMLButtonElement>('[data-testid="check-run"]')!.disabled).toBe(
      false,
    );
  });
});
