import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";

const dir = "/private/tmp/claude-501/-Users-leohenrique-Sites-movepark-hub/2ce6c491-583e-4f8d-9962-867de934c668/scratchpad/roadmap";
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto(pathToFileURL(path.join(dir, "deck.html")).href, { waitUntil: "networkidle" });
await p.evaluate(async () => {
  const specs = ["400 17px Inter", "800 19px Inter", "900 50px Inter", "900 84px Inter"];
  await Promise.all(specs.map((s) => document.fonts.load(s)));
  await document.fonts.ready;
});
await p.waitForTimeout(600);
const slides = await p.$$(".slide");
for (const n of process.argv.slice(2).map(Number)) {
  await slides[n - 1].screenshot({ path: path.join(dir, `shot-${n}.png`) });
}
await b.close();
console.log("ok");
