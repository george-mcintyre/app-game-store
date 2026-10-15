import { dashboard, appForm, appLinks, devices, settings } from "./pages/dev.js";
import { devPage, installPage, landing, notFound, waitPage } from "./pages/public.js";
import { navigate } from "./nav.js";
import { matchRoute } from "./router.js";

const root = document.getElementById("app")!;

async function render(): Promise<void> {
  const route = matchRoute(location.pathname);
  scrollTo(0, 0);
  switch (route.page) {
    case "landing":
      return landing(root);
    case "dev-page":
      return devPage(root, route.slug);
    case "install":
      return installPage(root, route.linkId);
    case "wait":
      return waitPage(root, route.linkId, route.enrolmentId);
    case "dashboard":
      return dashboard(root);
    case "app-new":
      return appForm(root, null);
    case "app-edit":
      return appForm(root, route.appId);
    case "app-links":
      return appLinks(root, route.appId);
    case "devices":
      return devices(root);
    case "settings":
      return settings(root);
    default:
      return notFound(root);
  }
}

// Same-origin links navigate without a reload; everything else is left to the browser.
document.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest("a");
  if (!a || a.target || a.hasAttribute("download") || e.metaKey || e.ctrlKey) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/dl/")) return;
  e.preventDefault();
  navigate(url.pathname + url.search);
});

addEventListener("popstate", () => void render());
addEventListener("navigate", () => void render());
void render();
