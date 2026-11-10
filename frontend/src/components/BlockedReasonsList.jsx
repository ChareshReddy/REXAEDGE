import React, { useState, useMemo } from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * Cleans up and applies plain-language formatting to diagnostic error messages:
 * - "Alternative 14 already exists in BOM A1BH0214C/1012/1" -> "Alternative 14 already exists for A1BH0214C in plant 1012."
 * - Removes internal keys like material/plant/usage joined with slashes.
 * - For sub-assemblies (level 1 or deeper), prefixes with "<material>: <message>".
 * - Level 0 errors have NO prefix.
 */
export function cleanDiagnosticMessage(raw, fallbackLevel = 0, fallbackParent = '') {
  if (!raw) return '';
  let str = String(raw).trim();

  // Strip technical prefixes
  str = str.replace(/^Cannot copy(?: BOM)?:\s*/i, '');
  str = str.replace(/^SAP BAPI Error:\s*/i, '');

  let level = fallbackLevel;
  let parentMat = fallbackParent;

  // Extract level and BOM parent if present, Ex. "(BOM of B1BH0214C, level 1)"
  const bomOfMatch = str.match(/\(BOM of ([^,\)]+),\s*level\s*(\d+)\)/i);
  if (bomOfMatch) {
    parentMat = bomOfMatch[1].trim();
    level = parseInt(bomOfMatch[2], 10);
    str = str.replace(/\s*\(BOM of [^,\)]+,\s*level\s*\d+\)/i, '').trim();
  } else {
    const lvlOnlyMatch = str.match(/\(?\blevel\s*(\d+)\)?/i);
    if (lvlOnlyMatch) {
      level = parseInt(lvlOnlyMatch[1], 10);
      str = str.replace(/\s*\(?\blevel\s*\d+\)?/i, '').trim();
    }
  }

  const parentOnlyMatch = str.match(/\(BOM of ([^,\)]+)\)/i);
  if (parentOnlyMatch) {
    if (!parentMat) parentMat = parentOnlyMatch[1].trim();
    str = str.replace(/\s*\(BOM of [^,\)]+\)/i, '').trim();
  }

  // Requirement 3: Plain wording transformations
  // "Alternative 14 already exists in BOM A1BH0214C/1012/1" -> "Alternative 14 already exists for A1BH0214C in plant 1012."
  str = str.replace(
    /Alternative\s+(\d+)\s+already exists in BOM\s+([A-Za-z0-9_\-\.\/]+)\/([A-Za-z0-9]+)\/(\d+)\.?/i,
    'Alternative $1 already exists for $2 in plant $3.'
  );

  str = str.replace(
    /Alternative\s+(\d+)\s+already exists for\s+([A-Za-z0-9_\-\.\/]+)\/([A-Za-z0-9]+)\/(\d+)\.?/i,
    'Alternative $1 already exists for $2 in plant $3.'
  );

  // "BOM Alternative 01 already exists in plant 1010 (STLAN=1) - skipped (strict no-overwrite)"
  str = str.replace(
    /BOM\s+Alternative\s+(\d+)\s+already exists in plant\s+([A-Za-z0-9]+)\s*\(STLAN=\d+\)[^\.]*/i,
    'Alternative $1 already exists in plant $2.'
  );

  str = str.replace(
    /Alternative\s+(\d+)\s+already exists in plant\s+([A-Za-z0-9]+)\s*\(STLAN=\d+\)[^\.]*/i,
    'Alternative $1 already exists in plant $2.'
  );

  // Generic "in BOM MAT/PLANT/USAGE" -> "for MAT in plant PLANT"
  str = str.replace(
    /\bin BOM\s+([A-Za-z0-9_\-\.\/]+)\/([A-Za-z0-9]+)\/(\d+)\.?/i,
    'for $1 in plant $2.'
  );

  // Generic "for material MAT/PLANT/USAGE" -> "for material MAT in plant PLANT"
  str = str.replace(
    /\bfor material\s+([A-Za-z0-9_\-\.\/]+)\/([A-Za-z0-9]+)(?:\/(\d+))?\.?/i,
    'for material $1 in plant $2.'
  );

  // "with BOM usage X" -> clean up technical jargon
  str = str.replace(/\s+with BOM usage\s+\d+/i, '');

  str = str.trim();

  // Requirement 2: Sub-assembly prefix (level 1 or deeper)
  if (level >= 1 && parentMat) {
    if (!str.startsWith(`${parentMat}:`)) {
      str = `${parentMat}: ${str}`;
    }
  }

  // Punctuation normalization
  if (str && !/[.!?:;]$/.test(str)) {
    str += '.';
  }

  return str;
}

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
  maxInitial = 3
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
    return (
      <div className="sap-diagnostic-item" style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: '12px', lineHeight: 1.4 }}>
        <AlertCircle size={13} style={{ color: 'var(--sap-error-text, #b45309)', flexShrink: 0, marginTop: 2 }} />
        <span style={{ color: 'var(--sap-text-dark, #0f172a)', wordBreak: 'break-word' }}>{cleanMsg}</span>
      </div>
    );
  }

  const visibleItems = isExpanded ? items : items.slice(0, maxInitial);

  return (
    <div className="sap-diagnostic-errors" style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '12px', lineHeight: 1.4 }}>
      {visibleItems.map((item, idx) => (
        <div key={idx} className="sap-diagnostic-item" style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <AlertCircle size={13} style={{ color: 'var(--sap-error-text, #b45309)', flexShrink: 0, marginTop: 2 }} />
          <span style={{ color: 'var(--sap-text-dark, #0f172a)', wordBreak: 'break-word' }}>{item.text}</span>
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
