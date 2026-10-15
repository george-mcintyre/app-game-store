import { renderSVG } from "uqr";
import { raw, type Raw } from "./html.js";

export function qrSvg(text: string): Raw {
  return raw(renderSVG(text, { border: 1, pixelSize: 4 }));
}

export async function shareOrCopy(url: string, title: string): Promise<"shared" | "copied" | "failed"> {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch {
      return "failed";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
