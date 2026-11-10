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
        backgroundColor: 'var(--color-surface, #FFFFFF)',
        border: '1px solid var(--color-border, #D9E2EC)',
        borderRadius: 'var(--radius-lg, 12px)',
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
                  borderRadius: 'var(--radius-full, 9999px)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--font-size-13, 13px)',
                  fontWeight: 600,
                  fontFamily: 'var(--font-sans)',
                  boxSizing: 'border-box',
                  transition: 'all var(--transition-normal, 200ms ease)',
                  ...(isActive
                    ? {
                        backgroundColor: 'var(--color-blue-600, #02579A)',
                        color: 'var(--color-text-inverse, #FFFFFF)',
                        boxShadow: '0 0 0 4px var(--color-blue-50, #EEF4F9)',
                        border: 'none'
                      }
                    : isComplete
                    ? {
                        backgroundColor: 'var(--color-blue-600, #02579A)',
                        color: 'var(--color-text-inverse, #FFFFFF)',
                        border: 'none'
                      }
                    : {
                        backgroundColor: 'var(--color-surface, #FFFFFF)',
                        border: '2px solid var(--color-border, #D9E2EC)',
                        color: 'var(--color-text-muted, #7A8CA3)'
                      })
                }}
              >
                {isComplete ? <Check size={16} strokeWidth={2.5} /> : s.number}
              </div>

              {/* Step Label (Sentence case) */}
              <span
                className="rx-step-label"
                style={{
                  fontSize: 'var(--font-size-14, 14px)',
                  fontWeight: isActive ? 600 : isComplete ? 500 : 400,
                  color: isActive
                    ? 'var(--color-navy-900, #00204E)'
                    : isComplete
                    ? 'var(--color-text, #0F2742)'
                    : 'var(--color-text-muted, #7A8CA3)',
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
                      ? 'var(--color-blue-600, #02579A)'
                      : 'var(--color-border, #D9E2EC)',
                  transition: 'background-color var(--transition-normal, 200ms ease)'
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
        backgroundColor: 'var(--color-page-bg, #F5F8FB)',
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
          paddingLeft: 'var(--page-gutter, 32px)',
          paddingRight: 'var(--page-gutter, 32px)',
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
