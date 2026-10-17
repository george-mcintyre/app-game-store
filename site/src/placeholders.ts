// Generated artwork so a page with the bare minimum still looks finished.
import { escapeHtml, raw, type Raw } from "./html.js";

function hash(text: string): number {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

export function palette(seed: string): { a: string; b: string; c: string } {
  const h = hash(seed || "app") % 360;
  return { a: `hsl(${h} 78% 56%)`, b: `hsl(${(h + 42) % 360} 82% 46%)`, c: `hsl(${(h + 300) % 360} 70% 62%)` };
}

export function initials(name: string, max = 2): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words.slice(0, max).map((w) => w[0]!.toUpperCase()).join("");
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Square app icon: gradient tile, soft highlight, one big letter.
export function iconSvg(name: string): string {
  const { a, b } = palette(name);
  const letter = escapeHtml(initials(name, 1));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
<radialGradient id="h" cx="30%" cy="20%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<rect width="512" height="512" fill="url(#g)"/><rect width="512" height="512" fill="url(#h)"/>
<text x="256" y="256" dy=".36em" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-weight="700" font-size="260" fill="#fff" fill-opacity=".95">${letter}</text>
</svg>`;
}

export function iconUrl(name: string): string {
  return svgDataUrl(iconSvg(name));
}

// Round avatar with initials.
export function avatarUrl(name: string): string {
  const { b, c } = palette(name);
  const text = escapeHtml(initials(name));
  return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<circle cx="64" cy="64" r="64" fill="url(#g)"/>
<text x="64" y="64" dy=".36em" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-weight="700" font-size="${text.length > 1 ? 50 : 60}" fill="#fff">${text}</text>
</svg>`);
}

// Phone-shaped preview cards used when an app has no screenshots yet.
export function screenshotSvg(name: string, tagline: string, index: number): Raw {
  const { a, b, c } = palette(`${name}${index}`);
  const safeName = escapeHtml(name || "Your app");
  const safeTag = escapeHtml(tagline || "Built for friends");
  const angle = [20, 160, 300][index % 3];
  const letter = escapeHtml(initials(name, 1));
  const rows = [0, 1, 2].map((i) => `<rect x="40" y="${560 + i * 64}" width="${i === 2 ? 190 : 310}" height="28" rx="14" fill="#fff" fill-opacity=".18"/>`).join("");
  return raw(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 844" role="img" aria-label="Preview of ${safeName}">
<defs><linearGradient id="s${index}" gradientTransform="rotate(${angle})"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>
<rect width="390" height="844" fill="url(#s${index})"/>
<circle cx="330" cy="120" r="140" fill="#fff" fill-opacity=".08"/><circle cx="40" cy="700" r="180" fill="#000" fill-opacity=".08"/>
<rect x="135" y="230" width="120" height="120" rx="28" fill="#fff" fill-opacity=".95"/>
<text x="195" y="290" dy=".36em" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-weight="800" font-size="64" fill="${b}">${letter}</text>
<text x="195" y="420" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-weight="800" font-size="34" fill="#fff">${safeName}</text>
<text x="195" y="462" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-weight="500" font-size="17" fill="#fff" fill-opacity=".85">${safeTag}</text>
${rows}
</svg>`);
}
