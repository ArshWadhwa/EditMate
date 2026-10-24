/**
 * Layer model and canvas drawing.
 *
 * Every layer stores its centre (x, y) as fractions of the output size, its width as a
 * fraction of the output width and (except text) its height as a fraction of the output
 * height. Sizes like font size and stroke width are fractions of the output height.
 * That makes a layer render identically in the preview and in a full-resolution export.
 */

export const FONTS = [
  { key: 'manrope', label: 'Manrope', family: 'Manrope', weights: [400, 600, 800] },
  { key: 'playfair', label: 'Playfair', family: 'Playfair Display', weights: [400, 700, 900] },
  { key: 'bebas', label: 'Bebas Neue', family: 'Bebas Neue', weights: [400] },
  { key: 'caveat', label: 'Caveat', family: 'Caveat', weights: [400, 700] },
  { key: 'mono', label: 'Mono', family: 'JetBrains Mono', weights: [400, 500] },
];

export const BLEND_MODES = [
  { key: 'source-over', label: 'Normal' },
  { key: 'multiply', label: 'Multiply' },
  { key: 'screen', label: 'Screen' },
  { key: 'overlay', label: 'Overlay' },
  { key: 'soft-light', label: 'Soft light' },
];

export const SHAPES = ['rect', 'ellipse', 'line', 'arrow'];

export const BACKGROUND_MODES = ['original', 'transparent', 'color', 'image', 'blur'];

export const defaultBackground = () => ({ mode: 'original', color: '#f4f1ea', assetId: null, blur: 40 });

/** Backgrounds other than "original" need the subject mask. */
export const needsMask = (background) => background.mode !== 'original';

const fontOf = (key) => FONTS.find((f) => f.key === key) ?? FONTS[0];

let nextId = 0;
const newId = () => `l${Date.now().toString(36)}${(nextId++).toString(36)}`;

const base = (type, name) => ({ id: newId(), type, name, x: 0.5, y: 0.5, rotation: 0, opacity: 1, blend: 'source-over', hidden: false });

export function createTextLayer() {
  return {
    ...base('text', 'Text'),
    text: 'Your text',
    font: 'manrope',
    size: 0.08,
    weight: 800,
    italic: false,
    align: 'center',
    color: '#ffffff',
    lineHeight: 1.15,
    letterSpacing: 0,
    strokeWidth: 0,
    strokeColor: '#000000',
    shadow: true,
    w: 0.6,
  };
}

export function createShapeLayer(shape = 'rect') {
  const linear = shape === 'line' || shape === 'arrow';
  return {
    ...base('shape', shape[0].toUpperCase() + shape.slice(1)),
    shape,
    w: linear ? 0.4 : 0.3,
    h: linear ? 0.06 : 0.3,
    fill: linear ? null : '#f4d35e',
    stroke: linear ? '#ffffff' : null,
    strokeWidth: linear ? 0.012 : 0.008,
    radius: 0.15,
  };
}

/** `aspect` is the asset's natural width / height; `outputAspect` is the canvas's. */
export function createImageLayer(assetId, name, aspect, outputAspect) {
  const w = 0.4;
  return { ...base('image', name || 'Image'), assetId, aspect, w, h: (w * outputAspect) / aspect };
}

export function duplicateLayer(layer) {
  return { ...layer, id: newId(), x: Math.min(0.95, layer.x + 0.03), y: Math.min(0.95, layer.y + 0.03), name: `${layer.name} copy` };
}

// ── Text layout ──────────────────────────────────────────────────────────────

let measureCtx = null;
function measuringContext() {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  return measureCtx;
}

export function fontString(layer, px) {
  const font = fontOf(layer.font);
  const weight = font.weights.includes(layer.weight) ? layer.weight : font.weights.at(-1);
  return `${layer.italic ? 'italic ' : ''}${weight} ${px}px "${font.family}", system-ui, sans-serif`;
}

