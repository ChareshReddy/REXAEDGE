import React from 'react';
import { ArrowRight, Check } from 'lucide-react';
import FioriPageHeader from '../FioriPageHeader';
import SingleBulkSwitch from '../layout/SingleBulkSwitch';

/**
 * Shared Bulk Stepper Indicator
 * Full content width, 3 steps connected by lines.
 * Active step: filled blue-600 circle with white number.
 * Completed step: filled blue-600 circle with white check icon.
 * Upcoming step: outlined neutral border with neutral muted number. Never black.
 * Sentence case labels.
 */
export function BulkWorkflowSteps({
  activeStep = 1,
  mode = 'create',
  type,
  step3Label,
  className = '',
  style = {}
}) {
  const isCopy = mode === 'copy' || type === 'copy';
  const isDelete = mode === 'delete' || type === 'delete';
  const resolvedStep3Label =
    step3Label || (isCopy ? 'Copy BOMs' : isDelete ? 'Delete BOMs' : 'Create BOMs');

  const steps = [
    { number: 1, label: 'Upload spreadsheet' },
    { number: 2, label: 'Validate data' },
    { number: 3, label: resolvedStep3Label }
  ];

  return (
    <div
      className={`rx-bulk-stepper ${className}`.trim()}
      role="navigation"
      aria-label="Workflow progress"
      style={{
        width: '100%',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '14px 24px',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        ...style
      }}
    >
      {steps.map((s, idx) => {
        const isActive = activeStep === s.number;
        const isComplete = activeStep > s.number;
        const isUpcoming = activeStep < s.number;

        return (
          <React.Fragment key={s.number}>
            {/* Step Item */}
            <div
              className={`rx-bulk-step-item ${isActive ? 'active' : isComplete ? 'complete' : 'upcoming'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                flexShrink: 0
              }}
            >
              {/* Step Circle */}
              <div
                className="rx-step-circle"
                style={{
                  width: 32,
                  height: 32,
                  minWidth: 32,
                  minHeight: 32,
                  borderRadius: 'var(--radius-full)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--font-size-13)',
                  fontWeight: 600,
                  fontFamily: 'var(--font-sans)',
                  boxSizing: 'border-box',
                  transition: 'all var(--transition-normal)',
                  ...(isActive
                    ? {
                        backgroundColor: 'var(--color-blue-600)',
                        color: 'var(--color-text-inverse)',
                        boxShadow: '0 0 0 4px var(--color-blue-50)',
                        border: 'none'
                      }
                    : isComplete
                    ? {
                        backgroundColor: 'var(--color-blue-600)',
                        color: 'var(--color-text-inverse)',
                        border: 'none'
                      }
                    : {
                        backgroundColor: 'var(--color-surface)',
                        border: '2px solid var(--color-border)',
                        color: 'var(--color-text-muted)'
                      })
                }}
              >
                {isComplete ? <Check size={16} strokeWidth={2.5} /> : s.number}
              </div>

              {/* Step Label (Sentence case) */}
              <span
                className="rx-step-label"
                style={{
                  fontSize: 'var(--font-size-14)',
                  fontWeight: isActive ? 600 : isComplete ? 500 : 400,
                  color: isActive
                    ? 'var(--color-navy-900)'
                    : isComplete
                    ? 'var(--color-text)'
                    : 'var(--color-text-muted)',
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-sans)'
                }}
              >
                {s.label}
              </span>
            </div>

            {/* Connecting line between steps */}
            {idx < steps.length - 1 && (
              <div
                className="rx-step-line"
                style={{
                  flex: 1,
                  height: 2,
                  minWidth: 24,
                  backgroundColor:
                    activeStep > s.number
                      ? 'var(--color-blue-600)'
                      : 'var(--color-border)',
                  transition: 'background-color var(--transition-normal)'
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/**
 * Shared Bulk Page Layout Wrapper
 * - Max width: 1440px centered, fills content width with no half-empty pages.
 * - Header: breadcrumbs (Home / BOM management / <Operation>), title, subtitle, Single | Bulk switch.
 * - Stepper: full content width.
 */
export default function BulkLayout({
  title,
  subtitle,
  operation = 'create',
  mode = 'bulk',
  breadcrumbs = [],
  onBack,
  backTitle,
  isLocked = false,
  systemKey = 'DEV',
  activeStep = 1,
  step3Label,
  children,
  className = '',
  style = {}
}) {
  return (
    <div
      className={`rx-bulk-page ${className}`.trim()}
      style={{
        width: '100%',
        minHeight: '100%',
        backgroundColor: 'var(--color-page-bg)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Page Header with Single | Bulk Switch */}
      <FioriPageHeader
        title={title}
        extraTitleContent={
          <SingleBulkSwitch operation={operation} mode={mode} />
        }
        subtitle={subtitle}
        onBack={onBack}
        backTitle={backTitle || (isLocked ? 'Operation in progress' : `Back to ${operation === 'copy' ? 'Copy' : operation === 'delete' ? 'Delete' : 'Create'} BOM`)}
        isLocked={isLocked}
        systemKey={systemKey}
        breadcrumbs={breadcrumbs}
      />

      {/* Main Container - max-width 1440px centered */}
      <main
        className="rx-bulk-container"
        style={{
          width: '100%',
          maxWidth: 1440,
          margin: '0 auto',
          boxSizing: 'border-box',
          paddingLeft: 'var(--page-gutter)',
          paddingRight: 'var(--page-gutter)',
          paddingTop: 20,
          paddingBottom: 64,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 20,
          ...style
        }}
      >
        {/* Full-width Stepper */}
        <BulkWorkflowSteps
          activeStep={activeStep}
          mode={operation}
          step3Label={step3Label}
        />

        {/* Step Content */}
        {children}
      </main>
    </div>
  );
}
