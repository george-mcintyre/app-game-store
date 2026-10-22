// The developer console frame: sidebar on desktop, tabs on phones.
import { ApiError, whoAmI, type Me } from "../api.js";
import { html, mount, type Raw } from "../html.js";
import { navigate } from "../nav.js";
import { setTheme } from "../theme.js";
import { avatar, icon, wireCopy, wireImages } from "../ui.js";
import { COPYRIGHT, SOURCE_URL, storeFrame } from "./public.js";
import { termsPending } from "./terms.js";

const NAV: { href: string; label: string; icon: string; match: (p: string) => boolean }[] = [
  { href: "/dev", label: "Overview", icon: "home", match: (p) => p === "/dev" },
  { href: "/dev/apps", label: "Apps", icon: "apps", match: (p) => p.startsWith("/dev/apps") },
  { href: "/dev/guide", label: "Guide", icon: "book", match: (p) => p.startsWith("/dev/guide") },
  { href: "/reference", label: "Reference", icon: "info", match: (p) => p.startsWith("/reference") },
  { href: "/dev/agents", label: "Agents and API", icon: "bot", match: (p) => p.startsWith("/dev/agents") },
  { href: "/dev/settings", label: "Settings", icon: "gear", match: (p) => p.startsWith("/dev/settings") },
];

export function githubAvatar(me: Me): string {
  return `https://github.com/${me.developer.githubLogin}.png?size=96`;
}

// Resolve the signed-in developer or show the sign-in card; returns null when not signed in.
export async function requireMe(root: HTMLElement): Promise<Me | null> {
  setTheme("dev", "Developer console");
  const me = await whoAmI(true);
  if (me && termsPending(me)) {
    navigate("/terms");
    return null;
  }
  if (me) return me;
  setTheme("store", "Sign in");
  mount(
    root,
    storeFrame(html`
      <div class="card pad-l center" style="max-width:520px;margin:40px auto">
        ${icon("logo", "icon-20")}
        <h1 style="margin:8px 0 6px">Developer console</h1>
        <p class="muted">Sign in with GitHub to add apps, create share links and put iPhone apps on TestFlight. Only your public profile is read.</p>
        <a class="btn lg mt" href="/api/auth/github">${icon("github")} Sign in with GitHub</a>
        <p class="small faint mt">New here? The <a href="/dev/guide">guide</a> walks through everything from first sign-in to the first friend installing.</p>
      </div>
    `),
  );
  return null;
}

export function shell(me: Me, title: string, body: Raw, opts: { sub?: string; actions?: Raw; crumbs?: Raw } = {}): Raw {
  const path = location.pathname;
  const links = NAV.map((n) => html`<a class="nav ${n.match(path) ? "active" : ""}" href="${n.href}">${icon(n.icon)} ${n.label}</a>`);
  return html`
    <div class="shell">
      <aside class="side">
        <a class="brand" href="/dev">${icon("logo")}<span>ourapps<small>Developer console</small></span></a>
        ${links}
        <div class="spacer"></div>
        <a class="nav" href="/${me.developer.slug}">${icon("eye")} My public page</a>
        <div class="who">${avatar(me.developer.displayName, githubAvatar(me))}<div class="grow"><b>${me.developer.displayName}</b><span>@${me.developer.githubLogin}</span><form method="post" action="/api/auth/logout"><button class="signout" type="submit">Sign out</button></form></div></div>
      </aside>
      <div class="main">
        <div class="topbar">
          <div class="row"><a class="brand" href="/dev" style="color:#fff">${icon("logo")} ourapps console</a>${avatar(me.developer.displayName, githubAvatar(me), "sm")}</div>
          <div class="tabs">${NAV.map((n) => html`<a class="${n.match(path) ? "active" : ""}" href="${n.href}">${n.label}</a>`)}<a href="/${me.developer.slug}">Public page</a><a href="/api/auth/logout" data-logout>Sign out</a></div>
        </div>
        <main class="content fade-in">
          ${opts.crumbs ? html`<div class="crumbs">${opts.crumbs}</div>` : ""}
          <div class="page-head"><div><h1>${title}</h1>${opts.sub ? html`<p>${opts.sub}</p>` : ""}</div>${opts.actions ?? ""}</div>
          ${body}
          <footer class="console-footer">${COPYRIGHT} · <a href="/terms">Terms and data statement</a> · <a href="/dev/guide#security">Security</a> · <a href="${SOURCE_URL}" target="_blank" rel="noopener">Source</a></footer>
        </main>
      </div>
    </div>
  `;
}

export function mountShell(root: HTMLElement, me: Me, title: string, body: Raw, opts: Parameters<typeof shell>[3] = {}): void {
  setTheme("dev", `${title} · ourapps console`);
  mount(root, shell(me, title, body, opts));
  wireImages(root);
  wireCopy(root);
  root.querySelector<HTMLAnchorElement>("[data-logout]")?.addEventListener("click", (e) => {
    e.preventDefault();
    const f = document.createElement("form");
    f.method = "post";
    f.action = "/api/auth/logout";
    document.body.appendChild(f);
    f.submit();
  });
}

export function failed(root: HTMLElement, me: Me, err: unknown): void {
  const message = err instanceof ApiError ? err.message : String(err);
  mountShell(root, me, "Something went wrong", html`<div class="callout bad">${icon("warn")}<p>${message}</p></div>`);
}
