// Path matching for the few pages the site has.

export type Route =
  | { page: "landing" }
  | { page: "dev-page"; slug: string }
  | { page: "install"; linkId: string }
  | { page: "wait"; linkId: string; enrolmentId: string }
  | { page: "dashboard" }
  | { page: "app-new" }
  | { page: "app-edit"; appId: string }
  | { page: "app-links"; appId: string }
  | { page: "devices" }
  | { page: "settings" }
  | { page: "not-found" };

const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function matchRoute(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return { page: "landing" };
  if (parts[0] === "l") {
    if (parts.length === 2) return { page: "install", linkId: parts[1] };
    if (parts.length === 4 && parts[2] === "wait") return { page: "wait", linkId: parts[1], enrolmentId: parts[3] };
    return { page: "not-found" };
  }
  if (parts[0] === "dev") {
    if (parts.length === 1) return { page: "dashboard" };
    if (parts[1] === "apps" && parts[2] === "new" && parts.length === 3) return { page: "app-new" };
    if (parts[1] === "apps" && parts.length === 3) return { page: "app-edit", appId: parts[2] };
    if (parts[1] === "apps" && parts.length === 4 && parts[3] === "links") return { page: "app-links", appId: parts[2] };
    if (parts[1] === "devices" && parts.length === 2) return { page: "devices" };
    if (parts[1] === "settings" && parts.length === 2) return { page: "settings" };
    return { page: "not-found" };
  }
  if (parts.length === 1 && SLUG.test(parts[0])) return { page: "dev-page", slug: parts[0] };
  return { page: "not-found" };
}
