/**
 * Location color palette and utilities for assigning colors to locations.
 */

/** 10-color palette (Tailwind 500 shades: indigo, amber, emerald, rose, cyan, purple, lime, orange, sky, fuchsia) */
export const LOCATION_COLOR_PALETTE: readonly string[] = [
  '#6366f1',
  '#f59e0b',
  '#10b981',
  '#f43f5e',
  '#06b6d4',
  '#a855f7',
  '#84cc16',
  '#f97316',
  '#0ea5e9',
  '#d946ef',
] as const;

/** Color for total/aggregate lines (gray-900) */
export const TOTAL_LINE_COLOR: string = '#111827';

/** Fallback color for locations without a valid ID (gray-500) */
export const FALLBACK_LOCATION_COLOR: string = '#6b7280';

/**
 * Returns a stable color for a given location ID using the djb2 hash algorithm.
 *
 * @param locationId - The location identifier to hash for color assignment.
 * @param _index - Reserved for future use.
 * @returns A hex color string from the palette, or the fallback color if empty.
 */
export function getLocationColor(locationId: string, _index?: number): string {
  if (locationId === '') {
    return FALLBACK_LOCATION_COLOR;
  }

  let hash = 5381;

  for (let i = 0; i < locationId.length; i++) {
    const charCode = locationId.charCodeAt(i);
    hash = ((hash << 5) + hash) + charCode;
    hash = hash & 0xffffffff; // 32-bit mask
  }

  const stableIndex = Math.abs(hash) % LOCATION_COLOR_PALETTE.length;
  return LOCATION_COLOR_PALETTE[stableIndex];
}
