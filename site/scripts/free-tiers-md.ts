// Writes public/free-tiers.md from src/freeTiers.ts so agents read the same catalogue the guide shows.
import { writeFileSync } from "node:fs";
import { CATEGORIES, CHECKED, PRINCIPLES } from "../src/freeTiers.ts";

const lines: string[] = [];
const push = (...l: string[]) => lines.push(...l);

push(
  "# Free services for small-audience apps",
  "",
  `Checked on the providers' own pages on ${CHECKED}. Free tiers change: open the Sources links and confirm a limit before relying on it. "(unverified)" marks what could not be confirmed.`,
  "",
  "Apps distributed through ourapps.app have a few to a few dozen users. At that size most backend services fit inside free plans: realtime servers, video calls, databases, AI, notifications. This file lists them with limits, catches and setup steps an AI coding agent can follow.",
  "",
  "## Rules that apply to every service",
  "",
  ...PRINCIPLES.map((p) => `- ${p}`),
  "",
  "## Contents",
  "",
  ...CATEGORIES.map((c) => `- ${c.title}: ${c.services.map((s) => s.name).join("; ")}`),
  "",
);

for (const c of CATEGORIES) {
  push(`## ${c.title}`, "", c.why, "");
  if (c.practices?.length) push("Best practices:", "", ...c.practices.map((p) => `- ${p}`), "");
  for (const s of c.services) {
    push(`### ${s.name}${s.verdict === "avoid" ? " (avoid)" : s.verdict === "pick" ? " (recommended)" : ""}`, "", `Plan: ${s.plan}. Fits: ${s.fits}`, "", "Free allowance:", "", ...s.free.map((f) => `- ${f}`), "", "Catches:", "", ...s.catches.map((f) => `- ${f}`), "", "Agent setup:", "", ...s.setup.map((f, i) => `${i + 1}. ${f}`), "");
    if (s.env?.length) push(`Secrets: ${s.env.map((e) => `\`${e}\``).join(", ")}`, "");
    push(`Sources: ${s.sources.join(" , ")}`, "");
  }
}

push("Copyright Level N Ltd 2026.", "");
writeFileSync(new URL("../public/free-tiers.md", import.meta.url), lines.join("\n"));
