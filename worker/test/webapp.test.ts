import { zipSync, strToU8 } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../src/env.js";
import { handle } from "../src/index.js";
import { contentType, decorateHtml, extractBundle, inspectHead, isBundleUrl, pickName, webAppLinkId } from "../src/webapp.js";
import { BASE, api, clearDb, createSkull, fakeFetch, githubRoutes, jsonRes, manifest, saveAppleSecrets, signIn, testDeps, testEnv, type TestDeps } from "./helpers.js";

const HOST = new URL(BASE).host;

function bundle(prefix = ""): Uint8Array {
  return zipSync({
    [`${prefix}index.html`]: strToU8("<!doctype html><title>Skull web</title><link rel=icon href=./icon.svg><script type=module src=./assets/app.js></script>"),
    [`${prefix}assets/app.js`]: strToU8("console.log('hi')"),
    [`${prefix}icon.svg`]: strToU8("<svg xmlns='http://www.w3.org/2000/svg'/>"),
    [`${prefix}manifest.webmanifest`]: strToU8('{"start_url":"./"}'),
  });
}

function webRoutes(zip: Uint8Array) {
  const routes = githubRoutes();
  routes["GET api.github.com/repos/o/skull/releases/latest"] = () =>
    jsonRes({ tag_name: "v0.1.0", assets: [{ name: "my-app.json", url: "https://api.github.com/repos/o/skull/releases/assets/1" }, { name: "web.zip", url: "https://api.github.com/repos/o/skull/releases/assets/9" }] });
  routes["GET api.github.com/repos/o/skull/releases/assets/1"] = () => jsonRes({ ...manifest, install: { ...manifest.install, pwa: "https://api.github.com/repos/o/skull/releases/assets/9" } });
  routes["GET api.github.com/repos/o/skull/releases/assets/9"] = () => new Response(zip, { status: 200, headers: { "Content-Type": "application/zip" } });
  return routes;
}

let env: Env;
let deps: TestDeps;
let cookie: string;

beforeEach(async () => {
  env = testEnv();
  await clearDb(env);
  deps = testDeps(fakeFetch(webRoutes(bundle())).fetch);
  cookie = await signIn(env, deps);
});

describe("helpers", () => {
  it("recognises per-link hosts", () => {
    expect(webAppLinkId(new Request(`https://abcdef0123456789abcdef01.${HOST}/x`), env)).toBe("abcdef0123456789abcdef01");
    expect(webAppLinkId(new Request(`https://${HOST}/x`), env)).toBeNull();
    expect(webAppLinkId(new Request(`https://www.${HOST}/`), env)).toBeNull();
    expect(webAppLinkId(new Request(`https://abcdef0123456789abcdef01.evil.example/`), env)).toBeNull();
  });

  it("tells bundles from plain web addresses", () => {
    const rel = { manifestUrl: "x", assets: ["my-app.json", "web.zip"] };
    expect(isBundleUrl("https://api.github.com/repos/o/r/releases/assets/5", rel)).toBe(true);
    expect(isBundleUrl("https://api.github.com/repos/o/r/releases/assets/5", { ...rel, assets: ["my-app.json"] })).toBe(false);
    expect(isBundleUrl("https://skull.example.com/", rel)).toBe(false);
    expect(isBundleUrl(null, rel)).toBe(false);
  });

  it("strips a single top-level folder and maps paths", () => {
    const files = extractBundle(bundle("dist/"));
    expect(Object.keys(files).sort()).toEqual(["assets/app.js", "icon.svg", "index.html", "manifest.webmanifest"]);
    const names = Object.keys(files);
    expect(pickName(names, "/")).toBe("index.html");
    expect(pickName(names, "/assets/app.js")).toBe("assets/app.js");
    expect(pickName(names, "/table/3")).toBe("index.html");
    expect(pickName(names, "/missing.png")).toBeNull();
    expect(pickName(names, "/../etc/passwd")).toBeNull();
    expect(() => extractBundle(zipSync({ "readme.txt": strToU8("x") }))).toThrow(/index.html/);
    expect(contentType("a.webmanifest")).toBe("application/manifest+json");
    expect(contentType("a.unknown")).toBe("application/octet-stream");
  });
});

