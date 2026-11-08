/** A small chip picture (a plain yellow circle), shown next to chip counts. */
import type { ReactElement } from 'react';

export function ChipIcon({ size = '1em' }: { size?: string }): ReactElement {
  return (
    <svg className="chip-icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#f5c542" />
    </svg>
  );
}
