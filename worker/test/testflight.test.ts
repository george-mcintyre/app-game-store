import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../src/env.js";
import { handle } from "../src/index.js";
import { tickTestflight } from "../src/testflight.js";
import { BASE, CSR, api, appleRoutes, clearDb, fakeFetch, githubRoutes, jsonRes, manifest, rsaPem, saveAppleSecrets, signIn, testDeps, testEnv, type Call, type TestDeps } from "./helpers.js";

const apple = (p: string) => `api.appstoreconnect.apple.com${p}`;

let env: Env;
let deps: TestDeps;
let cookie: string;

beforeEach(async () => {
  env = testEnv();
  await clearDb(env);
  deps = testDeps(fakeFetch(githubRoutes()).fetch);
  cookie = await signIn(env, deps);
});

// Apple as TestFlight sees it: one App Store Connect app, groups, review details, uploads and builds.
function storeRoutes(state: { storeApp: boolean; build?: { processingState: string; usesNonExemptEncryption: boolean | null } }) {
  const groups: { id: string; name: string; publicLink: string | null }[] = [];
  return {
    ...appleRoutes({ noOldProfile: true, bundleIds: [{ id: "bid-skull", identifier: "com.example.skull" }] }),
    [`GET ${apple("/v1/apps")}`]: () => jsonRes({ data: state.storeApp ? [{ id: "asc-1", type: "apps", attributes: { bundleId: "com.example.skull", name: "Skull" } }] : [] }),
    [`GET ${apple("/v1/apps/asc-1/betaGroups")}`]: () => jsonRes({ data: groups.map((g) => ({ id: g.id, type: "betaGroups", attributes: { name: g.name, isInternalGroup: false, publicLinkEnabled: true, publicLink: g.publicLink } })) }),
    [`POST ${apple("/v1/betaGroups")}`]: (c: Call) => {
      const g = { id: "grp-1", name: JSON.parse(c.body!).data.attributes.name, publicLink: "https://testflight.apple.com/join/AbCd1234" };
      groups.push(g);
      return jsonRes({ data: { id: g.id, type: "betaGroups", attributes: { name: g.name, isInternalGroup: false, publicLinkEnabled: true, publicLink: g.publicLink } } }, 201);
    },
    [`GET ${apple("/v1/apps/asc-1/betaAppReviewDetail")}`]: () => jsonRes({ data: { id: "rev-1", type: "betaAppReviewDetails", attributes: {} } }),
    [`PATCH ${apple("/v1/betaAppReviewDetails/rev-1")}`]: () => jsonRes({ data: { id: "rev-1", type: "betaAppReviewDetails", attributes: {} } }),
    [`GET ${apple("/v1/apps/asc-1/betaAppLocalizations")}`]: () => jsonRes({ data: [] }),
    [`POST ${apple("/v1/betaAppLocalizations")}`]: () => jsonRes({ data: { id: "loc-1", type: "betaAppLocalizations", attributes: {} } }, 201),
    [`POST ${apple("/v1/buildUploads")}`]: () => jsonRes({ data: { id: "up-1", type: "buildUploads", attributes: {} } }, 201),
    [`POST ${apple("/v1/buildUploadFiles")}`]: () =>
      jsonRes({ data: { id: "file-1", type: "buildUploadFiles", attributes: { uploadOperations: [{ method: "PUT", url: "https://upload.example/part1", offset: 0, length: 9, requestHeaders: [{ name: "Content-Type", value: "application/octet-stream" }] }] } } }, 201),
    [`PATCH ${apple("/v1/buildUploadFiles/file-1")}`]: () => jsonRes({ data: { id: "file-1", type: "buildUploadFiles", attributes: {} } }),
    [`GET ${apple("/v1/buildUploads/up-1")}`]: () => jsonRes({ data: { id: "up-1", type: "buildUploads", attributes: { state: { state: "COMPLETE" } } } }),
    [`GET ${apple("/v1/builds")}`]: () => jsonRes({ data: state.build ? [{ id: "build-1", type: "builds", attributes: { ...state.build, expirationDate: "2027-01-18T00:00:00Z" } }] : [] }),
    [`POST ${apple("/v1/betaGroups/grp-1/relationships/builds")}`]: () => new Response(null, { status: 204 }),
    [`GET ${apple("/v1/builds/build-1/betaBuildLocalizations")}`]: () => jsonRes({ data: [] }),
    [`POST ${apple("/v1/betaBuildLocalizations")}`]: () => jsonRes({ data: { id: "bl-1", type: "betaBuildLocalizations", attributes: {} } }, 201),
    [`POST ${apple("/v1/betaAppReviewSubmissions")}`]: () => jsonRes({ data: { id: "sub-1", type: "betaAppReviewSubmissions", attributes: {} } }, 201),
  };
}

