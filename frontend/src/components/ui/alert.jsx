import * as React from "react"
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils"
import "./ui.css"

const alertVariants = cva(
  "rx-alert relative flex items-start gap-3 w-full rounded-[10px] border px-4 py-3 text-sm text-left leading-normal box-border",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] [&>svg]:text-[var(--color-text-secondary)]",
        warning:
          "bg-[var(--color-warning-bg)] border-[var(--color-warning-border)] text-[var(--color-warning)] [&>svg]:text-[var(--color-warning)]",
        info:
          "bg-[var(--color-info-bg)] border-[var(--color-info-border)] text-[var(--color-info)] [&>svg]:text-[var(--color-info)]",
        success:
          "bg-[var(--color-success-bg)] border-[var(--color-success-border)] text-[var(--color-success)] [&>svg]:text-[var(--color-success)]",
        destructive:
          "bg-[var(--color-danger-bg)] border-[var(--color-danger-border)] text-[var(--color-danger)] [&>svg]:text-[var(--color-danger)]",
        danger:
          "bg-[var(--color-danger-bg)] border-[var(--color-danger-border)] text-[var(--color-danger)] [&>svg]:text-[var(--color-danger)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  children,
  ...props
}) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {children}
    </div>
  )
}

function AlertTitle({
  className,
  ...props
}) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-semibold text-sm leading-tight normal-case text-inherit",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-sm font-normal text-[var(--color-text)] mt-1 leading-[1.5]",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
