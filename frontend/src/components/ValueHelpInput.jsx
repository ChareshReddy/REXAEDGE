import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { Search } from 'lucide-react';
import MaterialValueHelpModal from './MaterialValueHelpModal';
import MaterialRestrictValueRangeModal from './MaterialRestrictValueRangeModal';
import PlantValueHelpModal from './PlantValueHelpModal';
import StorageLocationValueHelpModal from './StorageLocationValueHelpModal';

/**
 * SAP-style Value Help Input wrapper supporting F4 hotkey and matchcode icon button.
 * Uses native-setter + input/change event dispatching so all form libraries and React synthetic listeners update.
 */
const ValueHelpInput = forwardRef(function ValueHelpInput(
  {
    kind = 'material', // 'material' | 'plant' | 'storageLocation' | 'sloc'
    value = '',
    onChange,
    onSelect,
    plant = '',
    material = '',
    className = '',
    style = {},
    wrapperStyle = {},
    disabled = false,
    readOnly = false,
    placeholder,
    onKeyDown,
    onFocus,
    onBlur,
    ...restProps
  },
  ref
) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRestrictOpen, setIsRestrictOpen] = useState(false);
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const [filteredMaterials, setFilteredMaterials] = useState(null);
  const [searchMetadata, setSearchMetadata] = useState(null);
  const inputRef = useRef(null);

  // Expose input element via forwarded ref
  useImperativeHandle(ref, () => inputRef.current);

  const handleKeyDown = (e) => {
    if (e.key === 'F4') {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled && !readOnly) {
        if (kind === 'material') {
          setIsRestrictOpen(true);
          setIsResultsOpen(false);
        } else {
          setIsOpen(true);
        }
      }
      return;
    }
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  const handleIconClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !readOnly) {
      if (kind === 'material') {
        setIsRestrictOpen(true);
        setIsResultsOpen(false);
      } else {
        setIsOpen(true);
      }
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setIsRestrictOpen(false);
    setIsResultsOpen(false);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const handleContinueEmpty = () => {
    setIsRestrictOpen(false);
    setFilteredMaterials(null);
    setSearchMetadata(null);
    setIsResultsOpen(true);
  };

  const handleContinueWithResults = (results, meta) => {
    setIsRestrictOpen(false);
    setFilteredMaterials(results);
    setSearchMetadata(meta);
    setIsResultsOpen(true);
  };

  const handleBackToRestrict = () => {
    setIsResultsOpen(false);
    setIsRestrictOpen(true);
  };

  const handleSelection = (selectedVal, fullRecord) => {
    setIsOpen(false);
    setIsRestrictOpen(false);
    setIsResultsOpen(false);

    if (inputRef.current) {
      // Use native-setter + dispatchEvent so React synthetic onChange updates properly
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      const prototype = Object.getPrototypeOf(inputRef.current);
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

      if (prototypeValueSetter && nativeSetter !== prototypeValueSetter) {
        prototypeValueSetter.call(inputRef.current, selectedVal);
      } else if (nativeSetter) {
        nativeSetter.call(inputRef.current, selectedVal);
      } else {
        inputRef.current.value = selectedVal;
      }

      inputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
      inputRef.current.dispatchEvent(new Event('change', { bubbles: true }));

      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }

    if (onChange) {
      onChange({
        target: {
          name: restProps.name || restProps.id,
          id: restProps.id,
          value: selectedVal
        }
      });
    }

    if (onSelect) {
      onSelect(selectedVal, fullRecord);
    }
  };

  return (
    <div
      className="sap-value-help-wrapper"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: '100%',
        ...wrapperStyle
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        disabled={disabled}
        readOnly={readOnly}
        placeholder={placeholder}
        className={`sap-input sap-form-input ${className}`}
        style={{
          paddingRight: 28,
          boxSizing: 'border-box',
          width: '100%',
          ...style
        }}
        {...restProps}
      />

      {/* SAP Matchcode / F4 Icon Button */}
      <button
        type="button"
        tabIndex={disabled || readOnly ? -1 : 0}
        onClick={handleIconClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            handleIconClick(e);
          }
        }}
        disabled={disabled || readOnly}
        className="sap-value-help-btn"
        title="Value Help (F4)"
        aria-label="Value Help (F4)"
        style={{
          position: 'absolute',
          right: 3,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 22,
          height: 22,
          padding: 0,
          cursor: disabled || readOnly ? 'default' : 'pointer'
        }}
      >
        <Search size={13} strokeWidth={2.4} />
      </button>

      {/* Popups */}
      {kind === 'material' ? (
        <>
          <MaterialRestrictValueRangeModal
            isOpen={isRestrictOpen}
            initialValue={String(value || '')}
            onContinueEmpty={handleContinueEmpty}
            onContinueWithResults={handleContinueWithResults}
            onClose={handleClose}
          />
          <MaterialValueHelpModal
            isOpen={isResultsOpen}
            initialValue={String(value || '')}
            initialMaterials={filteredMaterials}
            searchMetadata={searchMetadata}
            onBackToRestrict={handleBackToRestrict}
            onSelect={handleSelection}
            onClose={handleClose}
          />
        </>
      ) : kind === 'storageLocation' || kind === 'sloc' ? (
        <StorageLocationValueHelpModal
          isOpen={isOpen}
          initialValue={String(value || '')}
          plant={plant}
          onSelect={handleSelection}
          onClose={handleClose}
        />
      ) : (
        <PlantValueHelpModal
          isOpen={isOpen}
          initialValue={String(value || '')}
          material={material}
          onSelect={handleSelection}
          onClose={handleClose}
        />
      )}
    </div>
  );
});

export default ValueHelpInput;
