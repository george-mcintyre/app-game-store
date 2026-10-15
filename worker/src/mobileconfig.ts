// Apple profile service: the .mobileconfig that asks the device for its UDID, and the reply parser.

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function enrolmentProfile(opts: { callbackUrl: string; appName: string; organisation: string; uuid: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <dict>
    <key>URL</key>
    <string>${escapeXml(opts.callbackUrl)}</string>
    <key>DeviceAttributes</key>
    <array>
      <string>UDID</string>
      <string>PRODUCT</string>
      <string>VERSION</string>
    </array>
  </dict>
  <key>PayloadOrganization</key>
  <string>${escapeXml(opts.organisation)}</string>
  <key>PayloadDisplayName</key>
  <string>${escapeXml(`Install ${opts.appName}`)}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
  <key>PayloadUUID</key>
  <string>${escapeXml(opts.uuid)}</string>
  <key>PayloadIdentifier</key>
  <string>com.georgemcintyre.app-game-store.enrol</string>
  <key>PayloadDescription</key>
  <string>${escapeXml(`Tells ${opts.organisation} which phone to build ${opts.appName} for. It is removed automatically after install.`)}</string>
  <key>PayloadType</key>
  <string>Profile Service</string>
</dict>
</plist>
`;
}

export interface DeviceAttributes {
  udid: string;
  product?: string;
  version?: string;
}

// The device posts a PKCS#7 blob; the plist sits inside it as plain text.
export function parseDeviceReply(body: Uint8Array): DeviceAttributes | null {
  const text = new TextDecoder("latin1").decode(body);
  const start = text.indexOf("<?xml");
  const end = text.indexOf("</plist>");
  if (start < 0 || end < 0) return null;
  const plist = text.slice(start, end + "</plist>".length);
  const udid = plistString(plist, "UDID");
  if (!udid || !/^[0-9A-Fa-f-]{25,40}$/.test(udid)) return null;
  return { udid, product: plistString(plist, "PRODUCT") ?? undefined, version: plistString(plist, "VERSION") ?? undefined };
}

function plistString(plist: string, key: string): string | null {
  const match = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(plist);
  return match ? match[1].trim() : null;
}
