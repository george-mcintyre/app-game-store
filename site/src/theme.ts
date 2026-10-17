export type Theme = "store" | "dev";

export function setTheme(theme: Theme, title: string, indexable = false): void {
  document.documentElement.dataset.theme = theme;
  document.title = title;
  const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (robots) robots.content = indexable ? "index, follow" : "noindex, nofollow";
  const color = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (color) color.content = theme === "dev" ? "#0b1226" : "#ffffff";
}
