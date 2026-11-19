// Modèle et analyse de l'empreinte numérique — tout est calculé localement dans le navigateur.
const Identity = (() => {
  const CATS = { social: "Réseaux sociaux", pro: "Professionnel", shop: "Achats", gaming: "Jeux", dev: "Développement", media: "Médias & loisirs", finance: "Finance", other: "Autre" };
  const KNOWN = {
    "facebook": "social", "instagram": "social", "x": "social", "twitter": "social", "tiktok": "social", "snapchat": "social", "reddit": "social", "discord": "social",
    "linkedin": "pro", "malt": "pro", "indeed": "pro", "welcome to the jungle": "pro", "amazon": "shop", "vinted": "shop", "leboncoin": "shop", "aliexpress": "shop",
    "steam": "gaming", "epic games": "gaming", "riot games": "gaming", "twitch": "gaming", "playstation": "gaming", "github": "dev", "gitlab": "dev", "stack overflow": "dev",
    "spotify": "media", "netflix": "media", "youtube": "media", "deezer": "media", "paypal": "finance", "revolut": "finance", "lydia": "finance", "boursorama": "finance",
  };
  const guessCat = name => { const n = name.toLowerCase(); for (const k in KNOWN) if (n.includes(k)) return KNOWN[k]; return "other"; };

  async function sha(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("").slice(0, 16); }
  function entropy(pw) {
    let pool = 0; if (/[a-z]/.test(pw)) pool += 26; if (/[A-Z]/.test(pw)) pool += 26; if (/\d/.test(pw)) pool += 10; if (/[^a-zA-Z0-9]/.test(pw)) pool += 33;
    let bits = pw.length * Math.log2(pool || 1);
    if (/(.)\1{2,}/.test(pw)) bits -= 10; if (/^(azerty|qwerty|password|motdepasse|123456|soleil|admin)/i.test(pw)) bits = Math.min(bits, 15);
    return Math.max(0, Math.round(bits));
  }

  /** Normalise une ligne importée (CSV de gestionnaire de mots de passe, JSON, saisie manuelle).
   *  Le mot de passe n'est JAMAIS conservé : on garde seulement une empreinte tronquée (pour détecter
   *  la réutilisation) et une estimation de sa robustesse. */
  async function normalize(r) {
    const name = (r.name || r.platform || r.title || (r.url || "").replace(/^https?:\/\/(www\.)?/, "").split("/")[0] || "?").trim();
    const user = (r.username || r.login || r.login_username || r.user || "").trim();
    const acc = {
      id: crypto.randomUUID(), name, category: r.category || guessCat(name + " " + (r.url || "")),
      username: user.includes("@") ? "" : user, email: (r.email || (user.includes("@") ? user : "")).trim().toLowerCase(),
      phone: (r.phone || "").replace(/\s/g, ""), realName: !!(r.realName === true || r.realName === "true" || r.real_name === "1"),
      photo: !!(r.photo === true || r.photo === "true"), location: !!(r.location === true || r.location === "true"),
      public: r.public === undefined ? null : !!(r.public === true || r.public === "true"), twofa: r.twofa === undefined ? null : !!(r.twofa === true || r.twofa === "true"),
      lastUsed: r.lastUsed || r.last_used || null, created: r.created || null,
    };
    const pw = r.password || r.login_password;
    if (pw) { acc.pwHash = await sha(pw); acc.pwBits = entropy(pw); }
    return acc;
  }

  function parseCSV(text) {
    const rows = []; let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
      else cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    const head = rows.shift().map(h => h.trim().toLowerCase());
    return rows.filter(r => r.some(Boolean)).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] || ""])));
  }

  const monthsSince = d => d ? (Date.now() - new Date(d).getTime()) / (30.4 * 86400000) : null;

  function exposure(a) {
    const risks = []; let s = 0;
    if (a.public) { s += 15; risks.push("profil public"); }
    if (a.realName) { s += 15; risks.push("vrai nom"); }
    if (a.photo) { s += 10; risks.push("photo"); }
    if (a.location) { s += 12; risks.push("localisation"); }
    if (a.phone) { s += 12; risks.push("téléphone lié"); }
    if (a.twofa === false) { s += 15; risks.push("pas de 2FA"); }
    if (a.pwBits !== undefined && a.pwBits < 50) { s += 12; risks.push("mot de passe faible"); }
    const m = monthsSince(a.lastUsed); if (m !== null && m > 18) { s += 10; risks.push("compte dormant"); }
    if (a.category === "finance" && a.twofa !== true) s += 8;
    return { score: Math.min(100, s), risks };
  }

  /** Graphe : vous → identifiants (e-mails, pseudos, téléphones) → comptes. */
  function graph(accounts) {
    const nodes = [{ id: "me", label: "Vous", type: "me" }], links = [], seen = new Set();
    const ident = (kind, value) => { const id = kind + ":" + value; if (!seen.has(id)) { seen.add(id); nodes.push({ id, label: value, type: kind }); links.push({ s: "me", t: id }); } return id; };
    for (const a of accounts) {
      nodes.push({ id: a.id, label: a.name, type: "account", cat: a.category, exp: exposure(a).score });
      if (a.email) links.push({ s: ident("email", a.email), t: a.id });
      if (a.username) links.push({ s: ident("user", a.username), t: a.id });
      if (a.phone) links.push({ s: ident("phone", a.phone), t: a.id });
      if (!a.email && !a.username && !a.phone) links.push({ s: "me", t: a.id });
    }
    return { nodes, links };
  }

  function analyze(accounts) {
    const per = accounts.map(a => ({ a, ...exposure(a) }));
    const reuse = {}; accounts.filter(a => a.pwHash).forEach(a => (reuse[a.pwHash] ||= []).push(a.name));
    const reused = Object.values(reuse).filter(g => g.length > 1);
    const byEmail = {}; accounts.forEach(a => a.email && (byEmail[a.email] ||= []).push(a.name));
    const byUser = {}; accounts.forEach(a => a.username && (byUser[a.username] ||= []).push(a.name));
    const linkable = Object.entries(byUser).filter(([, v]) => v.length >= 3);
    const dormant = accounts.filter(a => monthsSince(a.lastUsed) > 18);
    const no2fa = accounts.filter(a => a.twofa === false && ["finance", "pro", "dev", "shop", "social"].includes(a.category));
    const avg = per.length ? per.reduce((s, p) => s + p.score, 0) / per.length : 0;
    const global = Math.round(Math.min(100, avg * 0.7 + reused.reduce((s, g) => s + g.length * 4, 0) + linkable.length * 5 + Math.min(15, accounts.length / 3)));
    const recos = [];
    reused.forEach(g => recos.push({ lvl: "red", t: `Même mot de passe sur ${g.length} comptes`, d: `${g.join(", ")} : une seule fuite suffit à tous les ouvrir. Utilisez un mot de passe unique par site (gestionnaire).` }));
    no2fa.forEach(a => recos.push({ lvl: a.category === "finance" ? "red" : "warn", t: `Activer la double authentification sur ${a.name}`, d: "Une application TOTP ou une clé de sécurité bloque la majorité des prises de contrôle." }));
    linkable.forEach(([u, v]) => recos.push({ lvl: "warn", t: `Le pseudo « ${u} » relie ${v.length} comptes`, d: `${v.join(", ")} : n'importe qui peut reconstituer votre profil en cherchant ce pseudo. Variez-les selon les usages.` }));
    if (Object.keys(byEmail).length === 1 && accounts.length > 5) recos.push({ lvl: "warn", t: "Une seule adresse e-mail pour tout", d: "Utilisez des alias (SimpleLogin, Firefox Relay, alias iCloud) pour cloisonner et repérer qui revend votre adresse." });
    dormant.forEach(a => recos.push({ lvl: "info", t: `Supprimer ${a.name} (inutilisé depuis ${Math.round(monthsSince(a.lastUsed))} mois)`, d: "Un compte oublié est une donnée de plus exposée en cas de fuite, sans aucun bénéfice." }));
    accounts.filter(a => a.pwBits !== undefined && a.pwBits < 50).forEach(a => recos.push({ lvl: "warn", t: `Mot de passe faible sur ${a.name}`, d: `Robustesse estimée : ${a.pwBits} bits. Visez au moins 70 bits (une phrase de passe de 4 à 5 mots, par exemple).` }));
    per.filter(p => p.a.public && p.a.location).forEach(p => recos.push({ lvl: "warn", t: `${p.a.name} : profil public avec localisation`, d: "Désactivez la géolocalisation des publications ou passez le profil en privé." }));
    return { per: per.sort((x, y) => y.score - x.score), reused, linkable, dormant, global, recos, emails: Object.keys(byEmail), usernames: Object.keys(byUser) };
  }

  const DEMO = [
    { name: "Instagram", username: "jimo.codes", email: "jimo@gmail.com", public: true, realName: true, photo: true, location: true, twofa: false, lastUsed: "2026-11-10", password: "Soleil2004!" },
    { name: "TikTok", username: "jimo.codes", email: "jimo@gmail.com", public: true, photo: true, twofa: false, lastUsed: "2026-11-12", password: "Soleil2004!" },
    { name: "X (Twitter)", username: "jimo_codes", email: "jimo@gmail.com", public: true, realName: false, photo: true, twofa: false, lastUsed: "2025-01-03", password: "x7#Vb!29qLp" },
    { name: "LinkedIn", email: "jimo.pro@outlook.fr", public: true, realName: true, photo: true, location: true, twofa: true, lastUsed: "2026-11-01", password: "Lk-2026-pro!Aq9" },
    { name: "GitHub", username: "jimo.codes", email: "jimo.pro@outlook.fr", public: true, realName: true, photo: true, twofa: true, lastUsed: "2026-11-15", password: "correct-horse-battery-staple-42" },
    { name: "Discord", username: "jimo.codes", email: "jimo@gmail.com", photo: true, twofa: false, lastUsed: "2026-11-14", password: "Soleil2004!" },
    { name: "Steam", username: "darkjimo", email: "jimo@gmail.com", public: true, twofa: true, lastUsed: "2026-10-20", password: "steam_darkjimo_99" },
    { name: "Amazon", email: "jimo@gmail.com", phone: "+33612345678", realName: true, twofa: false, lastUsed: "2026-11-08", password: "azerty123" },
    { name: "PayPal", email: "jimo@gmail.com", phone: "+33612345678", realName: true, twofa: false, lastUsed: "2026-09-30", password: "Soleil2004!" },
    { name: "Vinted", username: "jimo_vend", email: "jimo@gmail.com", phone: "+33612345678", realName: false, photo: true, location: true, public: true, twofa: false, lastUsed: "2024-02-11", password: "vinted2022" },
    { name: "Spotify", email: "jimo@gmail.com", public: true, twofa: false, lastUsed: "2026-11-16", password: "music4life" },
    { name: "Myspace", username: "jimo_93", email: "jimo93@hotmail.fr", public: true, realName: true, photo: true, location: true, lastUsed: "2012-06-01" },
  ];
  return { CATS, normalize, parseCSV, exposure, graph, analyze, entropy, DEMO };
})();
