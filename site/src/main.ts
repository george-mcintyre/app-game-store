import { agents, appForm, appLinks, appsPage, dashboard, devices, settings } from "./pages/dev.js";
import { exampleApp, examplePage } from "./pages/example.js";
import { guide } from "./pages/guide.js";
import { referencePage } from "./pages/reference.js";
import { smallPage } from "./pages/small.js";
import { termsPage } from "./pages/terms.js";
import { devPage, installPage, landing, notFound, previewPage, waitPage } from "./pages/public.js";
import { navigate } from "./nav.js";
import { matchRoute } from "./router.js";

const root = document.getElementById("app")!;

async function render(): Promise<void> {
  const route = matchRoute(location.pathname);
  if (!location.hash) scrollTo(0, 0);
  switch (route.page) {
    case "landing": await landing(root); break;
    case "dev-page": await devPage(root, route.slug); break;
    case "install": await installPage(root, route.linkId); break;
    case "wait": await waitPage(root, route.linkId, route.enrolmentId); break;
    case "dashboard": await dashboard(root); break;
    case "apps": await appsPage(root); break;
    case "app-new": await appForm(root, null); break;
    case "app-edit": await appForm(root, route.appId); break;
    case "app-links": await appLinks(root, route.appId); break;
    case "app-preview": await previewPage(root, route.appId); break;
    case "devices": await devices(root); break;
    case "settings": await settings(root); break;
    case "guide": await guide(root); break;
    case "agents": await agents(root); break;
    case "terms": await termsPage(root); break;
    case "reference": await referencePage(root); break;
    case "small": await smallPage(root); break;
    case "example": await examplePage(root); break;
    case "example-app": await exampleApp(root); break;
    default: notFound(root);
  }
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

// Same-origin links navigate without a reload; everything else is left to the browser.
document.addEventListener("click", (e) => {
  if (e.defaultPrevented) return;
  const a = (e.target as HTMLElement).closest("a");
  if (!a || a.target || a.hasAttribute("download") || e.metaKey || e.ctrlKey) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/dl/") || /\.(md|txt|svg)$/.test(url.pathname)) return;
  e.preventDefault();
  if (url.pathname === location.pathname && url.hash) {
    history.replaceState(null, "", url.pathname + url.search + url.hash);
    document.getElementById(url.hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
    return;
  }
  navigate(url.pathname + url.search + url.hash);
});

addEventListener("popstate", () => void render());
addEventListener("navigate", () => void render());
void render();
