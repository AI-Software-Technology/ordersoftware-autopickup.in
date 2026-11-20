import React from 'react';
import { INDIAN_STATES } from '../lib/india.js';

interface Props {
  value: string;
  onChange: (state: string) => void;
  className?: string;
  required?: boolean;
}

/** State dropdown. Keeps an existing value even if it is not in the standard list (old data). */
export const StateSelect: React.FC<Props> = ({ value, onChange, className = '', required }) => {
  const known = INDIAN_STATES.includes(value);
  return (
    <select
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      <option value="">Select state…</option>
      {!known && value && <option value={value}>{value}</option>}
      {INDIAN_STATES.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
};
