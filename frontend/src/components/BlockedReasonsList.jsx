import React, { useState, useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { cleanDiagnosticMessage } from '../utils/bulkBomStatusUtils.js';

export { cleanDiagnosticMessage };

/**
 * Parses and splits problems into an array of clean items.
 */
export function splitProblems(problems, fallbackMessage) {
  let list = [];

  if (Array.isArray(problems) && problems.length > 0) {
    list = problems;
  } else if (typeof fallbackMessage === 'string' && fallbackMessage.trim()) {
    let clean = fallbackMessage.replace(/^Cannot copy(?: BOM)?:\s*/i, '').trim();
    list = clean.split(/,\s*(?=(?:Component|Material|Consistency|RFC|Error|The material|Alternative|BOM|Source)\b)/i);
  }

  const flattened = [];
  for (const item of list) {
    if (!item) continue;
    if (typeof item === 'string') {
      const parts = item.split(/,\s*(?=(?:Component|Material|Consistency|RFC|Error|The material|Alternative|BOM|Source)\b)/i);
      for (const p of parts) {
        if (p && p.trim()) flattened.push(p.trim());
      }
    } else if (typeof item === 'object') {
      flattened.push(item);
    }
  }

  const cleanedList = [];
  const seen = new Set();

  for (const raw of flattened) {
    let rawStr = typeof raw === 'string' ? raw : (raw.text || raw.message || '');
    let lvl = typeof raw === 'object' && raw.level !== undefined ? raw.level : 0;
    let parent = typeof raw === 'object' && raw.material ? raw.material : '';

    const cleanedText = cleanDiagnosticMessage(rawStr, lvl, parent);
    if (cleanedText && !seen.has(cleanedText)) {
      seen.add(cleanedText);
      cleanedList.push({
        text: cleanedText,
        raw: rawStr
      });
    }
  }

  return cleanedList;
}

/**
 * Compact Diagnostic Message error display:
 * - No bordered box
 * - No "Cannot copy: N problem(s) found" header
 * - No "LEVEL 0" label
 * - Small red icon + message on one line (wraps only when long)
 * - Normal row height
 * - Max 3 visible, then "+N more" expanding in place
 */
export default function BlockedReasonsList({
  problems = [],
  totalBoms = 0,
  message = '',
  maxInitial = 2
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const items = useMemo(
    () => splitProblems(problems, message),
    [problems, message]
  );

  const totalCount = items.length;

  if (totalCount === 0) {
    if (!message) return null;
    const cleanMsg = cleanDiagnosticMessage(message);
    const isLong = cleanMsg.length > 90;

    return (
      <div className="sap-diagnostic-item" style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: '12px', lineHeight: 1.4, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
        <AlertCircle size={13} style={{ color: 'var(--color-danger, #B42318)', flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              color: 'var(--sap-text-dark, #0f172a)',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              display: isExpanded ? 'block' : '-webkit-box',
              WebkitLineClamp: isExpanded ? 'unset' : 2,
              WebkitBoxOrient: 'vertical',
              overflow: isExpanded ? 'visible' : 'hidden'
            }}
          >
            {cleanMsg}
          </span>
          {isLong && (
            <div style={{ marginTop: 2 }}>
              <button
                type="button"
                className="toggle-messages-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--sap-link, #0070f2)',
                  cursor: 'pointer',
                  padding: '1px 0',
                  fontSize: '11px',
                  fontWeight: 600,
                  textAlign: 'left',
                  textDecoration: 'underline',
                  display: 'inline-block'
                }}
              >
                {isExpanded ? 'Show less' : 'more'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const visibleItems = isExpanded ? items : items.slice(0, maxInitial);

  return (
    <div className="sap-diagnostic-errors" style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '12px', lineHeight: 1.4, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
      {visibleItems.map((item, idx) => (
        <div key={idx} className="sap-diagnostic-item" style={{ display: 'flex', alignItems: 'flex-start', gap: 6, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
          <AlertCircle size={13} style={{ color: 'var(--color-danger, #B42318)', flexShrink: 0, marginTop: 2 }} />
          <span
            style={{
              color: 'var(--sap-text-dark, #0f172a)',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              display: isExpanded ? 'block' : '-webkit-box',
              WebkitLineClamp: isExpanded ? 'unset' : 2,
              WebkitBoxOrient: 'vertical',
              overflow: isExpanded ? 'visible' : 'hidden'
            }}
          >
            {item.text}
          </span>
        </div>
      ))}

      {totalCount > maxInitial && (
        <div style={{ marginTop: 1 }}>
          <button
            type="button"
            className="toggle-messages-btn"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--sap-link, #0070f2)',
              cursor: 'pointer',
              padding: '1px 0',
              fontSize: '11px',
              fontWeight: 600,
              textAlign: 'left',
              textDecoration: 'underline',
              display: 'inline-block'
            }}
          >
            {isExpanded ? 'Show less' : `+${totalCount - maxInitial} more`}
          </button>
        </div>
      )}
    </div>
  );
}
