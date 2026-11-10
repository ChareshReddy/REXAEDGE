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
          "bg-[var(--color-warning-bg,#FFFBEB)] border-[var(--color-warning-border,#FDE68A)] text-[var(--color-warning,#B45309)] [&>svg]:text-[var(--color-warning,#B45309)]",
        info:
          "bg-[var(--color-info-bg,#EEF4F9)] border-[var(--color-info-border,#B3CDE0)] text-[var(--color-info,#02579A)] [&>svg]:text-[var(--color-info,#02579A)]",
        success:
          "bg-[var(--color-success-bg,#ECFDF3)] border-[var(--color-success-border,#A6F4C5)] text-[var(--color-success,#15803D)] [&>svg]:text-[var(--color-success,#15803D)]",
        destructive:
          "bg-[var(--color-danger-bg,#FEF3F2)] border-[var(--color-danger-border,#FECDCA)] text-[var(--color-danger,#B42318)] [&>svg]:text-[var(--color-danger,#B42318)]",
        danger:
          "bg-[var(--color-danger-bg,#FEF3F2)] border-[var(--color-danger-border,#FECDCA)] text-[var(--color-danger,#B42318)] [&>svg]:text-[var(--color-danger,#B42318)]",
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
