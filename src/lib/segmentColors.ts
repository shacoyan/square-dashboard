// tailwind.config.js の theme.extend.colors.accent.segment と完全同期させること

import type { CustomerSegment } from '../types';

export const segmentColors: Record<CustomerSegment, string> = {
  new: '#2563eb',
  repeat: '#0d9488',
  regular: '#dc2626',
  staff: '#7c3aed',
  unlisted: '#6b7280',
};

export const segmentEmptyColor = '#d1d5db';
