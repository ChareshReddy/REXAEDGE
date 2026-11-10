import * as React from "react"
import { Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import "./ui.css"

const SearchInput = React.forwardRef(function SearchInput(
  {
    leadingIcon: LeadingIconProp = Search,
    icon,
    value,
    defaultValue = "",
    onChange,
    onClear,
    clearable = true,
    isPopup = false,
    isTable = false,
    isMono = false,
    hasError = false,
    className,
    wrapperClassName,
    wrapperStyle,
    style,
    placeholder = "Search...",
    disabled = false,
    readOnly = false,
    id,
    name,
    "aria-label": ariaLabel,
    ...props
  },
  ref
) {
  const [internalValue, setInternalValue] = React.useState(defaultValue)
  const isControlled = value !== undefined
  const currentValue = isControlled ? value : internalValue
  const inputRef = React.useRef(null)

  React.useImperativeHandle(ref, () => inputRef.current)

  const IconComponent = icon || LeadingIconProp
  const hasValue = Boolean(currentValue && String(currentValue).length > 0)
  const showClear = clearable && hasValue && !disabled && !readOnly

  const handleChange = (e) => {
    if (!isControlled) {
      setInternalValue(e.target.value)
    }
    if (onChange) {
      onChange(e)
    }
  }

  const handleClear = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isControlled) {
      setInternalValue("")
    }
    if (onChange) {
      const syntheticEvent = {
        target: { value: "", name: name || "" },
        currentTarget: { value: "", name: name || "" }
      }
      onChange(syntheticEvent)
    }
    if (onClear) {
      onClear()
    }
    inputRef.current?.focus()
  }

  return (
    <div
      className={cn("rx-search-input-wrapper", wrapperClassName)}
      style={wrapperStyle}
    >
      {IconComponent && (
        <span
          className="rx-search-input-leading-icon"
          aria-hidden="true"
        >
          {React.isValidElement(IconComponent) ? (
            React.cloneElement(IconComponent, {
              size: 16,
              width: 16,
              height: 16,
              className: cn(IconComponent.props.className)
            })
          ) : (
            <IconComponent size={16} width={16} height={16} />
          )}
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        id={id}
        name={name}
        value={isControlled ? value : internalValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        aria-label={ariaLabel || placeholder}
        data-slot="search-input"
        className={cn(
          "rx-input rx-search-input flex w-full min-w-0 border border-input bg-transparent text-sm shadow-xs transition-colors outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring",
          isPopup && "rx-search-input-popup",
          isTable && "rx-input-table",
          isMono && "rx-input-mono font-mono text-xs",
          hasError && "rx-input-error border-destructive focus-visible:ring-destructive/30",
          showClear && "rx-search-input-has-clear",
          className
        )}
        style={{
          paddingLeft: "var(--input-icon-pad, 40px)",
          ...(isPopup ? { height: "var(--size-popup-input-height, 34px)" } : {}),
          ...(isTable ? { height: "var(--size-table-input-height, 32px)" } : {}),
          ...(showClear ? { paddingRight: "var(--input-clear-pad, 36px)" } : {}),
          ...style
        }}
        {...props}
      />
      {showClear && (
        <button
          type="button"
          tabIndex={-1}
          onClick={handleClear}
          aria-label="Clear search"
          className="rx-search-input-clear-btn"
        >
          <X size={14} width={14} height={14} />
        </button>
      )}
    </div>
  )
})

export { SearchInput }
export default SearchInput
