import { Ellipse, Line, Path, Rect, Shadow, Textbox } from 'fabric';

/**
 * Layer model and canvas drawing powered by Fabric.js.
 *
 * Every layer stores its centre (x, y) as fractions of the output size, its width as a
 * fraction of the output width and (except text) its height as a fraction of the output
 * height. Sizes like font size and stroke width are fractions of the output height.
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

export function fontString(layer, px) {
  const font = fontOf(layer.font);
  const weight = font.weights.includes(layer.weight) ? layer.weight : font.weights.at(-1);
  return `${layer.italic ? 'italic ' : ''}${weight} ${px}px "${font.family}", system-ui, sans-serif`;
}

// ── Fabric Object Builders ───────────────────────────────────────────────────

export function createTextObject(layer, W, H) {
  const font = fontOf(layer.font);
  const weight = font.weights.includes(layer.weight) ? layer.weight : font.weights.at(-1);
  const px = layer.size * H;
  return new Textbox(layer.text || ' ', {
    left: layer.x * W,
    top: layer.y * H,
    originX: 'center',
    originY: 'center',
    width: layer.w * W,
    fontSize: px,
    fontFamily: font.family,
    fontWeight: weight,
    fontStyle: layer.italic ? 'italic' : 'normal',
    textAlign: layer.align,
    fill: layer.color,
    lineHeight: layer.lineHeight,
    charSpacing: layer.letterSpacing ? layer.letterSpacing * 1000 : 0,
    stroke: layer.strokeWidth > 0 ? layer.strokeColor : undefined,
    strokeWidth: layer.strokeWidth > 0 ? layer.strokeWidth * px * 2 : 0,
    paintFirst: 'stroke',
    shadow: layer.shadow
      ? new Shadow({ color: 'rgba(0, 0, 0, 0.45)', blur: px * 0.25, offsetY: px * 0.06 })
      : undefined,
    angle: layer.rotation || 0,
    opacity: layer.opacity,
    globalCompositeOperation: layer.blend,
    objectCaching: false,
  });
}

export function createShapeObject(layer, W, H) {
  const w = layer.w * W;
  const h = layer.h * H;
  const common = {
    left: layer.x * W,
    top: layer.y * H,
    originX: 'center',
    originY: 'center',
    angle: layer.rotation || 0,
    opacity: layer.opacity,
    globalCompositeOperation: layer.blend,
    objectCaching: false,
  };

  if (layer.shape === 'ellipse') {
    return new Ellipse({
      ...common,
      rx: w / 2,
      ry: h / 2,
      fill: layer.fill || 'transparent',
      stroke: layer.stroke || undefined,
      strokeWidth: layer.stroke ? layer.strokeWidth * H : 0,
    });
  }

  if (layer.shape === 'line') {
    return new Line([-w / 2, 0, w / 2, 0], {
      ...common,
      stroke: layer.stroke || '#ffffff',
      strokeWidth: layer.strokeWidth * H,
      strokeLineCap: 'round',
    });
  }

  if (layer.shape === 'arrow') {
    const head = Math.min(h, w * 0.4);
    const path = `M ${-w / 2} 0 L ${w / 2 - head * 0.6} 0 M ${w / 2} 0 L ${w / 2 - head} ${-head / 2} L ${w / 2 - head} ${head / 2} Z`;
    return new Path(path, {
      ...common,
      stroke: layer.stroke || '#ffffff',
      fill: layer.stroke || '#ffffff',
      strokeWidth: layer.strokeWidth * H,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
    });
  }

  const r = layer.radius * Math.min(w, h);
  return new Rect({
    ...common,
    width: w,
    height: h,
    rx: r,
    ry: r,
    fill: layer.fill || 'transparent',
    stroke: layer.stroke || undefined,
    strokeWidth: layer.stroke ? layer.strokeWidth * H : 0,
  });
}

export function layoutText(layer, W, H) {
  const tb = createTextObject(layer, W, H);
  return { px: layer.size * H, height: Math.max(layer.size * H * layer.lineHeight, tb.height) };
}

export function layerBox(layer, W, H) {
  const h = layer.type === 'text' ? layoutText(layer, W, H).height : layer.h * H;
  return { cx: layer.x * W, cy: layer.y * H, w: layer.w * W, h, rotation: layer.rotation };
}

/**
 * Draws one layer onto `ctx`, whose canvas is the full output (W × H).
 * @param {Map<string, { bitmap: CanvasImageSource }>} assets
 */
export function drawLayer(ctx, layer, W, H, assets) {
  if (layer.hidden) return;

  if (layer.type === 'text') {
    createTextObject(layer, W, H).render(ctx);
  } else if (layer.type === 'shape') {
    createShapeObject(layer, W, H).render(ctx);
  } else if (layer.type === 'image') {
    const asset = assets.get(layer.assetId);
    if (!asset) return;
    const box = layerBox(layer, W, H);
    ctx.save();
    ctx.translate(box.cx, box.cy);
    ctx.rotate((box.rotation * Math.PI) / 180);
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blend;
    ctx.drawImage(asset.bitmap, -box.w / 2, -box.h / 2, box.w, box.h);
    ctx.restore();
  }
}

/** Resolves once every font used by `layers` is loaded, so the first paint isn't a fallback font. */
export function loadLayerFonts(layers) {
  const wanted = new Set(layers.filter((l) => l.type === 'text').map((l) => fontString(l, 32)));
  return Promise.all([...wanted].map((f) => document.fonts.load(f).catch(() => null)));
}
