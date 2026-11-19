// node --test tests/ : logique d'analyse (sans navigateur)
"use strict";
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), vm = require("vm"), path = require("path");
const ctx = { crypto: require("crypto").webcrypto, TextEncoder, console }; ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, "../identity.js"), "utf8") + ";globalThis.Identity=Identity;", ctx);
const I = ctx.Identity;

test("les mots de passe ne sont pas conservés mais la réutilisation est détectée", async () => {
  const accs = [];
  for (const r of I.DEMO) accs.push(await I.normalize(r));
  assert.ok(accs.every(a => !("password" in a)));
  const A = I.analyze(accs);
  assert.ok(A.reused.some(g => g.length === 4), JSON.stringify(A.reused));
  assert.ok(A.linkable.some(([u]) => u === "jimo.codes"));
  assert.ok(A.recos.some(r => r.t.includes("PayPal")) && A.global > 50);
});

test("CSV d'export de navigateur", async () => {
  const rows = I.parseCSV('name,url,username,password\n"Ama, zon",https://amazon.fr,a@b.fr,"pa""ss"\nGitHub,https://github.com,dev,pw\n');
  assert.strictEqual(rows.length, 2); assert.strictEqual(rows[0].name, "Ama, zon"); assert.strictEqual(rows[0].password, 'pa"ss');
  const a = await I.normalize(rows[0]); assert.strictEqual(a.email, "a@b.fr"); assert.strictEqual(a.category, "shop");
});

test("entropie", () => { assert.ok(I.entropy("azerty123") <= 15); assert.ok(I.entropy("correct-horse-battery-staple-42") > 100); });
