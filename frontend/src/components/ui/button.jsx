import * as React from "react"
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"
import { Loader2 } from "lucide-react"
import "./ui.css"

const buttonVariants = cva(
  "rx-btn inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-md)] text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 select-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "rx-btn-primary bg-primary text-primary-foreground hover:bg-[#05396B]",
        primary: "rx-btn-primary bg-primary text-primary-foreground hover:bg-[#05396B]",
        destructive: "rx-btn-danger bg-destructive text-white hover:bg-destructive/90",
        danger: "rx-btn-danger bg-destructive text-white hover:bg-destructive/90",
        outline: "border border-border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary: "rx-btn-secondary bg-secondary text-secondary-foreground hover:bg-[#DCE8F1]",
        ghost: "rx-btn-ghost hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[var(--size-button-height,36px)] px-3.5 py-1.5",
        md: "h-[var(--size-button-height,36px)] px-3.5 py-1.5",
        sm: "rx-btn-sm h-[var(--size-button-sm-height,32px)] px-3 text-xs",
        xs: "h-6 px-2 text-xs",
        lg: "rx-btn-lg h-11 px-6 text-base",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(function Button(
  {
    className,
    variant = "default",
    size = "default",
    asChild = false,
    isLoading = false,
    disabled = false,
    icon: Icon = null,
    iconRight: IconRight = null,
    children,
    type = "button",
    ...props
  },
  ref
) {
  const Comp = asChild ? Slot.Root : "button"
  const normalizedVariant = variant === "primary" ? "primary" : variant === "danger" ? "danger" : variant
  const normalizedSize = size === "md" ? "default" : size

  return (
    <Comp
      ref={ref}
      type={type}
      data-slot="button"
      data-variant={normalizedVariant}
      data-size={normalizedSize}
      className={cn(
        buttonVariants({ variant: normalizedVariant, size: normalizedSize }),
        isLoading && "rx-btn-loading",
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="rx-spinner animate-spin size-4" aria-hidden="true" />
      ) : Icon ? (
        <Icon className="size-4" aria-hidden="true" />
      ) : null}
      {children && <span>{children}</span>}
      {!isLoading && IconRight ? (
        <IconRight className="size-4" aria-hidden="true" />
      ) : null}
    </Comp>
  )
})

export { Button, buttonVariants }
export default Button
