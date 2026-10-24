import React, { useState, useMemo } from 'react';
import { AlertOctagon, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Parses and formats problem items, grouping them by hierarchy level.
 */
function parseAndGroupProblems(problems, fallbackMessage) {
  let list = [];

  if (Array.isArray(problems) && problems.length > 0) {
    list = problems;
  } else if (typeof fallbackMessage === 'string' && fallbackMessage.trim()) {
    const clean = fallbackMessage.replace(/^Cannot copy:\s*/i, '').trim();
    // Split by comma followed by capitalized start of problem
    list = clean.split(/,\s*(?=(?:Component|Material|Consistency|RFC|Error|The material)\b)/i);
  }

  const itemsWithLevel = [];

  for (const raw of list) {
    if (!raw || !String(raw).trim()) continue;
    const str = String(raw).trim();

    // Extract level from string, e.g. "(BOM of 143, level 0)"
    const lvlMatch = str.match(/level\s*(\d+)/i);
    const level = lvlMatch ? parseInt(lvlMatch[1], 10) : 0;

    // Remove redundant ", level X" from inside the parentheses for cleaner display
    const text = str.replace(/,\s*level\s*\d+\)/i, ')');

    itemsWithLevel.push({
      level,
      text,
      raw: str
    });
  }

  // Ensure items are ordered by level ascending
  itemsWithLevel.sort((a, b) => a.level - b.level);

  return itemsWithLevel;
}

/**
 * BlockedReasonsList: Renders blocked BOM copy problems as a readable grouped list.
 *
 * Requirements:
 * - Heading: "Cannot copy: X problems found in Y BOMs"
 * - Grouped bullets by Level ("Level 0", "Level 1"...)
 * - Show first 8 items with a "Show all" / "Show less" toggle
 * - Keep "blocked" state and clean styling
 */
export default function BlockedReasonsList({
  problems = [],
  totalBoms = 0,
  message = '',
  maxInitial = 8,
  compact = false
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const parsedItems = useMemo(
    () => parseAndGroupProblems(problems, message),
    [problems, message]
  );

  const totalCount = parsedItems.length;

  // Header text: "Cannot copy: 16 problems found in 30 BOMs"
  const headingText = useMemo(() => {
    if (totalCount === 0) {
      return 'Cannot copy: Simulation failed in target plant';
    }
    const probWord = totalCount === 1 ? '1 problem' : `${totalCount} problems`;
    const bomWord = totalBoms && totalBoms > 0
      ? ` found in ${totalBoms} BOM${totalBoms === 1 ? '' : 's'}`
      : ' found';
    return `Cannot copy: ${probWord}${bomWord}`;
  }, [totalCount, totalBoms]);

  if (totalCount === 0) {
    return (
      <div className="sap-blocked-reasons-card" style={{
        marginBottom: 12,
        padding: compact ? '8px 12px' : '12px 16px',
        background: 'rgba(239, 68, 68, 0.08)',
        border: '1px solid var(--sap-error)',
        borderRadius: 'var(--sap-radius)',
        color: 'var(--sap-error)',
        fontSize: '13px',
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}>
        <AlertOctagon size={16} style={{ flexShrink: 0 }} />
        <span>{headingText}</span>
      </div>
    );
  }

  // Items to display based on expand toggle
  const visibleItems = isExpanded ? parsedItems : parsedItems.slice(0, maxInitial);
  const hiddenCount = totalCount - maxInitial;

  // Group visible items by level
  const groupedByLevel = {};
  for (const itm of visibleItems) {
    if (!groupedByLevel[itm.level]) {
      groupedByLevel[itm.level] = [];
    }
    groupedByLevel[itm.level].push(itm);
  }

  const sortedLevels = Object.keys(groupedByLevel)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div
      className="sap-blocked-reasons-card"
      style={{
        marginBottom: compact ? 4 : 14,
        padding: compact ? '8px 12px' : '12px 16px',
        background: 'rgba(239, 68, 68, 0.07)',
        border: '1px solid var(--sap-error)',
        borderRadius: 'var(--sap-radius)',
        color: 'var(--sap-text)',
        fontSize: compact ? '12px' : '13px'
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        color: 'var(--sap-error)',
        fontWeight: 600,
        fontSize: compact ? '12px' : '13.5px',
        marginBottom: 8
      }}>
        <AlertOctagon size={compact ? 15 : 17} style={{ flexShrink: 0 }} />
        <span>{headingText}</span>
      </div>

      {/* Grouped Bullets by Level */}
      <div style={{ paddingLeft: compact ? 2 : 6 }}>
        {sortedLevels.map((lvl) => (
          <div key={lvl} style={{ marginTop: 6, marginBottom: 6 }}>
            <div style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--sap-error)',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              marginBottom: 3
            }}>
              <span style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--sap-error)'
              }} />
              Level {lvl}
            </div>

            <ul style={{ margin: '2px 0 4px 18px', padding: 0 }}>
              {groupedByLevel[lvl].map((itm, idx) => (
                <li
                  key={idx}
                  style={{
                    fontSize: compact ? '11.5px' : '12.5px',
                    lineHeight: '1.45',
                    color: 'var(--sap-text)',
                    marginBottom: 2
                  }}
                >
                  {itm.text}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Show all / Show less toggle */}
      {totalCount > maxInitial && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(239, 68, 68, 0.15)' }}>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--sap-primary)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: 0
            }}
          >
            {isExpanded ? (
              <>
                <span>Show first {maxInitial} only</span>
                <ChevronUp size={14} />
              </>
            ) : (
              <>
                <span>Show all {totalCount} problems ({hiddenCount} more)</span>
                <ChevronDown size={14} />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
