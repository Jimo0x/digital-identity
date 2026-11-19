const KEY = "digital-identity:v1";
let accounts = [];
try { accounts = JSON.parse(localStorage.getItem(KEY)) || []; } catch { accounts = []; }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(accounts)); } catch { /* navigation privée */ } };

async function addRaw(rows) { for (const r of rows) accounts.push(await Identity.normalize(r)); persist(); refresh(); }
$("#demo").onclick = async () => { accounts = []; await addRaw(Identity.DEMO); toast("Profil de démonstration chargé"); };
$("#clear").onclick = () => { if (confirm("Effacer toutes les données locales ?")) { accounts = []; persist(); refresh(); } };
const drop = $("#drop"), file = $("#file"); drop.onclick = () => file.click(); file.onchange = () => importFile(file.files[0]);
drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); }); drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); importFile(e.dataTransfer.files[0]); });
async function importFile(f) {
  if (!f) return; const txt = await f.text();
  try { const rows = f.name.endsWith(".json") ? (j => Array.isArray(j) ? j : j.items || j.accounts || [])(JSON.parse(txt)) : Identity.parseCSV(txt);
    const flat = rows.map(r => r.login ? { name: r.name, url: (r.login.uris || [{}])[0].uri, username: r.login.username, password: r.login.password } : r); // format Bitwarden JSON
    await addRaw(flat); toast(`${flat.length} comptes importés (mots de passe analysés puis oubliés)`);
  } catch (e) { toast("Fichier illisible : " + e.message); }
}
$("#add").onclick = () => modal("addModal");
$("#save").onclick = async () => {
  if (!$("#fName").value.trim()) return toast("Nom du service requis");
  await addRaw([{ name: $("#fName").value, username: $("#fUser").value, email: $("#fMail").value, phone: $("#fPhone").value, lastUsed: $("#fLast").value || null, password: $("#fPw").value || undefined,
    public: $("#fPublic").checked, realName: $("#fReal").checked, photo: $("#fPhoto").checked, location: $("#fLoc").checked, twofa: $("#f2fa").checked }]);
  $$("#addModal input").forEach(i => i.type === "checkbox" ? i.checked = false : i.value = ""); modal("addModal", false);
};

function refresh() {
  const A = Identity.analyze(accounts);
  $("#nAcc").textContent = accounts.length; $("#nMail").textContent = A.emails.length; $("#nUser").textContent = A.usernames.length;
  $("#nReuse").textContent = A.reused.reduce((s, g) => s + g.length, 0);
  $("#gs").textContent = accounts.length ? A.global : "–"; $("#arc").style.strokeDashoffset = 314 * (1 - (accounts.length ? A.global : 0) / 100);
  $("#arc").style.stroke = A.global < 35 ? "#2ecc71" : A.global < 65 ? "#f5a524" : "#e5172f";
  $("#level").textContent = !accounts.length ? "Aucune donnée" : A.global < 35 ? "Discret" : A.global < 65 ? "Exposé" : "Très exposé";
  $("#nReco").textContent = A.recos.length;
  $("#recos").innerHTML = A.recos.map(r => `<div class="reco"><span class="lvl ${r.lvl}"></span><div><b>${esc(r.t)}</b><div class="d">${esc(r.d)}</div></div></div>`).join("") || `<div class="empty">Ajoutez des comptes pour obtenir des recommandations.</div>`;
  $("#tbl").innerHTML = `<tr><th>Service</th><th>Exposition</th><th>Risques</th></tr>` + A.per.slice(0, 12).map(p => `<tr><td><b>${esc(p.a.name)}</b><div class="dim" style="font-size:11px">${Identity.CATS[p.a.category]}</div></td>
    <td><div class="xp"><i style="width:${p.score}%;background:${p.score > 60 ? "#e5172f" : p.score > 30 ? "#f5a524" : "#2ecc71"}"></i></div><span class="mono dim" style="font-size:11px">${p.score}</span></td>
    <td class="chips">${p.risks.map(r => `<span>${esc(r)}</span>`).join("")}</td></tr>`).join("");
  const cats = {}; accounts.forEach(a => cats[a.category] = (cats[a.category] || 0) + 1);
  Charts.donut($("#donut"), Object.keys(cats).map(c => Identity.CATS[c]), Object.values(cats), { center: accounts.length });
  setGraph(Identity.graph(accounts));
}

