// Only Safari passes a configuration profile on to iOS Settings. Other iPhone browsers and the
// browsers built into apps download it and stop there. A Safari view inside another app reports
// itself as Safari and usually works.
const OTHERS: [RegExp, string][] = [
  [/CriOS/, "Chrome"],
  [/FxiOS/, "Firefox"],
  [/EdgiOS/, "Edge"],
  [/OPiOS|OPT\//, "Opera"],
  [/DuckDuckGo|Ddg\//, "DuckDuckGo"],
  [/YaBrowser/, "Yandex"],
  [/GSA\//, "the Google app"],
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB/, "Facebook"],
  [/\bLine\//, "Line"],
  [/Twitter/i, "X"],
  [/musical_ly|Bytedance/i, "TikTok"],
  [/Snapchat/i, "Snapchat"],
  [/Pinterest/i, "Pinterest"],
  [/LinkedInApp/i, "LinkedIn"],
  [/WAiOS/, "WhatsApp"],
];

export function profileBrowser(userAgent: string): { safari: boolean; name: string } {
  for (const [test, name] of OTHERS) if (test.test(userAgent)) return { safari: false, name };
  // Safari says Version/x and Safari/y; web views inside apps say neither.
  if (/Version\/[\d.]+/.test(userAgent) && /Safari\//.test(userAgent)) return { safari: true, name: "Safari" };
  return { safari: false, name: "this browser" };
}