describe("serving", () => {
  it("serves the bundle on the link's own host with the app's own html", async () => {
    await saveAppleSecrets(env, deps, cookie);
    const { linkId } = await createSkull(env, deps, cookie);
    const origin = `https://${linkId}.${HOST}`;
    const home = await handle(new Request(`${origin}/`), env, deps);
    expect(home.status).toBe(200);
    expect(home.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(home.headers.get("Cache-Control")).toBe("no-cache");
    expect(home.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(await home.text()).toContain("<title>Skull web</title>");

    const js = await handle(new Request(`${origin}/assets/app.js`), env, deps);
    expect(js.headers.get("Content-Type")).toBe("text/javascript; charset=utf-8");
    expect(js.headers.get("Cache-Control")).toMatch(/max-age=86400/);
    const etag = js.headers.get("ETag")!;
    expect((await handle(new Request(`${origin}/assets/app.js`, { headers: { "If-None-Match": etag } }), env, deps)).status).toBe(304);

    const deep = await handle(new Request(`${origin}/table/3`), env, deps);
    expect(await deep.text()).toContain("Skull web");
    expect((await handle(new Request(`${origin}/nope.png`), env, deps)).status).toBe(404);
    expect((await handle(new Request(`${origin}/api/dev/me`, { headers: { Cookie: cookie } }), env, deps)).status).toBe(404);
    expect((await handle(new Request(`${origin}/`, { method: "POST" }), env, deps)).status).toBe(405);
  });

  it("unpacks once per release into KV and serves later requests without the zip", async () => {
    await saveAppleSecrets(env, deps, cookie);
    const { linkId, appId } = await createSkull(env, deps, cookie);
    const origin = `https://${linkId}.${HOST}`;
    const stub = fakeFetch(webRoutes(bundle()));
    const d = { ...deps, fetch: stub.fetch };
    expect((await handle(new Request(`${origin}/`), env, d)).status).toBe(200);
    const zipFetches = () => stub.calls.filter((c) => c.url.endsWith("/assets/9")).length;
    expect(zipFetches()).toBe(1);
    expect(await env.WEBAPP_FILES.get(`webapp:${appId}:index`, "json")).toMatchObject({ tag: "v0.1.0", files: expect.arrayContaining(["index.html", "assets/app.js"]) });
    expect((await handle(new Request(`${origin}/assets/app.js`), env, d)).status).toBe(200);
    expect((await handle(new Request(`${origin}/table/9`), env, d)).status).toBe(200);
    expect(zipFetches()).toBe(1);

    // A new release tag triggers one more unpack.
    const routes = webRoutes(bundle());
    routes["GET api.github.com/repos/o/skull/releases/latest"] = () =>
      jsonRes({ tag_name: "v0.2.0", assets: [{ name: "my-app.json", url: "https://api.github.com/repos/o/skull/releases/assets/1" }, { name: "web.zip", url: "https://api.github.com/repos/o/skull/releases/assets/9" }] });
    const stub2 = fakeFetch(routes);
    await (globalThis as { caches?: { default?: Cache } }).caches?.default?.delete(new Request(`https://webapp.ourapps.internal/${appId}/release`));
    expect((await handle(new Request(`${origin}/`), env, { ...deps, fetch: stub2.fetch })).status).toBe(200);
    expect(stub2.calls.filter((c) => c.url.endsWith("/assets/9")).length).toBe(1);
    expect((await env.WEBAPP_FILES.get<{ tag: string }>(`webapp:${appId}:index`, "json"))!.tag).toBe("v0.2.0");
  });

  it("refuses unknown, revoked and bundle-less links with a plain page", async () => {
    const unknown = await handle(new Request(`https://0123456789abcdef0123456789abcdef.${HOST}/`), env, deps);
    expect(unknown.status).toBe(404);
    expect(await unknown.text()).toContain("Nothing here");

    const { linkId } = await createSkull(env, deps, cookie);
    await handle(api(cookie, "POST", `/api/dev/links/${linkId}/revoke`), env, deps);
    const gone = await handle(new Request(`https://${linkId}.${HOST}/`), env, deps);
    expect(gone.status).toBe(410);
    expect(await gone.text()).toContain("no longer active");

    const { linkId: plain } = await createSkull(env, deps, cookie);
    const none = await handle(new Request(`https://${plain}.${HOST}/`), env, { ...deps, fetch: fakeFetch(githubRoutes()).fetch });
    expect(none.status).toBe(404);
    expect(await none.text()).toContain("no web.zip");
  });

  it("points the install page and /latest at the served app, never at GitHub", async () => {
    await saveAppleSecrets(env, deps, cookie);
    const { appId, linkId } = await createSkull(env, deps, cookie);
    const page = (await (await handle(api(null, "GET", `/api/public/links/${linkId}`), env, deps)).json()) as { release: { install: { pwa: string } } };
    expect(page.release.install.pwa).toBe(`https://${linkId}.${HOST}/`);
    const latest = (await (await handle(api(null, "GET", `/api/public/links/${linkId}/latest`), env, deps)).json()) as { pwa: string };
    expect(latest.pwa).toBe(`https://${linkId}.${HOST}/`);
    const preview = (await (await handle(api(cookie, "GET", `/api/dev/apps/${appId}/preview`), env, deps)).json()) as { release: { install: { pwa: string | null } } };
    expect(preview.release.install.pwa).toBeNull();
  });

  it("leaves a plain web address alone", async () => {
    await saveAppleSecrets(env, deps, cookie);
    const { linkId } = await createSkull(env, deps, cookie);
    const routes = githubRoutes();
    routes["GET api.github.com/repos/o/skull/releases/assets/1"] = () => jsonRes({ ...manifest, install: { ...manifest.install, pwa: "https://skull.example.com/" } });
    const page = (await (await handle(api(null, "GET", `/api/public/links/${linkId}`), env, { ...deps, fetch: fakeFetch(routes).fetch })).json()) as { release: { install: { pwa: string } } };
    expect(page.release.install.pwa).toBe("https://skull.example.com/");
  });
});

describe("home screen install", () => {
  it("adds manifest, apple tags and the banner script to html that lacks them", async () => {
    await saveAppleSecrets(env, deps, cookie);
    const { linkId } = await createSkull(env, deps, cookie);
    const origin = `https://${linkId}.${HOST}`;
    const html = await (await handle(new Request(`${origin}/`), env, deps)).text();
    expect(html).toContain('<link rel="manifest" href="/__ourapps/manifest.webmanifest">');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes">');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Skull">');
    expect(html).toContain('<link rel="apple-touch-icon" href="./icon.svg">');
    expect(html).toContain('<script src="/__ourapps/install.js" defer></script>');
    expect(html.indexOf("<title>Skull web</title>")).toBeGreaterThan(html.indexOf("install.js"));

    const banner = await handle(new Request(`${origin}/__ourapps/install.js`), env, deps);
    expect(banner.headers.get("Content-Type")).toBe("text/javascript; charset=utf-8");
    expect(await banner.text()).toContain("beforeinstallprompt");

    const manifest = await handle(new Request(`${origin}/__ourapps/manifest.webmanifest`), env, deps);
    expect(manifest.headers.get("Content-Type")).toBe("application/manifest+json");
    expect(await manifest.json()).toMatchObject({ name: "Skull", display: "standalone", start_url: "./", scope: "./", icons: [{ src: "./icon.svg" }] });
  });

  it("leaves a bundle's own manifest and tags alone", async () => {
    await saveAppleSecrets(env, deps, cookie);
    const { linkId } = await createSkull(env, deps, cookie);
    const own = zipSync({
      "index.html": strToU8('<!doctype html><html><head><meta name="viewport" content="x"><link rel="manifest" href="./m.webmanifest"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Mine"><link rel="apple-touch-icon" href="./a.png"><meta name="theme-color" content="#000"><meta name="application-name" content="Mine"></head><body>hi</body></html>'),
      "m.webmanifest": strToU8("{}"),
    });
    const html = await (await handle(new Request(`https://${linkId}.${HOST}/`), env, { ...deps, fetch: fakeFetch(webRoutes(own)).fetch })).text();
    expect(html).not.toContain("__ourapps/manifest");
    expect(html).not.toContain('apple-mobile-web-app-title" content="Skull"');
    expect((html.match(/apple-mobile-web-app-capable/g) ?? []).length).toBe(1);
    expect(html).toContain('<script src="/__ourapps/install.js" defer></script>');
  });

  it("inspects heads and decorates html without a head", () => {
    const facts = inspectHead('<html><head><link href="/fav.ico" rel="icon"><meta name="theme-color" content="#fff"></head></html>');
    expect(facts).toMatchObject({ iconHref: "/fav.ico", hasThemeColor: true, hasManifest: false });
    const out = decorateHtml("<p>bare</p>", "X", null);
    expect(out.startsWith('<meta name="viewport"')).toBe(true);
    expect(out).toContain("<p>bare</p>");
  });
});
