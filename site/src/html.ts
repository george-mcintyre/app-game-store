// Tiny HTML helpers: a tagged template that escapes interpolations.

export class Raw {
  constructor(public html: string) {}
}

export function escapeHtml(value: unknown): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function raw(html: string): Raw {
  return new Raw(html);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Raw {
  let out = "";
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += render(values[i]);
  });
  return new Raw(out);
}

function render(value: unknown): string {
  if (value instanceof Raw) return value.html;
  if (Array.isArray(value)) return value.map(render).join("");
  if (value === null || value === undefined || value === false) return "";
  return escapeHtml(value);
}

export function mount(root: HTMLElement, content: Raw): void {
  root.innerHTML = content.html;
}

// Multi-line text to paragraphs.
export function paragraphs(text: string): Raw {
  return raw(
    text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
      .join(""),
  );
}
