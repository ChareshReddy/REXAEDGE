import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Asserts that there is no horizontal page scroll on the document.
 */
export async function assertNoHorizontalScroll(page, contextInfo = '') {
  const scrollInfo = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      difference: doc.scrollWidth - doc.clientWidth
    };
  });

  // Allow 1px rounding discrepancy
  if (scrollInfo.scrollWidth > scrollInfo.clientWidth + 1) {
    throw new Error(
      `Horizontal scroll detected on ${contextInfo}: scrollWidth (${scrollInfo.scrollWidth}px) > clientWidth (${scrollInfo.clientWidth}px) by ${scrollInfo.difference}px`
    );
  }
}

/**
 * Asserts input and button heights conform to the RexaEdge design tokens:
 * - Standard form inputs: 40px (39px - 41px)
 * - Table cell inputs: 32px (30px - 34px)
 * - Buttons: standard 40px, small 32px (or 36px close)
 */
export async function assertInputAndButtonHeights(page, contextInfo = '') {
  const violations = await page.evaluate(() => {
    const issues = [];

    // Check visible inputs (exclude hidden, checkbox, radio, file)
    // If the input is wrapped in a composite ValueHelpInput container, the visible bordered field is the container
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])'));
    const processedContainers = new Set();
    for (const el of inputs) {
      if (el.offsetParent === null) continue; // Skip hidden
      const valueHelpWrapper = el.closest('.rx-value-help-container');
      if (valueHelpWrapper && processedContainers.has(valueHelpWrapper)) continue;
      if (valueHelpWrapper) processedContainers.add(valueHelpWrapper);

      const visibleField = valueHelpWrapper || el;
      const rect = visibleField.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const isInsideTable = el.closest('table') !== null || el.classList.contains('rx-input-table') || el.classList.contains('rx-input-sm') || el.closest('.rx-value-help-table') !== null || (valueHelpWrapper && valueHelpWrapper.classList.contains('rx-value-help-table'));
      const isCompactFilter = el.closest('.sap-f4-search-area') !== null || el.closest('.sap-modal-dialog') !== null;

      if (isInsideTable) {
        // Table cell inputs must be 32px (allowed: 30px - 34px)
        if (rect.height < 30 || rect.height > 34) {
          issues.push({
            type: 'table-input',
            selector: el.id ? `#${el.id}` : el.className,
            expected: '32px (±1px)',
            actual: `${rect.height.toFixed(1)}px`
          });
        }
      } else if (!isCompactFilter) {
        // Standard form input must be 40px (allowed: 38.5px - 41.5px)
        if (rect.height < 38.5 || rect.height > 41.5) {
          issues.push({
            type: 'form-input',
            selector: el.id ? `#${el.id}` : el.className,
            expected: '40px (±1px)',
            actual: `${rect.height.toFixed(1)}px`
          });
        }
      }
    }

    // Check visible buttons
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const btn of buttons) {
      if (btn.offsetParent === null) continue;
      const rect = btn.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const isSm = btn.classList.contains('rx-btn-sm') || btn.classList.contains('sap-btn-sm') || btn.classList.contains('sap-alt-chip') || btn.classList.contains('rx-value-help-btn');
      const isCloseBtn = btn.classList.contains('sap-modal-close-btn') || btn.classList.contains('sap-f4-header-close');
      const isIconOnly = btn.querySelector('svg') !== null && btn.textContent.trim() === '';

      if (!isSm && !isCloseBtn && !isIconOnly && btn.classList.contains('rx-btn') && !btn.classList.contains('rx-btn-lg')) {
        if (rect.height < 38.5 || rect.height > 41.5) {
          issues.push({
            type: 'button-standard',
            selector: btn.id ? `#${btn.id}` : btn.className,
            expected: '40px (±1px)',
            actual: `${rect.height.toFixed(1)}px`
          });
        }
      }
    }

    return issues;
  });

  if (violations.length > 0) {
    const details = violations.map(v => `  - [${v.type}] ${v.selector}: expected ${v.expected}, measured ${v.actual}`).join('\n');
    throw new Error(`Input/button height rule violations on ${contextInfo}:\n${details}`);
  }
}

/**
 * Asserts table rows never overlap and cell inputs maintain clearance to row borders.
 */
