import React, { forwardRef } from 'react';
import { Checkbox as ShadcnCheckbox } from './checkbox';
import { RadioGroup, RadioGroupItem } from './radio-group';
import { Switch as ShadcnSwitch } from './switch';
import { Badge as ShadcnBadge, badgeVariants } from './badge';
import {
  Card as ShadcnCard,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter
} from './card';
import {
  Tabs as ShadcnTabs,
  TabsList,
  TabsTrigger,
  TabsContent
} from './tabs';
import { cn } from '@/lib/utils';
import './ui.css';

/**
 * Checkbox component built on real Radix Checkbox
 */
export const Checkbox = forwardRef(function Checkbox(
  { checked = false, onChange, label, disabled = false, className = '', id, ...props },
  ref
) {
  return (
    <label className={cn('rx-checkbox-label inline-flex items-center gap-2 cursor-pointer select-none', checked && 'rx-checkbox-checked', className)}>
      <ShadcnCheckbox
        ref={ref}
        id={id}
        checked={checked}
        onCheckedChange={(val) => onChange && onChange(val === true)}
        disabled={disabled}
        {...props}
      />
      {label && <span className="text-sm font-medium leading-none">{label}</span>}
    </label>
  );
});

/**
 * Radio component built on real Radix RadioGroup
 */
export const Radio = forwardRef(function Radio(
  { checked = false, onChange, label, name, value = 'val', disabled = false, className = '', id, ...props },
  ref
) {
  return (
    <label className={cn('rx-radio-label inline-flex items-center gap-2 cursor-pointer select-none', checked && 'rx-radio-checked', className)}>
      <RadioGroup value={checked ? value : undefined} onValueChange={(val) => onChange && onChange(val)}>
        <RadioGroupItem
          ref={ref}
          id={id}
          value={value}
          disabled={disabled}
          {...props}
        />
      </RadioGroup>
      {label && <span className="text-sm font-medium leading-none">{label}</span>}
    </label>
  );
});

/**
 * Switch component built on real Radix Switch
 */
export const Switch = forwardRef(function Switch(
  { checked = false, onChange, label, disabled = false, className = '', ...props },
  ref
) {
  return (
    <label className={cn('rx-checkbox-label inline-flex items-center gap-2 cursor-pointer select-none', className)}>
      <ShadcnSwitch
        ref={ref}
        checked={checked}
        onCheckedChange={(val) => onChange && onChange(val)}
        disabled={disabled}
        {...props}
      />
      {label && <span className="text-sm font-medium leading-none">{label}</span>}
    </label>
  );
});

/**
 * Badge component built on real shadcn badge
 */
export function Badge({ children, variant = 'default', className = '', ...props }) {
  const normalizedVariant =
    variant === 'primary' || variant === 'info'
      ? 'default'
      : variant === 'danger'
      ? 'destructive'
      : variant;

  return (
    <ShadcnBadge
      variant={normalizedVariant}
      className={cn('rx-badge', `rx-badge-${variant}`, className)}
      {...props}
    >
      {children}
    </ShadcnBadge>
  );
}

/**
 * Card component built on real shadcn Card
 */
export const Card = forwardRef(function Card(
  { children, title, description, action, className = '', tintedHeader = true, ...props },
  ref
) {
  const hasHeader = Boolean(title || description || action);
  const isTinted = Boolean(tintedHeader && hasHeader);

  return (
    <ShadcnCard
      ref={ref}
      className={cn(
        'rx-card rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-none text-left',
        isTinted ? 'rx-card-tinted-header !p-0 overflow-hidden' : 'p-4',
        className
      )}
      {...props}
    >
      {hasHeader && (
        <div
          data-full-bleed-band={isTinted ? 'true' : undefined}
          data-testid="rx-card-header"
          className={cn(
            'rx-card-header rx-form-section-header flex flex-row items-center justify-between gap-2',
            isTinted
              ? 'rx-form-section-header-tinted !m-0 px-4 h-12 min-h-[48px] max-h-[48px] bg-[var(--card-header-bg)] border-b border-[var(--card-header-border)] border-l-4 border-l-[var(--card-header-accent,#0B2D57)] w-full'
              : 'border-b border-[var(--color-border-subtle)] pb-4 mb-4'
          )}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {title && (
              <h3 className={cn(
                'rx-card-title rx-form-section-title text-[16px] font-semibold text-[var(--card-header-text,#0B2D57)] leading-none shrink-0',
                !isTinted && 'text-base'
              )}>
                {title}
              </h3>
            )}
            {description && (
              <span className="rx-card-header-data text-[13px] text-[var(--card-header-text,#0B2D57)] font-normal truncate">
                {description}
              </span>
            )}
          </div>
          {action && <div className="rx-card-action flex items-center gap-2 shrink-0">{action}</div>}
        </div>
      )}
      <CardContent className={cn('rx-card-body rx-form-section-body', isTinted ? 'rx-form-section-body-tinted' : 'p-4')}>
        {children}
      </CardContent>
    </ShadcnCard>
  );
});

/**
 * Tabs component built on real Radix Tabs
 */
export function Tabs({ tabs = [], activeTab, onChange, className = '', children, ...props }) {
  if (children) {
    return (
      <ShadcnTabs value={activeTab} onValueChange={onChange} className={cn('rx-tabs-container', className)} {...props}>
        {children}
      </ShadcnTabs>
    );
  }

  return (
    <ShadcnTabs
      value={activeTab}
      onValueChange={onChange}
      className={cn('rx-tabs-container w-full', className)}
      {...props}
    >
      <TabsList className="flex items-center gap-2 bg-[var(--color-surface-subtle)] p-1 rounded-[var(--radius-md)] border border-[var(--color-border)]">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className={cn(
                'rx-tab-item inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] transition-colors',
                isActive && 'rx-tab-active bg-[var(--color-surface)] text-[var(--color-navy-900)] shadow-xs font-semibold'
              )}
            >
              {Icon && <Icon size={14} strokeWidth={1.75} aria-hidden="true" />}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <Badge variant={isActive ? 'info' : 'default'} className="ml-1 text-[10px] py-0 px-1.5">
                  {tab.badge}
                </Badge>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </ShadcnTabs>
  );
}

export {
  RadioGroup,
  RadioGroupItem,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  TabsList,
  TabsTrigger,
  TabsContent,
  badgeVariants
};