async function readyApp(routes: ReturnType<typeof storeRoutes>) {
  await saveAppleSecrets(env, deps, cookie);
  const d = { ...deps, fetch: fakeFetch(routes).fetch };
  expect((await handle(api(cookie, "POST", "/api/dev/signing", { csr: CSR, privateKey: await rsaPem() }), env, d)).status).toBe(201);
  const made = await handle(api(cookie, "POST", "/api/dev/apps", { name: "Skull", repo: "o/skull", bundleId: "com.example.skull" }), env, d);
  const { app, buildToken } = (await made.json()) as { app: { id: string }; buildToken: string };
  const link = (await (await handle(api(cookie, "POST", `/api/dev/apps/${app.id}/links`, {}), env, d)).json()) as { link: { id: string } };
  return { appId: app.id, buildToken, linkId: link.link.id };
}

describe("TestFlight", () => {
  it("names the developer's next step, and what to type into App Store Connect", async () => {
    type View = { setUp: boolean; needs: string | null; storeApp: { name: string; otherName: string; bundleId: string; sku: string } | null };
    const routes = storeRoutes({ storeApp: false });
    const made = await handle(api(cookie, "POST", "/api/dev/apps", { name: "Skull", repo: "o/skull" }), env, deps);
    const { app } = (await made.json()) as { app: { id: string } };
    const d = { ...deps, fetch: fakeFetch(routes).fetch };
    const view = async (method = "GET") => (await (await handle(api(cookie, method, `/api/dev/apps/${app.id}/testflight`), env, d)).json()) as View;
    expect(await view()).toMatchObject({ setUp: false, needs: "bundle-id", storeApp: null });
    await handle(api(cookie, "PUT", `/api/dev/apps/${app.id}`, { bundleId: "com.example.skull" }), env, d);
    expect((await view()).needs).toBe("apple-key");
    await saveAppleSecrets(env, deps, cookie);
    expect((await view()).needs).toBe("signing");
    await handle(api(cookie, "POST", "/api/dev/signing", { csr: CSR, privateKey: await rsaPem() }), env, d);
    expect((await view()).needs).toBe("review-contact");
    expect((await view("POST")).needs).toBe("review-contact");
    expect((await handle(api(cookie, "PUT", "/api/dev/review-contact", { firstName: "George", lastName: "McIntyre", email: "nope", phone: "+44 7700 900123" }), env, d)).status).toBe(400);
    expect((await handle(api(cookie, "PUT", "/api/dev/review-contact", { firstName: "George", lastName: "McIntyre", email: "g@example.com", phone: "+44 7700 900123" }), env, d)).status).toBe(200);
    // Nothing is left that ourapps can check without Apple; the POST finds no App Store Connect app.
    expect((await view()).needs).toBeNull();
    const posted = await view("POST");
    expect(posted).toMatchObject({ setUp: false, needs: "store-app", storeApp: { name: "Skull", otherName: "Skull by George", bundleId: "com.example.skull", sku: "skull" } });
  });

  it("sets up the profile, group and public link, brokers the upload and distributes the processed build", async () => {
    const state: Parameters<typeof storeRoutes>[0] = { storeApp: true };
    const routes = storeRoutes(state);
    const { appId, buildToken, linkId } = await readyApp(routes);
    const { fetch, calls } = fakeFetch({ ...githubRoutes(), ...routes, "GET api.github.com/repos/o/skull/releases/assets/1": () => jsonRes({ ...manifest, install: { ...manifest.install, ios: { bundleId: "com.example.skull", testflight: "https://testflight.apple.com/join/OLD" } } }) });
    const d = { ...deps, fetch };
    await handle(api(cookie, "PUT", "/api/dev/review-contact", { firstName: "George", lastName: "McIntyre", email: "g@example.com", phone: "+44 7700 900123" }), env, d);

    const set = await handle(api(cookie, "POST", `/api/dev/apps/${appId}/testflight`), env, d);
    expect(set.status).toBe(200);
    expect(await set.json()).toMatchObject({ setUp: true, needs: null, storeApp: null, url: "https://testflight.apple.com/join/AbCd1234", profile: "Skull App Store", contact: true, builds: [] });
    const storeProfile = JSON.parse(calls.filter((c) => c.method === "POST" && c.url.endsWith("/v1/profiles")).at(-1)!.body!).data;
    expect(storeProfile.attributes).toEqual({ name: "Skull App Store", profileType: "IOS_APP_STORE" });
    expect(storeProfile.relationships.devices).toBeUndefined();
    const review = JSON.parse(calls.find((c) => c.method === "PATCH" && c.url.endsWith("/v1/betaAppReviewDetails/rev-1"))!.body!).data.attributes;
    expect(review).toMatchObject({ contactFirstName: "George", contactEmail: "g@example.com", demoAccountRequired: false });

    // The install page and the update check use ourapps' link, not the one in my-app.json.
    const page = (await (await handle(api(null, "GET", `/api/public/links/${linkId}`), env, d)).json()) as { release: { install: { ios: { testflight: string } } } };
    expect(page.release.install.ios.testflight).toBe("https://testflight.apple.com/join/AbCd1234");

    const auth = { Authorization: `Bearer ${buildToken}` };
    const signing = (await (await handle(api(null, "GET", `/api/build/${appId}/signing`, undefined, auth), env, d)).json()) as Record<string, unknown>;
    expect(signing).toMatchObject({ storeProfile: { profileName: "Skull App Store" }, testflight: { url: "https://testflight.apple.com/join/AbCd1234" } });
    expect(signing).not.toHaveProperty("profile");

    expect((await handle(api(null, "POST", `/api/build/${appId}/testflight/upload`, { version: "1.0" }, auth), env, d)).status).toBe(400);
    const up = await handle(api(null, "POST", `/api/build/${appId}/testflight/upload`, { version: "1.0", buildNumber: "7", fileName: "skull.ipa", fileSize: 9, whatsNew: "Rematch button" }, auth), env, d);
    expect(up.status).toBe(200);
    expect(await up.json()).toEqual({ uploadFileId: "file-1", operations: [{ method: "PUT", url: "https://upload.example/part1", offset: 0, length: 9, requestHeaders: [{ name: "Content-Type", value: "application/octet-stream" }] }] });
    const commit = await handle(api(null, "POST", `/api/build/${appId}/testflight/commit`, { uploadFileId: "file-1", md5: "0123456789abcdef0123456789abcdef" }, auth), env, d);
    expect(await commit.json()).toEqual({ state: "uploaded" });
    expect(JSON.parse(calls.find((c) => c.method === "PATCH" && c.url.endsWith("/v1/buildUploadFiles/file-1"))!.body!).data.attributes).toEqual({ uploaded: true, sourceFileChecksums: { file: { algorithm: "MD5", hash: "0123456789abcdef0123456789abcdef" } } });

    const status = async () => ((await (await handle(api(cookie, "GET", `/api/dev/apps/${appId}/testflight`), env, d)).json()) as { builds: { state: string; message: string | null }[] }).builds[0];
    // Still processing at Apple, then missing the export compliance answer, then distributed.
    state.build = { processingState: "PROCESSING", usesNonExemptEncryption: null };
    await tickTestflight(env, d);
    expect((await status()).state).toBe("processing");
    state.build = { processingState: "VALID", usesNonExemptEncryption: null };
    await tickTestflight(env, d);
    expect(await status()).toMatchObject({ state: "needs-compliance", message: expect.stringMatching(/ITSAppUsesNonExemptEncryption/) });
    state.build = { processingState: "VALID", usesNonExemptEncryption: false };
    await tickTestflight(env, d);
    expect(await status()).toMatchObject({ state: "distributed", message: null });
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/v1/betaGroups/grp-1/relationships/builds"))).toBe(true);
    expect(JSON.parse(calls.find((c) => c.method === "POST" && c.url.endsWith("/v1/betaBuildLocalizations"))!.body!).data.attributes).toEqual({ locale: "en-US", whatsNew: "Rematch button" });
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/v1/betaAppReviewSubmissions"))).toBe(true);
  });

  it("asks the repository for a fresh build before the latest one expires", async () => {
    const state: Parameters<typeof storeRoutes>[0] = { storeApp: true };
    const routes = storeRoutes(state);
    const { appId } = await readyApp(routes);
    await handle(api(cookie, "PUT", "/api/dev/review-contact", { firstName: "George", lastName: "McIntyre", email: "g@example.com", phone: "+44 7700 900123" }), env, { ...deps, fetch: fakeFetch(routes).fetch });
    await handle(api(cookie, "POST", `/api/dev/apps/${appId}/testflight`), env, { ...deps, fetch: fakeFetch(routes).fetch });
    // The test clock is 16 October 2026; the build expires 18 January 2027: nothing to do.
    state.build = { processingState: "VALID", usesNonExemptEncryption: false };
    const quiet = fakeFetch({ ...routes, ...githubRoutes() });
    await tickTestflight(env, { ...deps, fetch: quiet.fetch });
    expect(quiet.calls.some((c) => c.url.endsWith("/dispatches"))).toBe(false);
    // Ten days before expiry: one release request, and none again the same week.
    deps.advance(84 * 86_400_000);
    const due = fakeFetch({ ...routes, ...githubRoutes() });
    await tickTestflight(env, { ...deps, fetch: due.fetch });
    const sent = due.calls.filter((c) => c.url.endsWith("/dispatches"));
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0].body!)).toEqual({ event_type: "my-store-release", client_payload: { app: appId, reason: "testflight-expiry" } });
    const again = fakeFetch({ ...routes, ...githubRoutes() });
    await tickTestflight(env, { ...deps, fetch: again.fetch });
    expect(again.calls.some((c) => c.url.endsWith("/dispatches"))).toBe(false);
  });
});