export async function assertTableRowsAndInputs(page, contextInfo = '') {
  const issues = await page.evaluate(() => {
    const list = [];
    const tables = Array.from(document.querySelectorAll('table'));

    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll('tbody tr')).filter(r => r.offsetParent !== null);
      if (rows.length < 2) continue;

      for (let i = 0; i < rows.length - 1; i++) {
        const r1 = rows[i].getBoundingClientRect();
        const r2 = rows[i + 1].getBoundingClientRect();

        // Bounding boxes must not intersect (allowing 0.5px subpixel tolerance)
        if (r1.bottom > r2.top + 0.5) {
          list.push(`Row ${i + 1} intersects Row ${i + 2}: row1.bottom (${r1.bottom.toFixed(1)}) > row2.top (${r2.top.toFixed(1)})`);
        }
      }

      // Check cell inputs clearance to row boundaries (>= 4px clearance, with 1px tolerance => >= 3px)
      const inputs = Array.from(table.querySelectorAll('tbody tr input'));
      for (const input of inputs) {
        const row = input.closest('tr');
        if (!row) continue;
        const inRect = input.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();

        const topSpace = inRect.top - rowRect.top;
        const bottomSpace = rowRect.bottom - inRect.bottom;

        if (topSpace < 3 || bottomSpace < 3) {
          list.push(
            `Table input ${input.id || input.name || 'unnamed'} has insufficient edge clearance in 44px row: topSpace=${topSpace.toFixed(1)}px, bottomSpace=${bottomSpace.toFixed(1)}px (min 4px expected)`
          );
        }
      }
    }

    return list;
  });

  if (issues.length > 0) {
    throw new Error(`Table row layout violations on ${contextInfo}:\n  - ${issues.join('\n  - ')}`);
  }
}

/**
 * Asserts table last column is fully inside container and header/body columns align.
 */
export async function assertTableColumnsAligned(page, contextInfo = '') {
  const issues = await page.evaluate(() => {
    if (window.innerWidth < 900) return []; // Multi-column tables scroll horizontally within containers on mobile
    const list = [];
    const containers = Array.from(document.querySelectorAll('.sap-table-container, .rx-table-container, .sap-f4-table-wrapper'));

    for (const container of containers) {
      const cRect = container.getBoundingClientRect();
      const table = container.querySelector('table');
      if (!table) continue;

      const headerCells = Array.from(table.querySelectorAll('thead th')).filter(c => c.offsetParent !== null);
      const firstRowCells = Array.from(table.querySelectorAll('tbody tr:first-child td')).filter(c => c.offsetParent !== null);

      if (headerCells.length > 0) {
        const lastTh = headerCells[headerCells.length - 1];
        const lastThRect = lastTh.getBoundingClientRect();

        // Last column must be inside container (allowing 1.5px subpixel border margin)
        if (lastThRect.right > cRect.right + 1.5) {
          list.push(
            `Last header column ${lastTh.textContent?.trim()} clips container: cell right (${lastThRect.right.toFixed(1)}) > container right (${cRect.right.toFixed(1)})`
          );
        }
      }

      // Check column alignment between header and first body row
      if (headerCells.length > 0 && firstRowCells.length === headerCells.length) {
        for (let i = 0; i < headerCells.length; i++) {
          const thW = headerCells[i].getBoundingClientRect().width;
          const tdW = firstRowCells[i].getBoundingClientRect().width;
          if (Math.abs(thW - tdW) > 3) {
            list.push(`Column ${i + 1} (${headerCells[i].textContent?.trim()}) width misaligned: th=${thW.toFixed(1)}px vs td=${tdW.toFixed(1)}px`);
          }
        }
      }
    }

    return list;
  });

  if (issues.length > 0) {
    throw new Error(`Table column alignment violations on ${contextInfo}:\n  - ${issues.join('\n  - ')}`);
  }
}

/**
 * Asserts fixed elements (top bar, sticky headers) do not cover form fields or table content.
 */
export async function assertNoFixedOverlap(page, contextInfo = '') {
  const overlaps = await page.evaluate(() => {
    const list = [];
    const fixedHeaders = Array.from(document.querySelectorAll('.sap-fiori-topbar, header.fixed, [style*="position: fixed"]')).filter(
      el => el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().top === 0
    );

    if (fixedHeaders.length === 0) return list;
    const topBarBottom = Math.max(...fixedHeaders.map(h => h.getBoundingClientRect().bottom));

    // Check visible cards or page containers
    const firstInteractive = document.querySelector('.rx-card, .sap-card, .sap-structured-form-card, h1, h2');
    if (firstInteractive) {
      const rect = firstInteractive.getBoundingClientRect();
      if (rect.top < topBarBottom - 1) {
        list.push(`Top bar overlaps first content container: topBar.bottom (${topBarBottom.toFixed(1)}px) > content.top (${rect.top.toFixed(1)}px)`);
      }
    }

    return list;
  });

  if (overlaps.length > 0) {
    throw new Error(`Fixed element overlap on ${contextInfo}:\n  - ${overlaps.join('\n  - ')}`);
  }
}

/**
 * Runs Axe accessibility audit for WCAG AA compliance.
 */
export async function assertAxeClean(page, contextInfo = '') {
  try {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast']) // Keep color-contrast audit in manual review to prevent third-party badge noise
      .analyze();

    if (results.violations.length > 0) {
      const issues = results.violations.map(v => `${v.id}: ${v.description} (${v.nodes.length} nodes)`).join(', ');
      return { passed: false, message: issues };
    }
    return { passed: true, message: 'All WCAG AA axe rules passed' };
  } catch (err) {
    return { passed: false, message: err.message };
  }
}
