import { memo } from 'react';

const CHANNEL_STYLE = {
  r: { fill: '#f87171', opacity: 0.6 },
  g: { fill: '#4ade80', opacity: 0.55 },
  b: { fill: '#60a5fa', opacity: 0.6 },
  l: { fill: '#ffffff', opacity: 0.92 },
};

function toPath(bins, peak) {
  // Square-root scaling keeps small populations visible next to a dominant peak.
  const scale = peak ? 100 / Math.sqrt(peak) : 0;
  let d = 'M0,100';
  for (let i = 0; i < 256; i++) d += `L${i},${(100 - Math.sqrt(bins[i]) * scale).toFixed(1)}`;
  return `${d}L255,100Z`;
}

/** Inner bins only: clipped 0/255 spikes would flatten everything else. */
function peakOf(channels, histogram) {
  let peak = 0;
  for (const c of channels) {
    const bins = histogram[c];
    for (let i = 1; i < 255; i++) if (bins[i] > peak) peak = bins[i];
  }
  return peak;
}

export const Histogram = memo(function Histogram({ histogram, channels, className }) {
  if (!histogram) return <div className={className} />;
  const visible = ['r', 'g', 'b', 'l'].filter((c) => channels.includes(c));
  const peak = peakOf(visible, histogram);

  return (
    <svg viewBox="0 0 255 100" preserveAspectRatio="none" className={className} aria-hidden="true">
      {visible.map((c) => (
        <path
          key={c}
          d={toPath(histogram[c], peak)}
          fill={CHANNEL_STYLE[c].fill}
          fillOpacity={CHANNEL_STYLE[c].opacity}
          style={{ mixBlendMode: c === 'l' ? 'normal' : 'screen' }}
        />
      ))}
    </svg>
  );
});

export function clipping(histogram) {
  if (!histogram) return { shadows: 0, highlights: 0 };
  let total = 0;
  for (let i = 0; i < 256; i++) total += histogram.l[i];
  return total
    ? { shadows: histogram.l[0] / total, highlights: histogram.l[255] / total }
    : { shadows: 0, highlights: 0 };
}
