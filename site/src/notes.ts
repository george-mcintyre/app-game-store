// Release notes to safe HTML: paragraphs and simple bullet lists, everything escaped.
import { escapeHtml, raw, type Raw } from "./html.js";

export function notesHtml(text: string): Raw {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length > 0) out.push(`<p>${para.map(escapeHtml).join("<br>")}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list.length > 0) out.push(`<ul>${list.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`);
    list = [];
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushPara();
      list.push(bullet[1]);
    } else if (line === "") {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return raw(out.join(""));
}
