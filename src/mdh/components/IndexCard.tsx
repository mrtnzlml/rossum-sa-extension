// src/mdh/components/IndexCard.tsx
import { h } from 'preact';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { confirmModal } from './Modal.jsx';
import JsonEditor from './JsonEditor.jsx';
import CopyButton from '../../ui/CopyButton.jsx';
import styles from './SearchIndexBuilder.module.css';
import { firstValidationLine } from '../searchIndexDef.js';

export default function IndexCard({
  name,
  badges = [],
  definition,
  canDrop,
  onDrop,
  onEdit,
  cardClass,
  meta,
  notice,
  summary,
  onCheck,
  checkNeedsPath,
}: {
  name: string;
  badges?: any[];
  definition?: any;
  canDrop?: boolean;
  onDrop?: () => void;
  onEdit?: () => void;
  cardClass?: string;
  meta?: any;
  // Rendered between header and body, and visible whether or not the card is
  // expanded — it carries state the reader must not have to open the card to see.
  notice?: ComponentChildren;
  // A one-line "what does this cover?" shown beside the name, so a collapsed
  // card still says which index is which.
  summary?: string;
  // Runs one read-only probe and resolves the rows. Present only for an index
  // the panel has confirmed is READY — see the panel for why that matters.
  onCheck?: (value: string, path?: string) => Promise<any[]>;
  // True when the definition names no fields (a dynamic index), so the strip has
  // to ASK which path to search. It must never guess, and it must never emit a
  // wildcard path — that syntax is unverified against this deployment.
  checkNeedsPath?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [checkOpen, setCheckOpen] = useState(false);
  const [checkValue, setCheckValue] = useState('');
  const [checkPath, setCheckPath] = useState('');
  const [checkRows, setCheckRows] = useState<any[] | null>(null);
  // A failed request is a third outcome, distinct from "no rows" — see the Run
  // handler below for why it must never collapse into the empty-result copy.
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  function handleDrop() {
    confirmModal(
      `Drop ${name}?`,
      `This will permanently drop "${name}". This cannot be undone.`,
      onDrop!,
    );
  }

  return (
    <div
      class={
        'record-card' +
        (expanded ? ' record-card-expanded' : '') +
        (cardClass ? ' ' + cardClass : '')
      }
    >
      <div
        class="record-card-header"
        style="cursor:pointer"
        onClick={(e: any) => {
          if (!e.target.closest('.record-actions')) setExpanded(!expanded);
        }}
      >
        <span class="record-chevron">{expanded ? '\u25BC' : '\u25B6'}</span>
        <span class="record-summary">
          <strong>{name}</strong>
          {summary ? <span style="margin-left:8px">{summary}</span> : null}
          {badges.map(({ text, cls, title }) => (
            <span
              class={'index-badge' + (cls ? ' ' + cls : '')}
              style="margin-left:6px"
              title={title || undefined}
            >
              {text}
            </span>
          ))}
        </span>
        {meta && <span class="index-card-meta">{meta}</span>}
        <span class="record-actions">
          {onCheck && (
            <button
              class="action-check"
              onClick={() => {
                setCheckOpen(!checkOpen);
                setCheckRows(null);
                setCheckError(null);
              }}
            >
              Check
            </button>
          )}
          {onEdit && (
            <button class="action-edit" onClick={onEdit}>
              Edit
            </button>
          )}
          {definition && (
            <CopyButton className="action-copy" text={() => JSON.stringify(definition, null, 2)} />
          )}
          {canDrop && onDrop && (
            <button class="action-delete" onClick={handleDrop}>
              Del
            </button>
          )}
        </span>
      </div>
      {notice && <div class="record-card-notice">{notice}</div>}
      {checkOpen && onCheck && (
        <div class={styles.checkStrip}>
          {checkNeedsPath && (
            <input
              data-testid="check-path"
              class="input"
              placeholder="field path"
              value={checkPath}
              onInput={(e: any) => setCheckPath(e.target.value)}
            />
          )}
          <input
            data-testid="check-value"
            class="input"
            placeholder="a value from your documents"
            value={checkValue}
            onInput={(e: any) => setCheckValue(e.target.value)}
          />
          <button
            data-testid="check-run"
            class="btn btn-sm btn-primary"
            disabled={checking || (checkNeedsPath && !checkPath.trim())}
            onClick={async () => {
              setChecking(true);
              try {
                const rows = await onCheck(checkValue, checkPath);
                setCheckRows(rows);
                setCheckError(null);
              } catch (err: any) {
                // A failed request (network, auth, a malformed definition) is not a
                // miss — it must never render as "No match", or the strip becomes
                // exactly the kind of silent failure Check exists to catch.
                setCheckRows(null);
                const detail = firstValidationLine(err?.message);
                setCheckError(
                  detail ? `The check could not run: ${detail}` : 'The check could not run.',
                );
              }
              setChecking(false);
            }}
          >
            Run
          </button>
          {checkError ? (
            <div class={styles.checkError}>{checkError}</div>
          ) : (
            checkRows &&
            (checkRows.length === 0 ? (
              <div class={styles.checkEmpty}>
                No match. Either this field is not in the index, or the value is not in the data.
              </div>
            ) : (
              <ol class={styles.checkRows}>
                {checkRows.map((r) => (
                  <li>
                    <span class={styles.checkScore}>{Number(r.score ?? 0).toFixed(2)}</span>
                    <span>{JSON.stringify(r)}</span>
                  </li>
                ))}
              </ol>
            ))
          )}
        </div>
      )}
      {expanded && definition && (
        <div class="record-card-body">
          <JsonEditor value={JSON.stringify(definition, null, 2)} compact readOnly minHeight="0" />
        </div>
      )}
    </div>
  );
}
