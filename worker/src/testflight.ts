// TestFlight distribution: set-up per app, the upload the workflow makes through ourapps, and the
// scheduled step that puts each processed build in the friends' group and sends it for beta review.
import { AppleClient, AppleError } from "./apple.js";
import { Db, type AppRow, type Developer, type TestflightBuildRow } from "./db.js";
import type { Deps, Env } from "./env.js";
import { appleClient } from "./flow.js";
import { dispatchEvent } from "./github.js";
import { HttpError } from "./http.js";
import { loadSecrets } from "./secrets.js";

export const BETA_GROUP = "Friends (ourapps)";
// A build stops working 90 days after upload; a new one is asked for this long before.
export const REFRESH_DAYS = 14;

const clean = (s: string) => s.replace(/[^A-Za-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
export const storeProfileName = (appName: string) => `${clean(appName) || "App"} App Store`;

export function reviewContact(dev: Developer): { firstName: string; lastName: string; email: string; phone: string } | null {
  if (!dev.reviewFirstName || !dev.reviewLastName || !dev.reviewEmail || !dev.reviewPhone) return null;
  return { firstName: dev.reviewFirstName, lastName: dev.reviewLastName, email: dev.reviewEmail, phone: dev.reviewPhone };
}

// Everything ourapps can do for TestFlight; the App Store Connect app itself the developer adds once.
export async function setUpTestflight(env: Env, deps: Deps, dev: Developer, app: AppRow): Promise<AppRow> {
  const db = Db.from(env);
  if (!app.bundleId) throw new HttpError(409, "give the app its iPhone bundle ID first");
  const contact = reviewContact(dev);
  if (!contact) throw new HttpError(409, "add the contact Apple's beta review uses (name, email, phone) under Settings first");
  const certificate = await db.signingCertificate(dev.id);
  if (!certificate) throw new HttpError(409, "set up iPhone signing under Settings first");
  const apple = appleClient(env, deps, await loadSecrets(env, dev.id, ["appleIssuerId", "appleKeyId", "applePrivateKey"]));
  try {
    const store = await apple.findStoreApp(app.bundleId);
    if (!store) {
      throw new HttpError(
        409,
        `App Store Connect has no app with bundle ID ${app.bundleId}. Add it once: App Store Connect, Apps, the plus, New App, platform iOS, name ${app.name}, bundle ID ${app.bundleId}, any SKU. Then set up TestFlight again.`,
      );
    }
    const bundleRes = await apple.ensureBundleId(app.bundleId, app.name);
    const profile = await apple.ensureStoreProfile(storeProfileName(app.name), bundleRes, certificate.certificateId);
    const group = await apple.ensureBetaGroup(store.id, BETA_GROUP);
    await apple.setBetaReviewDetails(store.id, contact, "Shared privately with friends and family through ourapps.app. No sign-in is needed to use the app.");
    await apple.setBetaDescription(store.id, { description: app.description || app.tagline || app.name, feedbackEmail: contact.email });
    Object.assign(app, {
      ascAppId: store.id,
      betaGroupId: group.id,
      testflightUrl: group.publicLink ?? app.testflightUrl ?? null,
      storeProfileId: profile.id,
      storeProfileUuid: profile.uuid,
      storeProfileName: storeProfileName(app.name),
      storeProfileBase64: profile.profileContent,
    });
    await db.setAppTestflight(app);
    return app;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, err instanceof Error ? err.message : String(err));
  }
}

// The workflow's upload: ourapps reserves it at Apple and returns where to send the bytes.
export async function reserveUpload(env: Env, deps: Deps, app: AppRow, body: { version?: unknown; buildNumber?: unknown; fileName?: unknown; fileSize?: unknown; whatsNew?: unknown }) {
  if (!app.ascAppId) throw new HttpError(409, "TestFlight is not set up for this app; the developer sets it up on the app's page in ourapps");
  const version = typeof body.version === "string" ? body.version.trim() : "";
  const buildNumber = typeof body.buildNumber === "string" ? body.buildNumber.trim() : "";
  const fileName = typeof body.fileName === "string" && /\.ipa$/i.test(body.fileName) ? body.fileName : "";
  const fileSize = typeof body.fileSize === "number" && Number.isInteger(body.fileSize) && body.fileSize > 0 ? body.fileSize : 0;
  if (!version || !buildNumber || !fileName || !fileSize) throw new HttpError(400, "version, buildNumber, fileName (.ipa) and fileSize are required");
  const apple = appleClient(env, deps, await loadSecrets(env, app.developerId, ["appleIssuerId", "appleKeyId", "applePrivateKey"]));
  let reserved: Awaited<ReturnType<AppleClient["reserveBuildUpload"]>>;
  try {
    reserved = await apple.reserveBuildUpload(app.ascAppId, version, buildNumber, fileName, fileSize);
  } catch (err) {
    throw new HttpError(502, err instanceof Error ? err.message : String(err));
  }
  const now = deps.now().toISOString();
  await Db.from(env).insertTestflightBuild({
    appId: app.id,
    version,
    buildNumber,
    uploadId: reserved.uploadId,
    uploadFileId: reserved.fileId,
    buildId: null,
    whatsNew: typeof body.whatsNew === "string" ? body.whatsNew.slice(0, 4000) : null,
    state: "uploading",
    message: null,
    createdAt: now,
    updatedAt: now,
  });
  return { uploadFileId: reserved.fileId, operations: reserved.operations };
}

export async function commitUpload(env: Env, deps: Deps, app: AppRow, body: { uploadFileId?: unknown; md5?: unknown }) {
  const fileId = typeof body.uploadFileId === "string" ? body.uploadFileId : "";
  const md5 = typeof body.md5 === "string" && /^[0-9a-f]{32}$/i.test(body.md5) ? body.md5.toLowerCase() : "";
  if (!fileId || !md5) throw new HttpError(400, "uploadFileId and md5 (32 hex characters) are required");
  const db = Db.from(env);
  const row = await db.testflightBuild(app.id, fileId);
  if (!row) throw new HttpError(404, "no upload with that id for this app");
  const apple = appleClient(env, deps, await loadSecrets(env, app.developerId, ["appleIssuerId", "appleKeyId", "applePrivateKey"]));
  try {
    await apple.commitBuildUpload(fileId, md5);
  } catch (err) {
    row.state = "failed";
    row.message = err instanceof Error ? err.message : String(err);
    row.updatedAt = deps.now().toISOString();
    await db.updateTestflightBuild(row);
    throw new HttpError(502, row.message);
  }
  row.state = "uploaded";
  row.updatedAt = deps.now().toISOString();
  await db.updateTestflightBuild(row);
  return { state: row.state };
}

// Moves one build on: processing, then into the group with its notes and off to beta review.
export async function advanceBuild(apple: AppleClient, app: AppRow, row: TestflightBuildRow): Promise<void> {
  if (row.state === "uploaded" && row.uploadId) {
    const up = await apple.buildUploadState(row.uploadId);
    if (up.state === "FAILED") {
      row.state = "failed";
      row.message = up.errors.join("; ") || "Apple rejected the upload";
      return;
    }
  }
  const build = await apple.findBuild(app.ascAppId!, row.version, row.buildNumber);
  if (!build) return;
  row.buildId = build.id;
  if (build.processingState === "PROCESSING") {
    row.state = "processing";
    return;
  }
  if (build.processingState !== "VALID") {
    row.state = "failed";
    row.message = `Apple marked the build ${build.processingState.toLowerCase()}`;
    return;
  }
  if (build.usesNonExemptEncryption === null) {
    row.state = "needs-compliance";
    row.message = "Apple needs the export compliance answer: set ITSAppUsesNonExemptEncryption in Info.plist, or answer it for this build in App Store Connect";
    return;
  }
  await apple.addBuildToGroup(app.betaGroupId!, build.id);
  if (row.whatsNew) await apple.setWhatsNew(build.id, row.whatsNew);
  try {
    await apple.submitForBetaReview(build.id);
  } catch (err) {
    // A build of a version Apple already reviewed may need no review, or may already be submitted.
    if (!(err instanceof AppleError && err.status === 409)) throw err;
  }
  row.state = "distributed";
  row.message = null;
}

// Run on a schedule: move pending builds on, fill in public links, and ask for a fresh build
// before the newest one expires.
export async function tickTestflight(env: Env, deps: Deps): Promise<void> {
  const db = Db.from(env);
  const apps = new Map<string, AppRow>();
  const clients = new Map<string, AppleClient>();
  const clientFor = async (devId: string) => {
    if (!clients.has(devId)) clients.set(devId, appleClient(env, deps, await loadSecrets(env, devId, ["appleIssuerId", "appleKeyId", "applePrivateKey"])));
    return clients.get(devId)!;
  };
  // Each run stays well inside the free plan's 50 outbound calls.
  for (const row of (await db.pendingTestflightBuilds()).slice(0, 5)) {
    const app = apps.get(row.appId) ?? (await db.appById(row.appId));
    if (!app?.ascAppId || !app.betaGroupId) continue;
    apps.set(app.id, app);
    try {
      await advanceBuild(await clientFor(app.developerId), app, row);
    } catch (err) {
      row.message = err instanceof Error ? err.message : String(err);
    }
    row.updatedAt = deps.now().toISOString();
    await db.updateTestflightBuild(row);
  }
  for (const app of (await db.appsWithTestflight()).slice(0, 5)) {
    try {
      const apple = await clientFor(app.developerId);
      if (!app.testflightUrl && app.betaGroupId) {
        const link = await apple.betaGroupLink(app.betaGroupId);
        if (link) {
          app.testflightUrl = link;
          await db.setAppTestflight(app);
        }
      }
      await refreshIfExpiring(env, deps, db, apple, app);
    } catch (err) {
      console.error(`testflight ${app.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function refreshIfExpiring(env: Env, deps: Deps, db: Db, apple: AppleClient, app: AppRow): Promise<void> {
  const recent = (await db.testflightBuilds(app.id, 1))[0];
  const now = deps.now().getTime();
  if (recent && now - Date.parse(recent.createdAt) < 7 * 86_400_000) return;
  const live = await apple.latestLiveBuild(app.ascAppId!);
  const expires = live?.expirationDate ? Date.parse(live.expirationDate) : null;
  if (expires !== null && expires - now > REFRESH_DAYS * 86_400_000) return;
  if (!live && !recent) return;
  const secrets = await loadSecrets(env, app.developerId, ["githubToken"]);
  await dispatchEvent(env, deps, secrets.githubToken, app.repo, RELEASE_EVENT, { app: app.id, reason: "testflight-expiry" });
  // Recorded so the next run does not ask again within a week.
  const at = deps.now().toISOString();
  await db.insertTestflightBuild({ appId: app.id, version: "-", buildNumber: "-", uploadId: null, uploadFileId: null, buildId: null, whatsNew: null, state: "failed", message: "asked the repository for a fresh build before the TestFlight build expires", createdAt: at, updatedAt: at });
}

export const RELEASE_EVENT = "my-store-release";