/* graphe à forces */
const cv = $("#graph"), ctx = cv.getContext("2d"); let G = { nodes: [], links: [] }, heat = 1, hover = null, drag = null;
const COL = { me: "#ececf1", email: "#5aa9ff", user: "#c084fc", phone: "#f5a524", account: "#e5172f" };
function setGraph(g) {
  const old = Object.fromEntries(G.nodes.map(n => [n.id, n]));
  g.nodes.forEach((n, i) => Object.assign(n, old[n.id] ? { x: old[n.id].x, y: old[n.id].y } : { x: Math.cos(i) * 150, y: Math.sin(i) * 150 }, { vx: 0, vy: 0 }));
  const by = Object.fromEntries(g.nodes.map(n => [n.id, n])); g.links.forEach(l => { l.a = by[l.s]; l.b = by[l.t]; });
  const me = by.me; if (me) { me.x = 0; me.y = 0; } G = g; heat = 1;
}
function step() {
  const N = G.nodes; if (heat < .003) return;
  for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) { const a = N[i], b = N[j], dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy + .1, f = 9000 / d2 * heat, d = Math.sqrt(d2);
    a.vx -= dx / d * f; a.vy -= dy / d * f; b.vx += dx / d * f; b.vy += dy / d * f; }
  G.links.forEach(l => { const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, d = Math.hypot(dx, dy) || 1, k = l.a.type === "me" ? 150 : 85, f = (d - k) * .05 * heat;
    l.a.vx += dx / d * f; l.a.vy += dy / d * f; l.b.vx -= dx / d * f; l.b.vy -= dy / d * f; });
  N.forEach(n => { if (n.type === "me" || n === drag) { n.vx = n.vy = 0; return; } n.vx -= n.x * .002; n.vy -= n.y * .0035; n.x += n.vx; n.y += n.vy; n.vx *= .55; n.vy *= .55; });
  heat *= .993;
}
function draw() {
  step(); const d = devicePixelRatio || 1, r = cv.getBoundingClientRect(); if (cv.width !== r.width * d) { cv.width = r.width * d; cv.height = r.height * d; }
  ctx.setTransform(d, 0, 0, d, r.width / 2 * d, r.height / 2 * d); ctx.clearRect(-r.width, -r.height, r.width * 2, r.height * 2);
  if (!G.nodes.length || G.nodes.length === 1) { ctx.fillStyle = "#5d5d69"; ctx.font = "14px Inter"; ctx.textAlign = "center"; ctx.fillText("Ajoutez des comptes pour voir apparaître votre graphe d'identité.", 0, 0); return requestAnimationFrame(draw); }
  const near = hover && new Set(G.links.filter(l => l.a === hover || l.b === hover).flatMap(l => [l.a, l.b]));
  G.links.forEach(l => { const hl = hover && (l.a === hover || l.b === hover); ctx.strokeStyle = hl ? "#ff3b52" : "rgba(141,141,153,.28)"; ctx.lineWidth = hl ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke(); });
  G.nodes.forEach(n => {
    const rad = n.type === "me" ? 18 : n.type === "account" ? 6 + n.exp / 10 : 9, c = COL[n.type];
    ctx.globalAlpha = near && !near.has(n) ? .2 : 1; ctx.shadowColor = c; ctx.shadowBlur = n === hover ? 22 : 8;
    ctx.fillStyle = n.type === "account" ? `rgba(229,23,47,${.35 + n.exp / 150})` : c; ctx.beginPath();
    if (n.type === "account") ctx.arc(n.x, n.y, rad, 0, 7); else { ctx.save(); ctx.translate(n.x, n.y); ctx.rotate(Math.PI / 4); ctx.rect(-rad * .8, -rad * .8, rad * 1.6, rad * 1.6); ctx.restore(); }
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = n.type === "account" ? "#ececf1" : c; ctx.font = `${n.type === "account" ? 600 : 500} 11px Inter, sans-serif`; ctx.textAlign = "center";
    ctx.fillText(n.label.length > 24 ? n.label.slice(0, 22) + "…" : n.label, n.x, n.y + rad + 13); ctx.globalAlpha = 1;
  });
  requestAnimationFrame(draw);
}
function at(e) { const r = cv.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2; return G.nodes.find(n => Math.hypot(n.x - x, n.y - y) < 16); }
cv.onmousemove = e => { if (drag) { const r = cv.getBoundingClientRect(); drag.x = e.clientX - r.left - r.width / 2; drag.y = e.clientY - r.top - r.height / 2; heat = Math.max(heat, .4); } else { hover = at(e); cv.style.cursor = hover ? "pointer" : "grab"; } };
cv.onmousedown = e => drag = at(e); addEventListener("mouseup", () => drag = null);
draw(); refresh();
