import { useState, useCallback, useEffect, useRef } from 'react';

interface ValidatedInputProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  unit?: string;
  description?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export default function ValidatedInput({
  value, min, max, step = 1, label, unit, description, onChange, disabled,
}: ValidatedInputProps) {
  const [displayValue, setDisplayValue] = useState(String(value));
  const [isInvalid, setIsInvalid] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const isFocusedRef = useRef(false);

  // Sync display value when prop changes externally (e.g. preset switch).
  // Skip invalid-state update while user is actively editing to avoid
  // overriding their manual entry (red highlight should persist).
  useEffect(() => {
    setDisplayValue(String(value));
    if (!isFocusedRef.current) {
      setIsInvalid(value < min || value > max);
    }
  }, [value, min, max]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDisplayValue(raw);
    const num = parseFloat(raw);
    if (!isNaN(num)) {
      // Always pass the value through so the user can type freely.
      // Red highlighting indicates the value is outside the valid range.
      onChange(num);
      setIsInvalid(num < min || num > max);
    } else {
      // Non-numeric input (empty string while typing, etc.)
      setIsInvalid(raw !== '');
    }
  }, [min, max, onChange]);

  const handleBlur = useCallback(() => {
    isFocusedRef.current = false;
    const num = parseFloat(displayValue);
    if (isNaN(num) || num < min || num > max) {
      setIsInvalid(true);
      setShowTooltip(true);
    } else {
      setIsInvalid(false);
      setShowTooltip(false);
    }
  }, [displayValue, min, max]);

  const handleFocus = useCallback(() => {
    isFocusedRef.current = true;
    setShowTooltip(false);
  }, []);

  return (
    <div className="validated-input-wrapper">
      {label && <label className="validated-input-label">{label}</label>}
      <div className="validated-input-container">
        <input
          type="number"
          className={`tree-num-input ${isInvalid ? 'invalid' : ''}`}
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          disabled={disabled}
          step={step}
        />
        {unit && <span className="tree-num-unit">{unit}</span>}
      </div>
      {showTooltip && isInvalid && (
        <div className="input-tooltip">
          Must be between {min} and {max}
          {description && <>. {description}</>}
        </div>
      )}
    </div>
  );
}
