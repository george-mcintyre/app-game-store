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

let svgSerial = 0;
const FONT = "-apple-system,BlinkMacSystemFont,Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

// Generated previews used when an app has no screenshots at all, in the shape of the version shown.
export function screenshotSvg(name: string, tagline: string, index: number, shape: "phone" | "tablet" | "desktop" = "phone"): Raw {
  const { a, b, c } = palette(`${name}${index}`);
  const safeName = escapeHtml(name || "Your app");
  const safeTag = escapeHtml(tagline || "Built for friends");
  const angle = [20, 160, 300][index % 3];
  const letter = escapeHtml(initials(name, 1));
  // Ids must be unique: several carousels can sit on one page, some hidden.
  const id = `ph${++svgSerial}`;
  const grad = `<defs><linearGradient id="${id}" gradientTransform="rotate(${angle})"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>`;
  const text = (x: number, y: number, size: number, weight: number, fill: string, value: string, anchor = "middle", opacity = 1) =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${FONT}" font-weight="${weight}" font-size="${size}" fill="${fill}" fill-opacity="${opacity}">${value}</text>`;
  const tile = (x: number, y: number, size: number) =>
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.23}" fill="#fff" fill-opacity=".95"/>` + text(x + size / 2, y + size / 2, size * 0.53, 800, b, letter).replace("<text ", `<text dy=".36em" `);
  const bar = (x: number, y: number, w: number, h: number) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#fff" fill-opacity=".18"/>`;

  if (shape === "tablet") {
    const rows = [0, 1, 2].map((i) => bar(80, 700 + i * 66, i === 2 ? 220 : 320, 30) + bar(434, 700 + i * 66, i === 1 ? 200 : 320, 30)).join("");
    return raw(`<svg class="ph ph-tablet" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 834 1112" role="img" aria-label="iPad preview of ${safeName}">${grad}
<rect width="834" height="1112" fill="url(#${id})"/><circle cx="720" cy="140" r="220" fill="#fff" fill-opacity=".08"/><circle cx="90" cy="980" r="260" fill="#000" fill-opacity=".08"/>
${tile(337, 290, 160)}${text(417, 540, 46, 800, "#fff", safeName)}${text(417, 590, 22, 500, "#fff", safeTag, "middle", 0.85)}${rows}</svg>`);
  }
  if (shape === "desktop") {
    const cards = [120, 500, 880].map((x) => `<rect x="${x}" y="430" width="280" height="250" rx="18" fill="#fff" fill-opacity=".16"/>`).join("");
    return raw(`<svg class="ph ph-desktop" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 800" role="img" aria-label="Web preview of ${safeName}">${grad}
<rect width="1280" height="800" fill="url(#${id})"/><circle cx="1150" cy="160" r="260" fill="#fff" fill-opacity=".07"/>
<rect width="1280" height="56" fill="#fff" fill-opacity=".92"/><circle cx="32" cy="28" r="7" fill="#ff5f57"/><circle cx="56" cy="28" r="7" fill="#febc2e"/><circle cx="80" cy="28" r="7" fill="#28c840"/><rect x="220" y="14" width="840" height="28" rx="14" fill="#000" fill-opacity=".06"/>
${tile(120, 180, 150)}${text(310, 248, 52, 800, "#fff", safeName, "start")}${text(310, 296, 24, 500, "#fff", safeTag, "start", 0.85)}${cards}</svg>`);
  }
  const rows = [0, 1, 2].map((i) => bar(40, 560 + i * 64, i === 2 ? 190 : 310, 28)).join("");
  return raw(`<svg class="ph ph-phone" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 844" role="img" aria-label="Preview of ${safeName}">${grad}
<rect width="390" height="844" fill="url(#${id})"/><circle cx="330" cy="120" r="140" fill="#fff" fill-opacity=".08"/><circle cx="40" cy="700" r="180" fill="#000" fill-opacity=".08"/>
${tile(135, 230, 120)}${text(195, 420, 34, 800, "#fff", safeName)}${text(195, 462, 17, 500, "#fff", safeTag, "middle", 0.85)}${rows}</svg>`);
}
