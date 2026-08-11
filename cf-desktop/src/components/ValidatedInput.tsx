import { useState, useCallback } from 'react';

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

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDisplayValue(raw);
    const num = parseFloat(raw);
    if (!isNaN(num)) {
      onChange(num);
      setIsInvalid(num < min || num > max);
    } else {
      setIsInvalid(raw !== '');
    }
  }, [min, max, onChange]);

  const handleBlur = useCallback(() => {
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
    if (isInvalid) setShowTooltip(true);
  }, [isInvalid]);

  return (
    <div className="validated-input-wrapper">
      <label className="validated-input-label">{label}</label>
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