function applyLetterSpacing(ctx, layer, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${layer.letterSpacing * px}px`;
}

/** Word-wraps text to `maxWidth`, honouring explicit newlines. */
function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/(\s+)/);
    let line = '';
    for (const word of words) {
      const candidate = line + word;
      if (line && ctx.measureText(candidate.trimEnd()).width > maxWidth) {
        lines.push(line.trimEnd());
        line = word.trimStart();
      } else {
        line = candidate;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export function layoutText(layer, W, H, ctx = measuringContext()) {
  const px = layer.size * H;
  ctx.font = fontString(layer, px);
  applyLetterSpacing(ctx, layer, px);
  const width = layer.w * W;
  const lines = wrapLines(ctx, layer.text || ' ', width);
  const lineHeight = px * layer.lineHeight;
  return { px, lines, lineHeight, width, height: Math.max(lineHeight, lines.length * lineHeight) };
}

/** The layer's box in output pixels. */
export function layerBox(layer, W, H) {
  const h = layer.type === 'text' ? layoutText(layer, W, H).height : layer.h * H;
  return { cx: layer.x * W, cy: layer.y * H, w: layer.w * W, h, rotation: layer.rotation };
}

// ── Drawing ─────────────────────────────────────────────────────────────────

function drawText(ctx, layer, w, h, W, H) {
  const { px, lines, lineHeight } = layoutText(layer, W, H, ctx);
  ctx.textBaseline = 'middle';
  ctx.textAlign = layer.align;
  ctx.lineJoin = 'round';
  const x = layer.align === 'left' ? -w / 2 : layer.align === 'right' ? w / 2 : 0;

  if (layer.shadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = px * 0.25;
    ctx.shadowOffsetY = px * 0.06;
  }

  lines.forEach((line, i) => {
    const y = -h / 2 + lineHeight * (i + 0.5);
    if (layer.strokeWidth > 0) {
      ctx.lineWidth = layer.strokeWidth * px * 2;
      ctx.strokeStyle = layer.strokeColor;
      ctx.strokeText(line, x, y);
      ctx.shadowColor = 'transparent'; // shadow once, under the stroke
    }
    ctx.fillStyle = layer.color;
    ctx.fillText(line, x, y);
  });
}

function drawShape(ctx, layer, w, h, H) {
  const lineWidth = layer.strokeWidth * H;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (layer.shape === 'line' || layer.shape === 'arrow') {
    const head = layer.shape === 'arrow' ? Math.min(h, w * 0.4) : 0;
    ctx.strokeStyle = layer.stroke ?? '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(w / 2 - head * 0.6, 0);
    ctx.stroke();
    if (head) {
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2 - head, -head / 2);
      ctx.lineTo(w / 2 - head, head / 2);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }

  ctx.beginPath();
  if (layer.shape === 'ellipse') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  else ctx.roundRect(-w / 2, -h / 2, w, h, layer.radius * Math.min(w, h));
  if (layer.fill) {
    ctx.fillStyle = layer.fill;
    ctx.fill();
  }
  if (layer.stroke && lineWidth > 0) {
    ctx.strokeStyle = layer.stroke;
    ctx.stroke();
  }
}

/**
 * Draws one layer onto `ctx`, whose canvas is the full output (W × H).
 * @param {Map<string, { bitmap: CanvasImageSource }>} assets
 */
export function drawLayer(ctx, layer, W, H, assets) {
  if (layer.hidden) return;
  const box = layerBox(layer, W, H);
  ctx.save();
  ctx.translate(box.cx, box.cy);
  ctx.rotate((box.rotation * Math.PI) / 180);
  ctx.globalAlpha = layer.opacity;
  ctx.globalCompositeOperation = layer.blend;

  if (layer.type === 'text') drawText(ctx, layer, box.w, box.h, W, H);
  else if (layer.type === 'shape') drawShape(ctx, layer, box.w, box.h, H);
  else if (layer.type === 'image') {
    const asset = assets.get(layer.assetId);
    if (asset) ctx.drawImage(asset.bitmap, -box.w / 2, -box.h / 2, box.w, box.h);
  }

  ctx.restore();
}

/** Resolves once every font used by `layers` is loaded, so the first paint isn't a fallback font. */
export function loadLayerFonts(layers) {
  const wanted = new Set(layers.filter((l) => l.type === 'text').map((l) => fontString(l, 32)));
  return Promise.all([...wanted].map((f) => document.fonts.load(f).catch(() => null)));
}
