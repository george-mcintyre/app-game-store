// Path matching for the pages the site has.

export type Route =
  | { page: "landing" }
  | { page: "dev-page"; slug: string }
  | { page: "install"; linkId: string }
  | { page: "dashboard" }
  | { page: "apps" }
  | { page: "app-new" }
  | { page: "app-edit"; appId: string }
  | { page: "app-links"; appId: string }
  | { page: "app-preview"; appId: string }
  | { page: "settings" }
  | { page: "guide" }
  | { page: "agents" }
  | { page: "terms" }
  | { page: "reference" }
  | { page: "small" }
  | { page: "example" }
  | { page: "example-app" }
  | { page: "not-found" };

const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function matchRoute(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return { page: "landing" };
  if (parts[0] === "l") {
    if (parts.length === 2) return { page: "install", linkId: parts[1] };
    // /l/<id>/wait/<anything> opens the install page.
    if (parts.length === 4 && parts[2] === "wait") return { page: "install", linkId: parts[1] };
    return { page: "not-found" };
  }
  if (parts[0] === "dev") {
    if (parts.length === 1) return { page: "dashboard" };
    if (parts[1] === "apps" && parts.length === 2) return { page: "apps" };
    if (parts[1] === "apps" && parts[2] === "new" && parts.length === 3) return { page: "app-new" };
    if (parts[1] === "apps" && parts.length === 3) return { page: "app-edit", appId: parts[2] };
    if (parts[1] === "apps" && parts.length === 4 && parts[3] === "links") return { page: "app-links", appId: parts[2] };
    if (parts[1] === "apps" && parts.length === 4 && parts[3] === "preview") return { page: "app-preview", appId: parts[2] };
    if (parts[1] === "settings" && parts.length === 2) return { page: "settings" };
    if (parts[1] === "guide" && parts.length === 2) return { page: "guide" };
    if (parts[1] === "agents" && parts.length === 2) return { page: "agents" };
    return { page: "not-found" };
  }
  if (parts.length === 1 && parts[0] === "terms") return { page: "terms" };
  if (parts.length === 1 && parts[0] === "reference") return { page: "reference" };
  if (parts.length === 1 && parts[0] === "small") return { page: "small" };
  if (parts[0] === "example") {
    if (parts.length === 1) return { page: "example" };
    if (parts.length === 2 && parts[1] === "poker-night") return { page: "example-app" };
    return { page: "not-found" };
  }
  if (parts.length === 1 && SLUG.test(parts[0])) return { page: "dev-page", slug: parts[0] };
  return { page: "not-found" };
}
