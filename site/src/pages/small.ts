// Public page: why apps for small audiences can use free services, with worked numbers.
import { whoAmI } from "../api.js";
import { CATEGORIES, CHECKED } from "../freeTiers.js";
import { html, mount } from "../html.js";
import { setTheme } from "../theme.js";
import { icon, wireImages } from "../ui.js";
import { storeFrame } from "./public.js";

export async function smallPage(root: HTMLElement): Promise<void> {
  setTheme("store", "Small apps run on free services", true);
  const me = await whoAmI();
  const services = CATEGORIES.reduce((n, c) => n + c.services.filter((s) => s.verdict !== "avoid").length, 0);
  mount(
    root,
    storeFrame(
      html`
        <article class="story" style="max-width:760px;margin:0 auto">
          <div style="padding:24px 0 8px">
            <span class="pill accent">Why small is powerful</span>
            <h1 style="font-size:40px;margin-top:12px">At eight people, the expensive parts are free</h1>
            <p class="lead muted" style="font-size:19px">AI coding agents let you build an app for the people you know. Building for so few has a second benefit: video calls, multiplayer servers, databases and AI, which cost a public app real money every month, fit inside free plans when the audience is a family or a group of friends.</p>
          </div>

          <h2>What a public app pays for</h2>
          <p>Put video calling into an app for the public and you pay a video service per minute, or run your own media servers. Add live multiplayer and you pay for servers that hold every game open. Add a database, sign-in, notifications and AI, and each one has a bill that grows with every user. That is why most apps either charge, advertise, or never get those features.</p>

          <h2>What a small app pays for</h2>
          <p>Almost every one of those services has a free plan meant for hobby projects and trials. A public app outgrows it on the first day. An app for eight people never does.</p>
          <div class="compare">
            <div class="card"><h3>${icon("devices", "icon-20")} Video calls</h3><ul><li>LiveKit's free plan: <b>5,000 participant minutes a month</b>, no card.</li><li>That is about <b>twenty one-hour calls with four people</b>.</li><li>Skull and McInPoker show every player's camera at the table on it.</li></ul></div>
            <div class="card"><h3>${icon("apps", "icon-20")} Live multiplayer</h3><ul><li>Cloudflare's free plan: 100,000 requests and about 28 hours of awake server time a day, with servers that sleep between moves.</li><li>Skull's cost model: a four-player table fits about <b>80 hours of play a day</b> using hibernating WebSockets.</li></ul></div>
            <div class="card"><h3>${icon("lock", "icon-20")} Databases and files</h3><ul><li>Free databases hold hundreds of megabytes; a family's game history is kilobytes.</li><li>Cloudflare D1, Supabase, Neon and Turso all have free plans.</li></ul></div>
            <div class="card"><h3>${icon("bot", "icon-20")} AI</h3><ul><li>Models built into recent iPhones, Android phones and Chrome run on the device: free, private and offline.</li><li>Free cloud tiers (Cloudflare Workers AI, Groq) cover hundreds of requests a day.</li></ul></div>
          </div>

          <h2>How to stay inside the free plans</h2>
          <ul class="rules">
            <li>${icon("check")}<span><b>Let servers sleep.</b> Push changes over WebSockets that hibernate, instead of having every phone ask "anything new?" every few seconds. Skull's numbers: about 80 hours of play a day against about 23 when polling.</span></li>
            <li>${icon("check")}<span><b>One small server per room.</b> A game table, a family list: each gets its own object that wakes only for its own people.</span></li>
            <li>${icon("check")}<span><b>Send less video.</b> Small tiles at low resolution, cameras on only while someone is at the table, and leave the call when the app is closed.</span></li>
            <li>${icon("check")}<span><b>Prefer services that stop at the limit</b> over ones that bill past it, so a busy week can never become a bill.</span></li>
            <li>${icon("check")}<span><b>Count per account, not per app.</b> Two apps on one free account share one allowance.</span></li>
          </ul>

          <h2>Where the line is</h2>
          <ul class="bullets">
            <li><b>Your AI subscription builds the app; it cannot run it for others.</b> Using Claude, ChatGPT, Gemini or Copilot with a coding agent to write the app is what those plans are for. Routing other people's requests through your personal plan breaks the providers' terms. Use on-device models, free model tiers, or let each person bring their own key.</li>
            <li><b>Free plans have conditions.</b> Some pause after a week unused, some are for non-commercial use only, and some free AI tiers train on what you send them. Some are not available to apps used in the UK and Europe.</li>
            <li><b>Free tiers change.</b> The list below was checked on ${CHECKED}, and every entry links to the provider's own page.</li>
          </ul>

          <div class="card pad-l mt">
            <h2 style="margin-top:0">The list</h2>
            <p class="muted">${services} services in ${CATEGORIES.length} categories, each with its free allowance, its catches and setup steps a coding agent can follow:</p>
            <p>${CATEGORIES.map((c, i) => html`${i ? " · " : ""}${c.title}`)}</p>
            <div class="row wrap mt">
              <a class="btn" href="/free-tiers.md">Read the list (for agents)</a>
              ${me ? html`<a class="btn secondary" href="/dev/guide#free-tiers">Open it in the guide</a>` : html`<a class="btn secondary" href="/api/auth/github">${icon("github")} Sign in for the guide</a>`}
            </div>
          </div>
        </article>
      `,
      { me },
    ),
  );
  wireImages(root);
}
