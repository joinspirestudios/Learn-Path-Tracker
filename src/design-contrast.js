function normalizeHex(hex){
  const raw = String(hex || '').trim().replace(/^#/, '');
  if(/^[0-9a-f]{3}$/i.test(raw)){
    return raw.split('').map(char => char + char).join('');
  }
  if(/^[0-9a-f]{6}$/i.test(raw)) return raw;
  throw new Error('Expected a 3 or 6 digit hex color.');
}

export function hexToRgb(hex){
  const normalized = normalizeHex(hex);
  return {
    r:parseInt(normalized.slice(0, 2), 16),
    g:parseInt(normalized.slice(2, 4), 16),
    b:parseInt(normalized.slice(4, 6), 16),
  };
}

function linearizeChannel(value){
  const channel = value / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex){
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b);
}

export function contrastRatio(foreground, background){
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsContrast(foreground, background, ratio = 4.5){
  return contrastRatio(foreground, background) >= ratio;
}
