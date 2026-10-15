// Client-side navigation; main.ts renders on "navigate" and popstate.

export function navigate(path: string): void {
  history.pushState(null, "", path);
  dispatchEvent(new Event("navigate"));
}
