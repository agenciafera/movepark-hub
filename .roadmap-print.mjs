import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";
const dir = "/private/tmp/claude-501/-Users-leohenrique-Sites-movepark-hub/2ce6c491-583e-4f8d-9962-867de934c668/scratchpad/roadmap";
const out = path.join(dir, "coopark-roadmap.pdf");
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(pathToFileURL(path.join(dir, "deck.html")).href, { waitUntil: "networkidle" });
await page.evaluate(async () => {
  const specs = ["400 17px Inter","500 16px Inter","700 15px Inter","800 19px Inter","900 50px Inter","900 84px Inter"];
  await Promise.all(specs.map((s) => document.fonts.load(s)));
  await document.fonts.ready;
});
await page.waitForTimeout(800);

const imgs = await page.evaluate(() =>
  [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute("src")));
console.log("imagens quebradas:", JSON.stringify(imgs));

const spill = await page.evaluate(() => {
  const res = [];
  document.querySelectorAll(".slide").forEach((sl, i) => {
    const sb = sl.getBoundingClientRect();
    const limite = sb.top + 846;
    sl.querySelectorAll("p,li,h1,h2,h3,td,th,div,span").forEach((el) => {
      if (el.children.length) return;
      const t = (el.textContent || "").trim();
      if (!t || el.closest(".foot")) return;
      const r = el.getBoundingClientRect();
      if (r.height === 0) return;
      if (r.bottom > limite) res.push({ n: i + 1, txt: t.slice(0, 40), bottom: Math.round(r.bottom - sb.top) });
    });
  });
  return res;
});
console.log("texto vazando:", JSON.stringify(spill.slice(0, 10)));

const overflow = await page.evaluate(() =>
  [...document.querySelectorAll(".slide")].map((s, i) => ({ n: i + 1, h: s.scrollHeight, w: s.scrollWidth }))
    .filter((s) => s.h > 901 || s.w > 1601));
console.log("overflow:", JSON.stringify(overflow));
console.log("slides:", await page.evaluate(() => document.querySelectorAll(".slide").length));

await page.pdf({ path: out, width: "1600px", height: "900px", printBackground: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: false });
if (errors.length) console.log("ERROS:", errors.slice(0, 5));
await browser.close();
console.log("PDF:", out);
