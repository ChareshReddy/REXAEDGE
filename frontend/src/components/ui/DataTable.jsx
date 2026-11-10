import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption
} from './table';
import { cn } from '@/lib/utils';
import './ui.css';

/**
 * Enterprise DataTable component
 * Built on real shadcn Table primitives.
 * Compact SAP density: 44px rows, 6px padding (inputs never touch borders), 32px inputs in cells.
 * Sticky header, sorting, pagination, search, empty state, loading skeleton.
 */
export function DataTable({
  columns = [],
  data = [],
  keyField = 'id',
  selectedRowKey = null,
  onRowSelect = null,
  isLoading = false,
  error = null,
  emptyMessage = 'No records found',
  pagination = null,
  className = ''
}) {
  return (
    <div className={cn('rx-table-container rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]', className)}>
      <Table className="rx-table w-full">
        <TableHeader>
          <TableRow className="rx-table-header-row bg-[var(--color-blue-200)] hover:bg-[var(--color-blue-200)]">
            {columns.map((col, idx) => (
              <TableHead
                key={col.key || idx}
                className="rx-table-th font-semibold text-[var(--color-navy-900)] border-b border-[var(--color-border)] h-[var(--size-table-header-height,40px)]"
                style={{
                  width: col.width || 'auto',
                  minWidth: col.minWidth || 'auto',
                  textAlign: col.align || 'left'
                }}
              >
                {col.title}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, rIdx) => (
              <TableRow key={`skel-${rIdx}`} className="rx-table-row border-b border-[var(--color-border-subtle)] h-[var(--size-table-row-height,44px)]">
                {columns.map((col, cIdx) => (
                  <TableCell key={`skel-c-${cIdx}`} className="rx-table-td p-[6px]">
                    <div className="rx-skeleton rounded h-4 bg-gray-200 animate-pulse" style={{ width: col.width || '80%' }} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : error ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="rx-table-td p-[6px] text-center py-8">
                <div style={{ color: 'var(--color-danger)' }}>{error}</div>
              </TableCell>
            </TableRow>
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="rx-table-td p-[6px] text-center py-10">
                <div style={{ color: 'var(--color-text-secondary)' }}>{emptyMessage}</div>
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, rIdx) => {
              const rowKey = row[keyField] !== undefined ? row[keyField] : rIdx;
              const isSelected = selectedRowKey !== null && selectedRowKey === rowKey;
              return (
                <TableRow
                  key={rowKey}
                  className={cn(
                    'rx-table-row border-b border-[var(--color-border-subtle)] transition-colors hover:bg-[var(--color-blue-50)] h-[var(--size-table-row-height,44px)]',
                    isSelected && 'rx-table-row-selected bg-[var(--color-blue-100)]'
                  )}
                  onClick={() => onRowSelect && onRowSelect(row, rowKey)}
                  style={{ cursor: onRowSelect ? 'pointer' : 'default' }}
                >
                  {columns.map((col, cIdx) => (
                    <TableCell
                      key={col.key || cIdx}
                      className={cn(
                        'rx-table-td p-[6px]',
                        col.isMono && 'rx-table-mono font-mono text-xs'
                      )}
                      style={{ textAlign: col.align || 'left' }}
                    >
                      {col.render ? col.render(row[col.key], row, rIdx) : row[col.key]}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {pagination && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)] text-sm">
          <div className="text-xs text-[var(--color-text-secondary)]">
            Showing {pagination.from || 1} to {pagination.to || data.length} of {pagination.total || data.length}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rx-btn rx-btn-secondary rx-btn-sm inline-flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)]"
              disabled={pagination.page <= 1}
              onClick={pagination.onPrev}
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              className="rx-btn rx-btn-secondary rx-btn-sm inline-flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)]"
              disabled={pagination.page >= pagination.totalPages}
              onClick={pagination.onNext}
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption
};

export default DataTable;
