/**
 * Formatting utilities for file sizes, dates, percentages, and dimensions.
 */

export const signed = (value) => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0');

export const signedFixed = (value, digits = 1) => {
  const fixed = Math.abs(value).toFixed(digits);
  if (Number(fixed) === 0) return (0).toFixed(digits);
  return `${value > 0 ? '+' : '−'}${fixed}`;
};

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export const megapixels = (width, height) => `${((width * height) / 1e6).toFixed(1)} MP`;

export const percent = (value) => `${Math.round(value * 100)}%`;
