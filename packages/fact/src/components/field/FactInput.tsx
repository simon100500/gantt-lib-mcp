import { Input } from '@maxhub/max-ui';
import type { ChangeEvent } from 'react';

type FactInputProps = {
  value: string;
  unit?: string | null;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function FactInput({ value, unit, disabled, onChange }: FactInputProps) {
  return (
    <label className="fact-input">
      <span className="fact-input__label">Факт{unit ? `, ${unit}` : ''}</span>
      <Input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={value}
        disabled={disabled}
        placeholder="0"
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
    </label>
  );
}
