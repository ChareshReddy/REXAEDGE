import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { SearchInput } from "./search-input"
import "./ui.css"

const Input = React.forwardRef(function Input(
  {
    className,
    type = "text",
    isTable = false,
    isPopup = false,
    isMono = false,
    hasError = false,
    leadingIcon,
    icon,
    onClear,
    clearable = false,
    wrapperClassName,
    wrapperStyle,
    style,
    value,
    defaultValue,
    onChange,
    disabled,
    readOnly,
    ...props
  },
  ref
) {
  const IconComponent = icon || leadingIcon

  if (IconComponent) {
    return (
      <SearchInput
        ref={ref}
        type={type}
        leadingIcon={IconComponent}
        isTable={isTable}
        isPopup={isPopup}
        isMono={isMono}
        hasError={hasError}
        onClear={onClear}
        clearable={clearable}
        wrapperClassName={wrapperClassName}
        wrapperStyle={wrapperStyle}
        className={className}
        style={style}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        disabled={disabled}
        readOnly={readOnly}
        {...props}
      />
    )
  }

  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      value={value}
      defaultValue={defaultValue}
      onChange={onChange}
      disabled={disabled}
      readOnly={readOnly}
      className={cn(
        "rx-input flex w-full min-w-0 rounded-[var(--radius-md)] border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring",
        isTable ? "rx-input-table h-[var(--size-table-input-height,32px)]" : isPopup ? "rx-search-input-popup h-[var(--size-popup-input-height,34px)]" : "h-[var(--size-form-input-height,40px)]",
        isMono && "rx-input-mono font-mono text-xs",
        hasError && "rx-input-error border-destructive focus-visible:ring-destructive/30",
        className
      )}
      style={style}
      {...props}
    />
  )
})

export { Input, SearchInput }
export default Input
