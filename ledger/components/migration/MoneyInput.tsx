"use client";

import { useState } from "react";

// A text input for a staged money/quantity field: buffers locally as the
// user types, and only calls `onCommit` (a debounced-on-blur autosave) when
// the field loses focus AND the value actually changed. Re-syncs from
// `initialValue` when the parent's staged state changes underneath it (e.g.
// after another field's save round-trips a fresh server snapshot).
export function MoneyInput({
  initialValue,
  onCommit,
  placeholder = "0",
  disabled = false,
  align = "right",
}: {
  initialValue: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  align?: "left" | "right";
}) {
  const [value, setValue] = useState(initialValue);
  const [prev, setPrev] = useState(initialValue);
  if (prev !== initialValue) {
    setPrev(initialValue);
    setValue(initialValue);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      disabled={disabled}
      className={`input-modern tabular-nums ${align === "right" ? "text-right" : ""} ${disabled ? "opacity-60" : ""}`}
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== initialValue) onCommit(value);
      }}
    />
  );
}
