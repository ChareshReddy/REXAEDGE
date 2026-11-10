import React, { forwardRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import './ui.css';

export const ToastProvider = function ToastProvider({ children, ...props }) {
  return <div {...props}>{children}</div>;
};

export const ToastViewport = forwardRef(function ToastViewport({ className = '', ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        'rx-toast-banner-container fixed top-[calc(var(--size-topbar-height,64px)+12px)] right-[var(--page-gutter,32px)] z-50 flex max-h-screen w-full max-w-[440px] flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col',
        className
      )}
      {...props}
    />
  );
});

export const Toast = forwardRef(function Toast({ className = '', variant = 'default', ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        'group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 pr-8 shadow-[var(--shadow-md)] transition-all bg-[var(--color-surface)]',
        variant === 'destructive' && 'destructive group border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
        className
      )}
      {...props}
    />
  );
});

export const ToastAction = forwardRef(function ToastAction({ className = '', ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex h-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] border bg-transparent px-3 text-xs font-medium transition-colors hover:bg-[var(--color-surface-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)] disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
});

export const ToastClose = forwardRef(function ToastClose({ className = '', ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        'absolute right-2 top-2 rounded-md p-1 text-[var(--color-text-secondary)] opacity-0 transition-opacity hover:text-[var(--color-text)] focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100',
        className
      )}
      toast-close=""
      {...props}
    >
      <X className="h-4 w-4" />
    </button>
  );
});

export const ToastTitle = forwardRef(function ToastTitle({ className = '', ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn('text-sm font-semibold text-[var(--color-navy-900)]', className)}
      {...props}
    />
  );
});

export const ToastDescription = forwardRef(function ToastDescription({ className = '', ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn('text-sm opacity-90 text-[var(--color-text-secondary)]', className)}
      {...props}
    />
  );
});
