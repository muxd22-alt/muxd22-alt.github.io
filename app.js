let DATA = null;
let REPOS = new Map();      // name -> repo object
let MEMBERS = [];           // flattened member cards
let TREES = new Map();      // repo -> {dirs:Map, files:[{name,size}]}
let KNOW = [];              // knowledge sources (data files with actual content)
let KNOW_MAP = new Map();   // "repo/member" -> source
let KMEM = [];              // [{repo, member, files:{rel:text}}]
let KF = new Map();         // "repo|member|rel" -> text
const REPO_ORDER = ["quant-econ", "news-dashboards", "agent-tools", "mobile-android", "geo-unity"];
const RAW = (repo, branch, path) =>
  `https://raw.githubusercontent.com/muxd22-alt/${repo}/${branch}/` +
  path.split("/").map(encodeURIComponent).join("/");

const content = () => document.getElementById("content");

/* ---------- index ---------- */

function extOf(p) {
  const m = /\.([A-Za-z0-9_+-]+)$/.exec(p);
  return m ? m[1].toLowerCase() : "";
}

function buildTree(repo) {
  const root = { dirs: new Map(), files: [] };
  for (const [path, size] of repo.files) {
    const parts = path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.dirs.has(parts[i])) node.dirs.set(parts[i], { dirs: new Map(), files: [] });
      node = node.dirs.get(parts[i]);
    }
    node.files.push({ name: parts[parts.length - 1], size, path });
  }
  return root;
}

function descFrom(readme, fallback) {
  if (!readme) return fallback || "";
  const out = [];
  for (const raw of readme.split("\n")) {
    const t = raw.trim();
    if (!t) { if (out.length) break; continue; }
    if (t.startsWith("#")) { if (!out.length) { out.push(t.replace(/^#+\s*/, "")); continue; } continue; }
    if (/^(!\[|\[!\[|```|\||<|~~~)/.test(t)) continue;
    out.push(t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, ""));
    if (out.join(" ").length > 260) break;
  }
  const s = out.join(" ").slice(0, 300);
  return s || fallback || "";
}

function titleFrom(readme, fallback) {
  if (readme) {
    const h = /^#\s+(.+)$/m.exec(readme);
    if (h) return h[1].trim().slice(0, 70);
  }
  return fallback;
}

function stackOf(files) {
  const c = {};
  for (const [p] of files) {
    const e = extOf(p);
    if (e) c[e] = (c[e] || 0) + 1;
  }
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 5);
}

async function load() {
  DATA = await (await fetch("data.json?ts=" + Date.now())).json();
  document.getElementById("generated").textContent =
    DATA.generated_at ? "updated " + new Date(DATA.generated_at).toUTCString() : "";

  let totalFiles = 0;
  for (const r of DATA.repos) {
    REPOS.set(r.name, r);
    TREES.set(r.name, buildTree(r));
    totalFiles += r.files.length;
    for (const m of r.members) {
      const prefix = m.path ? m.path + "/" : "";
      const mfiles = r.files.filter(f => f[0].startsWith(prefix));
      MEMBERS.push({
        repo: r.name, branch: r.default_branch, pinned: !!r.pinned,
        name: m.name, path: m.path, prefix,
        readme: m.readme,
        title: titleFrom(m.readme, m.name),
        desc: descFrom(m.readme, r.pinned ? (r.description || "") : ""),
        files: mfiles.length,
        bytes: mfiles.reduce((a, f) => a + f[1], 0),
        stack: stackOf(mfiles),
      });
    }
  }
  KNOW = DATA.knowledge || [];
  KMEM = KNOW.map(k => ({ repo: k.repo, member: k.member, files: k.files || {} }));
  KF = new Map();
  for (const k of KMEM) {
    for (const [rel, text] of Object.entries(k.files)) KF.set(k.repo + "|" + k.member + "|" + rel, text);
  }
  for (const k of KNOW) {
    KNOW_MAP.set(k.repo + "/" + k.member, k);
    const m = MEMBERS.find(x => x.repo === k.repo && x.name === k.member);
    if (m) m.knowledge = k;
  }

  document.getElementById("footer-stats").textContent =
    `${DATA.repos.length} repos · ${MEMBERS.length} members · ${totalFiles.toLocaleString()} files indexed · ` +
    `raw content streamed from GitHub on demand`;
}

/* ---------- render helpers ---------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function sanitize(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  tpl.content.querySelectorAll("script,iframe,object,embed,link,style,form").forEach(n => n.remove());
  tpl.content.querySelectorAll("*").forEach(n => {
    for (const a of [...n.attributes]) {
      if (/^on/i.test(a.name) || /javascript:/i.test(a.value)) n.removeAttribute(a.name);
    }
  });
  return tpl.innerHTML;
}

function md(text) {
  if (window.marked && marked.parse) {
    try { return sanitize(marked.parse(text, { mangle: false, headerIds: false })); } catch (e) {}
  }
  return "<pre>" + esc(text) + "</pre>";
}

function fmtBytes(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + " GB";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + " MB";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + " KB";
  return n + " B";
}

function icon(name) {
  return { folder: "📁", file: "📄", image: "🖼", md: "📝", code: "⚙️" }[name] || "📄";
}

/* ---------- sidebar tree ---------- */

function fileIcon(path) {
  const e = extOf(path);
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(e)) return "🖼";
  if (["md", "mdx", "txt", "rst"].includes(e)) return "📝";
  if (["js", "ts", "tsx", "py", "kt", "cs", "go", "rs", "java", "sh", "rb", "php", "swift", "cpp", "c", "h", "html", "css", "yml", "yaml", "json", "toml"].includes(e)) return "⚙️";
  return "📄";
}

function dirNode(repoName, node, label, opts = {}) {
  const d = document.createElement("details");
  d.className = "tree";
  const s = document.createElement("summary");
  s.innerHTML = `<span class="chev">▶</span> <span>${opts.repo ? '<span class="repo-name">' + esc(label) + "</span>"
    : opts.member ? '<span class="member-name">' + esc(label) + "</span>" : esc(label)}</span>
    <span class="kind">${node.dirs.size + node.files.length}</span>`;
  d.appendChild(s);
  d.addEventListener("toggle", () => {
    if (d.dataset.built || !d.open) return;
    d.dataset.built = "1";
    const box = document.createElement("div");
    box.className = "children";
    for (const [name, child] of [...node.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      box.appendChild(dirNode(repoName, child, name));
    }
    for (const f of [...node.files].sort((a, b) => a.name.localeCompare(b.name))) {
      const a = document.createElement("a");
      a.className = "node file";
      a.href = "#/f/" + repoName + "/" + f.path.split("/").map(encodeURIComponent).join("/");
      a.textContent = fileIcon(f.path) + " " + f.name;
      box.appendChild(a);
    }
    d.appendChild(box);
  });
  return d;
}

function renderTree() {
  const nav = document.getElementById("tree");
  nav.innerHTML = "";
  for (const r of DATA.repos) {
    const tree = TREES.get(r.name);
    const d = dirNode(r.name, tree, r.name + (r.pinned ? "  · pinned" : ""), { repo: true });
    if (!r.pinned) {
      // collapse "repos" level: show members directly
      const reposDir = tree.dirs.get("repos");
      d.addEventListener("toggle", () => {
        if (!d.open || d.dataset.members || !reposDir) return;
        d.dataset.members = "1";
        d.querySelector(".children")?.remove();
        const box = document.createElement("div");
        box.className = "children";
        for (const [name, child] of [...reposDir.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
          box.appendChild(dirNode(r.name, child, name, { member: true }));
        }
        for (const f of [...reposDir.files].sort((a, b) => a.name.localeCompare(b.name))) {
          const a = document.createElement("a");
          a.className = "node file";
          a.href = "#/f/" + r.name + "/" + f.path.split("/").map(encodeURIComponent).join("/");
          a.textContent = fileIcon(f.path) + " " + f.name;
          box.appendChild(a);
        }
        d.appendChild(box);
      });
    }
    nav.appendChild(d);
  }
}

/* ---------- views ---------- */

function viewHome() {
  const monos = MEMBERS.filter(m => !m.pinned);
  const pinned = MEMBERS.filter(m => m.pinned);
  const card = m => `
    <div class="card" data-nav="#/m/${encodeURIComponent(m.repo)}/${encodeURIComponent(m.name)}">
      <h3>${esc(m.title)}
        <span class="repo-tag">${esc(m.repo)}</span>
        ${m.pinned ? '<span class="repo-tag pinned-tag">pinned</span>' : ""}
        ${m.knowledge ? '<span class="repo-tag k-tag">knowledge</span>' : ""}
      </h3>
      <p>${esc(m.desc)}</p>
      <div class="meta">
        <span>${m.files} files</span><span>${fmtBytes(m.bytes)}</span>
        <span>${m.stack.map(([e, n]) => `<span class="chip">${esc(e)} ${n}</span>`).join("")}</span>
      </div>
    </div>`;
  content().innerHTML = `
    ${knowledgeSection()}
    <div class="section-title">Members across all monorepos</div>
    <div class="grid">${monos.sort((a, b) => a.repo.localeCompare(b.repo) || a.name.localeCompare(b.name)).map(card).join("")}</div>
    <div class="section-title">Pinned standalone repos</div>
    <div class="grid">${pinned.map(card).join("")}</div>`;
  content().querySelectorAll("[data-nav]").forEach(el =>
    el.addEventListener("click", () => (location.hash = el.dataset.nav)));
}

function viewMember(repoName, memberName) {
  const m = MEMBERS.find(x => x.repo === repoName && x.name === memberName);
  if (!m) return viewHome();
  const files = (REPOS.get(repoName).files || [])
    .filter(f => f[0].startsWith(m.prefix))
    .sort((a, b) => a[0].localeCompare(b[0]));
  const shown = files.slice(0, 400);
  content().innerHTML = `
    <div class="crumb"><a href="#/">dashboard</a> / <a href="#/">${esc(repoName)}</a> / ${esc(m.name)}</div>
    ${m.knowledge ? `<div class="section-title">Knowledge — extracted content &amp; results</div>${kcard(m.knowledge)}` : ""}
    <div class="section-title">README</div>
    <div class="readme">${m.readme ? md(m.readme) : `<p class="notice">No README in <code>${esc(m.prefix || "(repo root)")}</code>.</p>`}</div>
    <div class="filelist">
      <h3>${m.files} files · ${fmtBytes(m.bytes)}${files.length > shown.length ? ` · showing first ${shown.length}` : ""}</h3>
      ${shown.map(f => `<a href="#/f/${encodeURIComponent(repoName)}/${f[0].split("/").map(encodeURIComponent).join("/")}">${fileIcon(f[0])} ${esc(f[0].slice(m.prefix.length))}</a>`).join("")}
      ${files.length > shown.length ? `<p class="notice">+ ${(files.length - shown.length).toLocaleString()} more — use search above.</p>` : ""}
    </div>`;
}

async function viewFile(repoName, path) {
  const r = REPOS.get(repoName);
  if (!r) return viewHome();
  const entry = (r.files || []).find(f => f[0] === path);
  const size = entry ? entry[1] : 0;
  const url = RAW(repoName, r.default_branch, path);
  const e = extOf(path);
  const isImg = ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"].includes(e);

  content().innerHTML = `
    <div class="filebar">
      <span class="path"><span class="repo">${esc(repoName)}</span>/${esc(path)} · ${fmtBytes(size)}</span>
      <span><a href="${esc(url)}" target="_blank" rel="noopener">raw</a> ·
        <a href="${esc(r.url)}/blob/${esc(r.default_branch)}/${path.split("/").map(encodeURIComponent).join("/")}" target="_blank" rel="noopener">GitHub</a></span>
    </div>
    <div class="preview" id="preview"><p class="notice">loading…</p></div>`;

  const box = document.getElementById("preview");
  try {
    if (size > 3_000_000) {
      box.innerHTML = `<p class="notice">File is ${fmtBytes(size)} — open it directly: <a href="${esc(url)}" target="_blank" rel="noopener">raw</a> or <a href="${esc(r.url)}/blob/${esc(r.default_branch)}/${path}" target="_blank" rel="noopener">on GitHub</a>.</p>`;
      return;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    if (isImg) {
      box.innerHTML = `<img src="${esc(url)}" alt="${esc(path)}">`;
      return;
    }
    const text = await res.text();
    if (["md", "mdx", "markdown"].includes(e)) {
      box.innerHTML = `<div class="readme">${md(text)}</div>`;
    } else if (e === "html" || e === "htm") {
      box.innerHTML = `<pre>${esc(text)}</pre>`;
    } else {
      box.innerHTML = `<pre>${esc(text)}</pre>`;
    }
  } catch (err) {
    box.innerHTML = `<p class="error">Could not load file (${esc(err.message)}). <a href="${esc(url)}" target="_blank" rel="noopener">Try raw link</a>.</p>`;
  }
}

/* ---------- knowledge rendering ---------- */

function clamp(text, n) {
  text = String(text || "");
  return text.length > n ? text.slice(0, n) + "…" : text;
}

function safeUrl(u) {
  try {
    const x = new URL(u, "https://muxd22-alt.github.io/");
    return /^https?:$/.test(x.protocol) ? x.href : null;
  } catch (e) { return null; }
}

function linkOrText(label, url) {
  const u = url ? safeUrl(url) : null;
  return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(label)}</a>` : esc(label);
}

function summaryBox(text, meta) {
  return `<div class="k-summary"><div class="k-summary-title">Executive Summary</div>
    <div class="k-summary-text">${esc(clamp(text, 1200))}</div>
    ${meta ? `<div class="k-meta">${esc(meta)}</div>` : ""}</div>`;
}

function storyCard(s) {
  const title = s.title || s.name || "(untitled)";
  const url = s.link || s.url;
  const chips = [s.source, s.date, s.time, s.bias && s.bias !== "Low" ? "bias: " + s.bias : ""]
    .filter(Boolean).map(c => `<span class="chip">${esc(c)}</span>`).join("");
  return `<div class="k-item">
    <div class="k-item-title">${linkOrText(title, url)}</div>
    ${s.description ? `<div class="k-item-desc">${esc(clamp(s.description, 420))}</div>` : ""}
    ${chips ? `<div class="k-chips">${chips}</div>` : ""}
  </div>`;
}

function gapCard(g) {
  const topic = g.gap_topic || g.topic || g.title || "Knowledge gap";
  const reason = g.gap_reason || g.reason || g.description || "";
  const research = g.research_topics || g.research || "";
  let urls = "";
  if (Array.isArray(g.found_urls)) {
    urls = g.found_urls.map(u => (u && typeof u === "object" ? u.url : u)).filter(Boolean).join(" · ");
  } else if (g.found_urls && String(g.found_urls).trim()) {
    urls = String(g.found_urls).trim();
  }
  return `<div class="k-gap">
    <div class="k-item-title">${esc(topic)}</div>
    ${reason ? `<div class="k-item-desc">${esc(clamp(reason, 380))}</div>` : ""}
    ${research ? `<div class="k-chips">${(Array.isArray(research) ? research.slice(0, 5) : [research]).map(t => `<span class="chip">${esc(clamp(String(t), 90))}</span>`).join("")}</div>` : ""}
    ${urls ? `<div class="k-meta">urls: ${esc(clamp(urls, 160))}</div>` : ""}
  </div>`;
}

function timelineRow(e) {
  const date = e.dateDisplay || e.date || "";
  const srcs = Array.isArray(e.sources) ? e.sources.join(", ") : (e.source || "");
  return `<div class="k-time"><span class="k-time-date">${esc(date)}</span>
    <span>${linkOrText(e.title || "(event)", e.link)}</span>
    ${srcs ? `<span class="k-meta"> · ${esc(srcs)}</span>` : ""}</div>`;
}

function tableBlock(arr, maxRows = 8) {
  if (!arr.length) return "";
  const cols = [...new Set(arr.slice(0, 8).flatMap(o => (o && typeof o === "object" ? Object.keys(o) : ["value"])))].slice(0, 9);
  const rows = arr.slice(0, maxRows).map(o => {
    const cells = cols.map(c => {
      let v = o && typeof o === "object" ? o[c] : o;
      if (v && typeof v === "object") v = JSON.stringify(v);
      return `<td>${esc(clamp(v == null ? "" : String(v), 140))}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<div class="k-tablewrap"><table class="k-table">
    <thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead>
    <tbody>${rows}</tbody></table>
    ${arr.length > maxRows ? `<div class="k-meta">+ ${arr.length - maxRows} more rows</div>` : ""}</div>`;
}

function itemCard(o) {
  if (o && typeof o === "object") {
    const title = o.title || o.name || o.topic || o.gap_topic || o.url || o.link || "(item)";
    const url = o.link || o.url;
    const desc = o.description || o.summary || o.reason || o.gap_reason || o.excerpt || o.body || "";
    const chips = [o.source, o.time, o.date, o.pubDate, o.type].filter(Boolean)
      .map(c => `<span class="chip">${esc(String(c))}</span>`).join("");
    return `<div class="k-item">
      <div class="k-item-title">${linkOrText(String(title).slice(0, 160), url)}</div>
      ${desc ? `<div class="k-item-desc">${esc(clamp(String(desc), 380))}</div>` : ""}
      ${chips ? `<div class="k-chips">${chips}</div>` : ""}
    </div>`;
  }
  return `<div class="k-item"><div class="k-item-title">${esc(String(o))}</div></div>`;
}

function renderFeed(text) {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  const channel = doc.querySelector("channel");
  const chTitle = channel ? channel.querySelector("title")?.textContent : "";
  const items = [...doc.querySelectorAll("item")].slice(0, 15);
  const body = items.map(it => {
    const title = it.querySelector("title")?.textContent || "(untitled)";
    const link = it.querySelector("link")?.textContent;
    const desc = it.querySelector("description")?.textContent || "";
    const date = it.querySelector("pubDate")?.textContent || "";
    const cats = [...it.querySelectorAll("category")].map(c => c.textContent).slice(0, 8)
      .map(c => `<span class="chip">${esc(c)}</span>`).join("");
    return `<div class="k-item">
      <div class="k-item-title">${linkOrText(title, link)}</div>
      <div class="k-item-desc">${esc(clamp(desc, 420))}</div>
      <div class="k-chips">${cats}${date ? `<span class="chip">${esc(date)}</span>` : ""}</div>
    </div>`;
  }).join("");
  const err = items.filter(i => (i.querySelector("description")?.textContent || "").startsWith("Failed"))
    .length;
  return `${chTitle ? `<div class="k-meta">${esc(chTitle)}</div>` : ""}${body}
    ${err ? `<div class="k-meta">${err} item(s) with generation errors upstream</div>` : ""}`;
}

function csvRows(text, max) {
  max = max || 400;
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length && rows.length < max; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function renderCsv(text) {
  const rows = csvRows(text);
  if (!rows.length) return `<p class="k-meta">empty table</p>`;
  const head = rows[0];
  const body = rows.slice(1, 31).map(r => `<tr>${r.map(c => `<td>${esc(clamp(c, 120))}</td>`).join("")}</tr>`).join("");
  const totalLines = text.split("\n").length - 1;
  return `<div class="k-tablewrap"><table class="k-table">
    <thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${body}</tbody></table>
    <div class="k-meta">showing ${Math.min(30, rows.length - 1)} of ~${totalLines} rows</div></div>`;
}

function renderJson(name, text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) {
    return `<pre class="k-pre">${esc(clamp(text, 4000))}</pre>`;
  }
  let out = "";
  const arrOf = (v) => Array.isArray(v) && v.length && typeof v[0] === "object";

  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    if (typeof obj.masterDigest === "string") out += summaryBox(obj.masterDigest, obj.lastGenerated || "");
    if (typeof obj.summary === "string" && obj.summary.length > 40) out += summaryBox(obj.summary, obj.generated || "");
    if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
      out += `<div class="k-meta">${obj.features.length} geo features</div>` +
             tableBlock(obj.features.map(f => f.properties || {}), 8);
    }
    if (arrOf(obj.stories)) out += obj.stories.slice(0, 12).map(storyCard).join("") +
      (obj.stories.length > 12 ? `<div class="k-meta">+ ${obj.stories.length - 12} more stories (of ${obj.stories.length})</div>` : "");
    if (arrOf(obj.events)) out += obj.events.slice(0, 12).map(timelineRow).join("");
    if (arrOf(obj.data)) out += tableBlock(obj.data, 8);
    if (arrOf(obj.articles)) out += obj.articles.slice(0, 12).map(storyCard).join("");
    if (arrOf(obj.links)) out += obj.links.slice(0, 12).map(itemCard).join("");
    if (arrOf(obj.items)) out += obj.items.slice(0, 12).map(itemCard).join("");
    if (arrOf(obj.gaps)) out += obj.gaps.slice(0, 8).map(gapCard).join("");
    if (arrOf(obj.scout_results)) out += obj.scout_results.slice(0, 8).map(gapCard).join("");
    if (arrOf(obj.results)) out += tableBlock(obj.results, 8);
    if (arrOf(obj.cases)) out += tableBlock(obj.cases, 8);
    if (arrOf(obj.checklist)) out += tableBlock(obj.checklist, 8);
    if (!out) {
      const scalars = Object.entries(obj).filter(([, v]) => v == null || typeof v !== "object");
      const arrays = Object.entries(obj).filter(([, v]) => Array.isArray(v) && v.length && typeof v[0] === "object");
      if (scalars.length) {
        out += `<table class="k-table kv"><tbody>${scalars.map(([k, v]) =>
          `<tr><th>${esc(k)}</th><td>${esc(clamp(String(v), 200))}</td></tr>`).join("")}</tbody></table>`;
      }
      for (const [, v] of arrays.slice(0, 2)) out += tableBlock(v, 6);
      if (!scalars.length && !arrays.length) out += `<pre class="k-pre">${esc(clamp(JSON.stringify(obj, null, 2), 4000))}</pre>`;
    }
    return out;
  }
  if (Array.isArray(obj)) {
    return arrOf(obj) ? tableBlock(obj, 8) :
      obj.slice(0, 20).map(itemCard).join("");
  }
  return `<p>${esc(String(obj))}</p>`;
}

function renderKFile(name, text) {
  const n = name.toLowerCase();
  try {
    if (n.endsWith(".xml")) return renderFeed(text);
    if (n.endsWith(".json") || n.endsWith(".geojson")) return renderJson(name, text);
    if (n.endsWith(".md")) return `<div class="readme k-md">${md(text.slice(0, 60000))}</div>`;
    if (n.endsWith(".csv")) return renderCsv(text);
  } catch (e) {
    return `<pre class="k-pre">${esc(clamp(text, 3000))}</pre>`;
  }
  return `<pre class="k-pre">${esc(clamp(text, 3000))}</pre>`;
}

function kcard(k) {
  const files = Object.entries(k.files).map(([n, t]) =>
    `<div class="kfile"><div class="kfname">${esc(n)}</div>${renderKFile(n, t)}</div>`).join("");
  return `<div class="kcard">
    <div class="khead">
      <a href="#/m/${encodeURIComponent(k.repo)}/${encodeURIComponent(k.member)}">${esc(k.member)}</a>
      <span class="repo-tag">${esc(k.repo)}</span>
      <span class="k-count">${Object.keys(k.files).length} data file(s)</span>
    </div>
    <div class="kbody">${files}</div>
  </div>`;
}

function knowledgeSection() {
  if (!KNOW.length) return "";
  const order = (r) => { const i = REPO_ORDER.indexOf(r); return i < 0 ? 99 : i; };
  const repos = [...new Set(KNOW.map(k => k.repo))].sort((a, b) => order(a) - order(b));
  const groups = repos.map(r =>
    `<div class="kgroup">
       <h3>${esc(r)}</h3>
       <div class="kgrid">${KNOW.filter(k => k.repo === r).map(kcard).join("")}</div>
     </div>`).join("");
  return `<div class="section-title">Knowledge — actual results, feeds, digests &amp; reports from all repos</div>${groups}`;
}

/* ---------- dashboard building blocks ---------- */

function ktext(repo, member, rel) { return KF.get(repo + "|" + member + "|" + rel) || null; }

function kjson(repo, member, rel) {
  const t = ktext(repo, member, rel);
  if (t == null) return null;
  try { return JSON.parse(t); } catch (e) { return null; }
}

function num(v, dec) {
  const n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(/[^0-9.eE+-]/g, ""));
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: dec == null ? 2 : dec });
}

function usd(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(/[^0-9.eE+-]/g, ""));
  if (!isFinite(n)) return "—";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function badge(text, cls) { return `<span class="badge ${cls || ""}">${esc(text)}</span>`; }

function panel(title, body, cls) {
  return `<section class="panel ${cls || ""}"><div class="panel-title">${title}</div><div class="panel-body">${body || ""}</div></section>`;
}

function kpiStrip(items) {
  if (!items.length) return "";
  return `<div class="kpi-strip">${items.map(k =>
    `<div class="kpi ${k.cls || ""}"><div class="kpi-label">${esc(k.label)}</div>
      <div class="kpi-value">${k.value == null ? "—" : (k.raw ? k.value : esc(String(k.value)))}</div>
      ${k.sub ? `<div class="kpi-sub">${esc(String(k.sub))}</div>` : ""}</div>`).join("")}</div>`;
}

function barRow(label, pct, valTxt, cls) {
  const p = Math.max(0, Math.min(100, isFinite(pct) ? pct : 0));
  return `<div class="bar-row"><span class="bar-label">${esc(label)}</span>
    <span class="bar-track"><span class="bar-fill ${cls || ""}" style="width:${p.toFixed(1)}%"></span></span>
    <span class="bar-val">${valTxt == null || valTxt === "" ? "" : esc(String(valTxt))}</span></div>`;
}

function bars(rows) {
  return `<div class="bars">${rows.map(r => barRow(r[0], r[1], r[2], r[3])).join("")}</div>`;
}

function countsBars(obj) {
  const entries = Object.entries(obj || {}).filter(([, v]) => isFinite(v));
  if (!entries.length) return "";
  const max = Math.max(1, ...entries.map(e => e[1]));
  return bars(entries.sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, (v / max) * 100, num(v, 0)]));
}

function checklistStats(text) {
  const done = (text.match(/\[x\]/gi) || []).length;
  const todo = (text.match(/\[ \]/g) || []).length;
  const pass = (text.match(/\bPASS\b/g) || []).length;
  const fail = (text.match(/\bFAIL\b/g) || []).length;
  if (!done && !todo && !pass && !fail) return "";
  const bits = [];
  let pct = 0;
  if (done + todo) {
    bits.push(`${done}/${done + todo} checklist items`);
    pct = (done / (done + todo)) * 100;
  } else {
    bits.push(`${pass} pass · ${fail} fail`);
    pct = (pass + fail) ? (pass / (pass + fail)) * 100 : 0;
  }
  return `<div class="mini-stats"><span class="chip">${bits.join(" · ")}</span>
    <span class="bar-track slim"><span class="bar-fill ${fail ? "warn" : "good"}" style="width:${pct.toFixed(0)}%"></span></span></div>`;
}

function mdPanel(title, text) {
  if (!text) return "";
  return panel(esc(title), checklistStats(text) + `<div class="readme k-md">${md(text.slice(0, 9000))}</div>`);
}

function extCount(repo) {
  const ext = {};
  for (const [p] of repo.files) {
    const e = extOf(p);
    if (e) ext[e] = (ext[e] || 0) + 1;
  }
  return ext;
}

function extBars(repo, allow, max) {
  let entries = Object.entries(extCount(repo));
  if (allow) entries = entries.filter(([e]) => allow.includes(e));
  entries.sort((a, b) => b[1] - a[1]);
  entries = entries.slice(0, max || 8);
  const m = Math.max(1, ...entries.map(e => e[1]));
  return bars(entries.map(([e, n]) => [e, (n / m) * 100, num(n, 0)]));
}

/* ---------- the five dashboards ---------- */

function dashQuant() {
  const out = [], kpis = [];

  // market snapshot from TASI/docs/data.json
  const mk = kjson("quant-econ", "TASI", "docs/data.json");
  if (mk) {
    const markets = [["tasi", "TASI"], ["qqq", "QQQ"], ["oil", "Oil"]];
    for (const [key, label] of markets) {
      const m = mk[key];
      if (m && m.close != null) {
        const ch = m.close - (m.open || 0);
        const p = m.open ? (ch / m.open) * 100 : 0;
        kpis.push({
          label: label + " close",
          value: num(m.close, 2),
          sub: (ch >= 0 ? "▲ +" : "▼ ") + num(ch, 2) + " (" + num(p, 2) + "% vs open)",
          cls: ch >= 0 ? "up" : "down",
        });
      }
    }
    const mrows = markets.filter(([k2]) => mk[k2] && mk[k2].close != null).map(([k2, label]) => {
      const m = mk[k2];
      return `<tr><td>${label}</td><td>${num(m.open, 2)}</td><td>${num(m.high, 2)}</td><td>${num(m.low, 2)}</td><td>${num(m.close, 2)}</td><td>${num(m.volume, 0)}</td></tr>`;
    }).join("");
    if (mrows) {
      out.push(panel("Market snapshot (TASI · QQQ · Oil)", `<div class="k-tablewrap"><table class="k-table">
        <thead><tr><th>Instrument</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th></tr></thead>
        <tbody>${mrows}</tbody></table></div>
        ${mk.ai_analysis && mk.ai_analysis.summary ? `<div class="k-meta">${mk.ai_analysis.sentiment ? badge(mk.ai_analysis.sentiment, /pos/i.test(mk.ai_analysis.sentiment) ? "good" : "") + " " : ""}${esc(clamp(mk.ai_analysis.summary, 340))}</div>` : ""}
        ${mk.metadata && mk.metadata.fetched_at ? `<div class="k-meta">fetched ${esc(String(mk.metadata.fetched_at))}</div>` : ""}`));
    }
    if (mk.ai_analysis && mk.ai_analysis.sentiment) {
      kpis.push({ label: "AI sentiment", value: mk.ai_analysis.sentiment, sub: clamp(mk.ai_analysis.summary || "", 90) });
    }
  }

  // TASI model ranking
  const csv = ktext("quant-econ", "TASI-Quant-Replicator", "quant_model_results.csv") ||
               ktext("quant-econ", "TASI-Quant-Replicator-Public", "quant_model_results.csv");
  if (csv) {
    const rows = csvRows(csv, 3000);
    if (rows.length > 1) {
      const h = rows[0];
      const iT = h.indexOf("Ticker"), iN = h.indexOf("Name"), iS = h.indexOf("Total_Score"), iH = h.indexOf("Is_Top_Holding");
      const data = rows.slice(1).filter(r => iT >= 0 && r[iT]).map(r => ({
        t: r[iT], n: iN >= 0 ? r[iN] : "",
        s: iS >= 0 ? (parseFloat(r[iS]) || 0) : 0,
        top: iH >= 0 && /^(1|true|yes)$/i.test((r[iH] || "").trim()),
      })).sort((a, b) => b.s - a.s);
      if (data.length) {
        const maxS = Math.max(1, ...data.map(d => d.s));
        const avg = data.reduce((a, d) => a + d.s, 0) / data.length;
        const topN = data.filter(d => d.top).length;
        kpis.push({ label: "Equity universe", value: num(data.length, 0), sub: topN + " flagged top holdings" });
        kpis.push({ label: "Avg model score", value: num(avg, 1), sub: "PE+PB+dividend+ROE composite" });
        out.push(panel("TASI model — top ranked stocks", bars(
          data.slice(0, 10).map(d => [d.t + " · " + clamp(d.n, 32), (d.s / maxS) * 100, num(d.s, 1) + (d.top ? " ★" : "")])) +
          `<div class="k-meta">Total_Score ranking across ${data.length} tickers · ★ = flagged holding</div>`));
      }
    }
  }

  // China go/no-go engine
  const cn = kjson("quant-econ", "China", "data/summary.json");
  if (cn) {
    const call = cn.call || {};
    const rd = cn.readiness || {};
    kpis.push({
      label: "China trip call", raw: true,
      value: badge(call.verdict || "—", /BOOK/i.test(call.verdict || "") ? "good" : "warn"),
      sub: (rd.band || "") + (rd.score != null ? " · " + rd.score + "/100 readiness" : ""),
    });
    out.push(panel("China trip — go/no-go", `
      <div class="call-line">${badge(call.verdict || "—", /BOOK/i.test(call.verdict || "") ? "good" : "warn")}
        <span class="chip">confidence ${esc(call.confidence || "—")}</span>
        <span class="chip">${esc(clamp(call.driver || "", 70))}</span></div>
      ${cn.diff ? `<div class="k-meta">${esc(clamp(cn.diff, 230))}</div>` : ""}
      <div class="k-meta">${esc(clamp(call.reasoning || "", 520))}</div>
      ${barRow("Readiness " + (rd.band || ""), rd.score || 0, (rd.score != null ? rd.score : "—") + "/100")}
      ${(rd.components || []).map(c => barRow(c.label || c.key, c.score || 0, num(c.score, 0) + " · " + clamp(c.value || "", 56))).join("")}
      ${cn.tip && cn.tip.text ? `<div class="k-meta">Tip ${cn.tip.index}/${cn.tip.total}: ${esc(clamp(cn.tip.text, 190))}</div>` : ""}`));

    const ov = (cn.budgets && cn.budgets.overview) || {};
    let bb = "";
    if (ov.deployable) {
      const p = (ov.coreLanded / ov.deployable) * 100;
      bb += barRow("Core landed vs deployable", p, num(ov.coreLanded, 0) + "/" + num(ov.deployable, 0) + " SAR · " + num(p, 1) + "%", p > 90 ? "warn" : "good");
      bb += `<div class="k-meta">budget ${num(ov.totalBudget, 0)} SAR · reserve ${num(ov.contingencyReserve, 0)} SAR · ${num(ov.sarPerCny, 4)} SAR/CNY · tax ${num((ov.taxRate || 0) * 100, 0)}%</div>`;
    }
    for (const cat of ["server", "home"]) {
      const b = cn.budgets && cn.budgets[cat];
      if (!b || !b.tiers) continue;
      bb += `<div class="sub-h">${esc(cat)} bundle</div>`;
      for (const [tier, t] of Object.entries(b.tiers)) {
        bb += barRow(tier + " · landed " + num(t.landed, 0) + "/" + num(t.budget, 0) + " SAR", t.pct,
          num(t.pct, 1) + "% · " + num(t.remaining, 0) + " left", t.status === "ok" ? "" : "bad");
      }
    }
    if (bb) out.push(panel("Budget burn", bb));

    const items = (cn.checklist && cn.checklist.items) || [];
    const done = items.filter(i => i.done).length;
    const cr = cn.crossed || {};
    out.push(panel("Checklist & price targets", `
      ${items.length ? barRow(done + "/" + items.length + " checklist items", (done / items.length) * 100, "", done === items.length ? "good" : "") : ""}
      ${items.filter(i => !i.done).slice(0, 5).map(i => `<div class="k-meta">☐ ${esc(clamp(i.label, 105))} <span class="chip">${esc(i.group || "")}</span></div>`).join("")}
      ${cr.total ? barRow("Targets with prices", cr.total ? ((cr.withTargets || 0) / cr.total) * 100 : 0, (cr.withTargets || 0) + "/" + cr.total + " set · " + ((cr.crossed || []).length) + " crossed") : ""}`));

    const routes = (cn.travel && cn.travel.routes) || [];
    if (routes.length) {
      out.push(panel("Flight routes", `<div class="k-tablewrap"><table class="k-table">
        <thead><tr><th>Route</th><th>Via</th><th>Fare SAR</th><th>Note</th></tr></thead><tbody>
        ${routes.slice(0, 4).map(r => `<tr><td>${esc(r.from || "")} → ${esc(r.to || "")}</td><td>${esc(r.via || "")}</td><td>${num(r.sarLow, 0)}–${num(r.sarHigh, 0)}</td><td>${esc(clamp(r.note || "", 140))}</td></tr>`).join("")}
        </tbody></table></div>`));
    }

    const dt = cn.decisionsTail || [];
    if (dt.length) {
      out.push(panel("Decision history", dt.slice(0, 8).map(d =>
        `<div class="k-time"><span class="k-time-date">${esc(d.date || "")}</span>
          <span>${badge(d.verdict || "—", /BOOK/i.test(d.verdict || "") ? "good" : /WATCH/i.test(d.verdict || "") ? "warn" : "")}
          ${esc(clamp(d.driver || "", 70))}</span></div>`).join("")));
    }
  }

  // macro feed radar
  const fp = kjson("quant-econ", "future_proofing", "data/news.json");
  if (fp) {
    const feedTotal = (fp.feeds || []).length;
    const feedOk = (fp.feeds || []).filter(f => f.status === "ok").length;
    kpis.push({ label: "Macro feeds", value: feedOk + "/" + feedTotal, sub: "healthy RSS sources" });
    const items = fp.items || [];
    out.push(panel("Macro news radar", countsBars(fp.counts || {}) +
      `<div class="k-meta">${items.length} items · ${feedOk}/${feedTotal} feeds ok · window ${fp.max_age_days != null ? fp.max_age_days + "d" : "—"}</div>` +
      items.slice(0, 6).map(it => `<div class="k-item">
        <div class="k-item-title">${linkOrText(clamp(it.title, 118), it.link)}</div>
        <div class="k-chips"><span class="chip">${esc(it.category || "")}</span><span class="chip">${esc(it.source || "")}</span><span class="chip">${esc(String(it.published || "").slice(0, 10))}</span></div>
      </div>`).join("")));
  }

  // labour narrative lanes
  const pl = kjson("quant-econ", "post_labour_tracker", "docs/data.json");
  if (pl && pl.feeds) {
    const lanes = Object.entries(pl.feeds).filter(([, v]) => Array.isArray(v));
    if (lanes.length) {
      out.push(panel("Labour-vs-AI narrative lanes", `<div class="lane-grid">${lanes.map(([name, arr]) => `
        <div class="lane"><div class="lane-h">${esc(name)} <span class="chip">${arr.length}</span></div>
        ${arr.slice(0, 3).map(it => `<div class="k-item">
          <div class="k-item-title">${linkOrText(clamp(it.title || "", 88), it.link)}</div>
          <div class="k-meta">${esc(String(it.date || "").slice(0, 10))} · ${esc(clamp(it.source || "", 36))}</div>
        </div>`).join("") || '<div class="k-meta">no items</div>'}</div>`).join("")}</div>`));
    }
  }

  // China pipeline news by feed
  const cnn = kjson("quant-econ", "China", "data/news.json");
  if (cnn && cnn.items && cnn.items.length) {
    const byFeed = {};
    for (const it of cnn.items) {
      const k2 = it.feedLabel || it.feed || "?";
      byFeed[k2] = (byFeed[k2] || 0) + 1;
    }
    out.push(panel("China pipeline news", countsBars(byFeed) +
      cnn.items.slice(0, 5).map(it => `<div class="k-item">
        <div class="k-item-title">${linkOrText(clamp(it.title, 112), it.link)}</div>
        <div class="k-meta">${esc(it.feedLabel || it.feed || "")} · ${esc(String(it.pubDate || "").slice(0, 16))}</div>
      </div>`).join("")));
  }

  return kpiStrip(kpis) + `<div class="panels">${out.join("")}</div>`;
}

function dashNews() {
  const out = [], kpis = [];

  const g = kjson("news-dashboards", "global-news-dashboard", "news-data.json");
  if (g) {
    const arr = g.data || [];
    const srcs = [...new Set(arr.map(a => a.source).filter(Boolean))];
    kpis.push({ label: "Live headlines", value: num(g.count != null ? g.count : arr.length, 0), sub: "status " + (g.status || "—") + " · " + srcs.length + " sources" });
    out.push(panel("Live global headlines", arr.slice(0, 10).map(a =>
      `<div class="k-item"><div class="k-item-title">${linkOrText(clamp(a.title, 128), a.link)}</div>
        <div class="k-chips"><span class="chip">${esc(a.source || "?")}</span><span class="chip">${esc(clamp(String(a.time || ""), 40))}</span></div>
        ${a.description ? `<div class="k-item-desc">${esc(clamp(a.description, 210))}</div>` : ""}</div>`).join("") +
      `<div class="k-meta">feed status ${esc(String(g.status || "—"))} · ${esc(String(g.timestamp || ""))}</div>`));
    const mix = {};
    for (const a of arr) { const s = a.source || "?"; mix[s] = (mix[s] || 0) + 1; }
    if (Object.keys(mix).length > 1) out.push(panel("Source mix", countsBars(mix)));
  }

  const ir = kjson("news-dashboards", "iran-news-dashboard", "news.json");
  if (ir && ir.stories) {
    const st = ir.stories;
    kpis.push({ label: "Iran desk stories", value: num(ir.total != null ? ir.total : st.length, 0), sub: "updated " + String(ir.updated || "").slice(0, 16) });
    const regions = {}, biases = {};
    for (const s of st) {
      regions[s.region || "?"] = (regions[s.region || "?"] || 0) + 1;
      biases[s.bias || "?"] = (biases[s.bias || "?"] || 0) + 1;
    }
    out.push(panel("Coverage by region & bias", countsBars(regions) +
      `<div class="sub-h">bias</div>` + countsBars(biases)));
    out.push(panel("Latest Iran stories", st.slice(0, 7).map(s =>
      `<div class="k-item"><div class="k-item-title">${linkOrText(clamp(s.title, 126), s.link)}
          ${/^#[0-9a-fA-F]{3,8}$/.test(s.color || "") ? `<span class="dot" style="background:${s.color}"></span>` : ""}</div>
        <div class="k-chips"><span class="chip">${esc(s.region || "")}</span><span class="chip">bias ${esc(s.bias || "—")}</span><span class="chip">${esc(clamp(s.source || "", 30))}</span><span class="chip">${esc(String(s.date || "").slice(0, 16))}</span></div>
        ${s.description ? `<div class="k-item-desc">${esc(clamp(s.description, 220))}</div>` : ""}</div>`).join("")));
  }

  const tl = kjson("news-dashboards", "iran-news-dashboard", "timeline.json");
  if (tl && tl.events && tl.events.length) {
    out.push(panel("Conflict timeline", tl.events.slice(0, 8).map(e => timelineRow(e)).join("")));
  }

  const wm = kjson("news-dashboards", "iran-news-dashboard", "data/war-metrics.json");
  if (wm) {
    const kv = (obj, fmt) => Object.entries(obj || {})
      .filter(([, v]) => v != null && typeof v !== "object")
      .map(([k2, v]) => `<tr><th>${esc(k2.replace(/([A-Z])/g, " $1").toLowerCase())}</th><td>${fmt ? fmt(k2, v) : esc(clamp(String(v), 90))}</td></tr>`).join("");
    let b = "";
    if (wm.operation) b += `<table class="k-table kv"><tbody><tr><th>operation</th><td>${esc(wm.operation.name || "")} · since ${esc(wm.operation.start || "")}</td></tr></tbody></table>`;
    if (wm.cost) b += `<div class="sub-h">cost</div><table class="k-table kv"><tbody>${kv(wm.cost, (k2, v) => /Usd$/i.test(k2) ? usd(v) : num(v, 1))}</tbody></table>`;
    if (wm.casualties) b += `<div class="sub-h">casualties (reported)</div><table class="k-table kv"><tbody>${kv(wm.casualties, (k2, v) => num(v, 0))}</tbody></table>`;
    if (wm.energy) b += `<div class="sub-h">energy</div><table class="k-table kv"><tbody>${kv(wm.energy, (k2, v) => /Usd$/i.test(k2) ? "$" + num(v, 2) : esc(clamp(String(v), 70)))}</tbody></table>`;
    out.push(panel("War metrics", b + `<div class="k-meta">updated ${esc(String(wm.lastUpdated || "").slice(0, 16))}</div>`));
    if (wm.cost && wm.cost.estimatedTotalUsd != null) {
      kpis.push({ label: "Est. operation cost", value: usd(wm.cost.estimatedTotalUsd), sub: wm.cost.ongoingPerDayUsd != null ? usd(wm.cost.ongoingPerDayUsd) + "/day ongoing" : "" });
    }
  }

  const pai = kjson("news-dashboards", "PAI", "data.json");
  if (pai && typeof pai.masterDigest === "string" && pai.masterDigest.trim()) {
    out.push(panel("PAI master digest", summaryBox(pai.masterDigest, pai.lastGenerated || "")));
  }

  const scout = kjson("news-dashboards", "PAI", "scout_results.json");
  if (scout) {
    const res = scout.scout_results || [];
    kpis.push({ label: "Research gaps found", value: num(res.length || scout.total_gaps_available || 0, 0), sub: "scouted " + String(scout.scouted_at || "").slice(0, 16) });
    if (res.length) out.push(panel("Scout — detected knowledge gaps", res.slice(0, 4).map(x => gapCard(x)).join("")));
  }

  const gaps = kjson("news-dashboards", "PAI", "gaps.json");
  if (gaps && Array.isArray(gaps.gaps) && gaps.gaps.length) {
    out.push(panel("Open gaps", gaps.gaps.slice(0, 5).map(x => gapCard(x)).join("")));
  }

  const stx = kjson("news-dashboards", "ai_research_dashboard", "src/data/stocks.json");
  if (stx && Array.isArray(stx.categories)) {
    const all = [];
    for (const c of stx.categories) {
      for (const s of (c.stocks || [])) all.push(Object.assign({ cat: c.name }, s));
    }
    if (all.length) {
      kpis.push({ label: "AI stocks tracked", value: num(all.length, 0), sub: stx.categories.length + " sectors" });
      const movers = all.filter(s => isFinite(s.changePercent))
        .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)).slice(0, 8);
      if (movers.length) {
        out.push(panel("AI stock movers", bars(movers.map(s => [
          s.symbol + " · " + clamp(s.name, 22),
          Math.min(100, Math.abs(s.changePercent) * 10 + 4),
          (s.changePercent >= 0 ? "+" : "") + num(s.changePercent, 2) + "% @ " + num(s.price, 2),
          s.changePercent >= 0 ? "good" : "bad",
        ])) + `<div class="k-meta">updated ${esc(String(stx.updatedAt || "").slice(0, 16))}</div>`));
      }
      const catAvg = stx.categories.map(c => {
        const arr = (c.stocks || []).filter(s => isFinite(s.changePercent));
        const avg = arr.length ? arr.reduce((a, s) => a + s.changePercent, 0) / arr.length : 0;
        return { name: c.name, avg, n: arr.length };
      });
      out.push(panel("Sector trend", bars(catAvg.map(c => [
        c.name + " (" + c.n + ")", Math.max(2, Math.min(100, (c.avg + 5) / 10 * 100)),
        (c.avg >= 0 ? "+" : "") + num(c.avg, 2) + "% avg", c.avg >= 0 ? "good" : "bad",
      ]))));
    }
  }

  return kpiStrip(kpis) + `<div class="panels">${out.join("")}</div>`;
}

function dashAgents() {
  const out = [], kpis = [];

  // newsjack eval scoreboards
  const nj = KMEM.find(x => x.repo === "agent-tools" && x.member === "newsjack");
  const runs = [];
  if (nj) {
    for (const [rel, text] of Object.entries(nj.files)) {
      if (!rel.includes("eval/reverse-newsjack/runs/") || rel.indexOf("summary.json") < 0) continue;
      let o = null;
      try { o = JSON.parse(text); } catch (e) { continue; }
      if (o) { o.__rel = rel; runs.push(o); }
    }
  }
  runs.sort((a, b) => String(a.__rel).localeCompare(String(b.__rel)));
  if (runs.length) {
    const scored = runs.reduce((a, r) => a + ((r.counts && r.counts.total_scored_signals) || 0), 0);
    const selected = runs.reduce((a, r) => a + ((r.counts && r.counts.selected_unique_signals) || 0), 0);
    kpis.push({ label: "Newsjack eval runs", value: num(runs.length, 0), sub: num(scored, 0) + " scored · " + num(selected, 0) + " selected" });
    const qp = [], pm = [];
    for (const r of runs) {
      for (const s of (r.top_signals || [])) {
        if (isFinite(s.queue_priority)) qp.push(s.queue_priority);
        if (isFinite(s.profile_match)) pm.push(s.profile_match);
      }
    }
    const mean = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    if (qp.length) kpis.push({ label: "Avg queue priority", value: num(mean(qp), 1), sub: "selected signals · floor 40" });
    if (pm.length) kpis.push({ label: "Avg profile match", value: num(mean(pm) * 100, 1) + "%", sub: "0–100 profile fit" });
    if (qp.length || pm.length) {
      out.push(panel("Signal quality (all runs)", bars([
        ["avg queue priority", Math.min(100, mean(qp)), num(mean(qp), 1)],
        ["avg profile match", Math.min(100, mean(pm) * 100), num(mean(pm) * 100, 1) + "%"],
      ])));
    }
    for (const r of runs) {
      const c = r.counts || {};
      const seg = r.__rel.split("/");
      const ri = seg.indexOf("runs");
      const label = r.__rel.indexOf("full-pipeline") >= 0
        ? (ri >= 0 && seg[ri + 2] ? seg[ri + 2] : "run") + " · full pipeline"
        : (seg.includes("detector-runs") ? seg[seg.indexOf("detector-runs") + 1] : "run");
      const stages = (r.pipeline || []).map(p => `<span class="chip">${esc(p.stage)}: ${esc(p.status)}</span>`).join("");
      const lanes = (r.lanes && r.lanes.emitted) || {};
      const sigs = (r.top_signals || []).slice(0, 3).map(s =>
        `<div class="k-item"><div class="k-item-title">${esc(clamp(s.title || "(untitled signal)", 118))}</div>
          <div class="k-chips"><span class="chip">${esc(s.lane || "")}</span>
          <span class="chip">QP ${num(s.queue_priority, 1)}</span>
          <span class="chip">size ${num(s.story_size ? s.story_size.score : null, 0)} ${esc((s.story_size && s.story_size.band) || "")}</span>
          <span class="chip">${esc(clamp(s.query || "", 42))}</span></div></div>`).join("");
      out.push(panel("Newsjack · " + esc(label), `
        ${stages ? `<div class="k-chips">${stages}</div>` : ""}
        <div class="k-meta">${num(c.total_scored_signals, 0)} scored → ${num(c.selected_unique_signals, 0)} selected · source errors ${num(c.source_errors, 0)} · depth ${esc((r.monitor && r.monitor.depth) || "—")} · profile ${esc((r.monitor && r.monitor.profile_name) || "—")}</div>
        ${Object.keys(lanes).length ? countsBars(lanes) : ""}
        ${sigs}`, "span2"));
    }
  }

  // BLS occupations
  const jc = ktext("agent-tools", "jobs", "occupations.csv");
  if (jc) {
    const rows = csvRows(jc, 4000);
    if (rows.length > 1) {
      const h = rows[0];
      const iT = h.indexOf("title"), iC = h.indexOf("category"), iPay = h.indexOf("median_pay_annual"),
            iJobs = h.indexOf("num_jobs_2024"), iOut = h.indexOf("outlook_pct");
      const data = rows.slice(1).filter(r => iT >= 0 && r[iT]).map(r => ({
        title: r[iT],
        cat: (iC >= 0 ? r[iC] : "").replace(/-/g, " "),
        pay: iPay >= 0 ? (parseFloat(String(r[iPay]).replace(/[^0-9.\-]/g, "")) || 0) : 0,
        jobs: iJobs >= 0 ? (parseFloat(String(r[iJobs]).replace(/[^0-9.]/g, "")) || 0) : 0,
        out: iOut >= 0 ? (parseFloat(String(r[iOut]).replace(/[^0-9.\-]/g, "")) || 0) : 0,
      }));
      if (data.length) {
        const totalJobs = data.reduce((a, d) => a + d.jobs, 0);
        const pays = data.map(d => d.pay).filter(x => x > 0).sort((a, b) => a - b);
        const medianPay = pays.length ? pays[Math.floor(pays.length / 2)] : 0;
        const avgOut = data.reduce((a, d) => a + d.out, 0) / data.length;
        kpis.push({ label: "Occupations tracked", value: num(data.length, 0), sub: num(totalJobs / 1e6, 1) + "M jobs (2024)" });
        kpis.push({ label: "Median US pay", value: usd(medianPay), sub: "avg outlook " + num(avgOut, 1) + "% to 2034" });

        const grow = data.filter(d => d.jobs >= 2000).sort((a, b) => b.out - a.out).slice(0, 10);
        if (grow.length) {
          const vals = grow.map(d => d.out);
          const minV = Math.min(0, ...vals), maxV = Math.max(1, ...vals);
          out.push(panel("Fastest-growing occupations (≥2k jobs)", bars(grow.map(d =>
            [clamp(d.title, 44), ((d.out - minV) / (maxV - minV || 1)) * 94 + 6, (d.out >= 0 ? "+" : "") + num(d.out, 1) + "%", d.out >= 0 ? "good" : "bad"]))));
        }

        const rich = data.slice().sort((a, b) => b.pay - a.pay).slice(0, 8);
        out.push(panel("Top paying roles", `<div class="k-tablewrap"><table class="k-table">
          <thead><tr><th>Role</th><th>Category</th><th>Median pay</th><th>Jobs 2024</th><th>Outlook 2034</th></tr></thead>
          <tbody>${rich.map(d => `<tr><td>${esc(clamp(d.title, 58))}</td><td>${esc(clamp(d.cat, 28))}</td><td>${usd(d.pay)}</td><td>${num(d.jobs, 0)}</td><td>${d.out >= 0 ? "+" : ""}${num(d.out, 1)}%</td></tr>`).join("")}</tbody>
          </table></div>`));

        const catCount = {};
        for (const d of data) catCount[d.cat] = (catCount[d.cat] || 0) + 1;
        const topCats = {};
        Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([k2, v]) => { topCats[k2] = v; });
        out.push(panel("Occupations by category", countsBars(topCats)));
      }
    }
  }

  // CoreML / ANE benchmarks
  const ane = kjson("agent-tools", "laya-coreml", "benchmarks/results/ane-energy-summary.json");
  if (Array.isArray(ane) && ane.length) {
    const bench = [];
    let bestMs = null, bestJ = null;
    for (const e of ane) {
      const input = String(e.input || "").split("/").pop();
      for (const [backend, t] of Object.entries(e.totals || {})) {
        if (!t || !isFinite(t.mean_ms_per_decision)) continue;
        bench.push({ input, backend, ms: t.mean_ms_per_decision, j: t.system_joules_per_decision });
        if (backend === "ane") {
          if (bestMs == null || t.mean_ms_per_decision < bestMs) bestMs = t.mean_ms_per_decision;
          if (isFinite(t.system_joules_per_decision) && (bestJ == null || t.system_joules_per_decision < bestJ)) bestJ = t.system_joules_per_decision;
        }
      }
    }
    if (bench.length) {
      if (bestMs != null) kpis.push({ label: "ANE latency", value: num(bestMs, 2) + " ms", sub: "best per decision (CoreML)" });
      if (bestJ != null) kpis.push({ label: "ANE energy", value: num(bestJ, 3) + " J", sub: "best per decision (system)" });
      const maxMs = Math.max(...bench.map(b => b.ms));
      out.push(panel("CoreML — ms / decision", bars(bench.map(b =>
        [b.backend + " · " + b.input, (b.ms / maxMs) * 100, num(b.ms, 2) + " ms"]))));
      const maxJ = Math.max(1e-9, ...bench.map(b => (isFinite(b.j) ? b.j : 0)));
      out.push(panel("CoreML — joules / decision", bars(bench.map(b =>
        [b.backend + " · " + b.input, ((isFinite(b.j) ? b.j : 0) / maxJ) * 100, num(b.j, 3) + " J"]))));
    }
  }

  // OpenViking docs
  out.push(mdPanel("OpenViking — architecture", ktext("agent-tools", "OpenViking", "docs/en/concepts/01-architecture.md")));
  out.push(mdPanel("OpenViking — roadmap", ktext("agent-tools", "OpenViking", "docs/en/about/03-roadmap.md")));

  return kpiStrip(kpis) + `<div class="panels">${out.join("")}</div>`;
}

function dashMobile() {
  const out = [], kpis = [];

  const feeds = kjson("mobile-android", "termux_reader", "src/lib/demo/seed/feeds.json");
  if (Array.isArray(feeds) && feeds.length) {
    const ok = feeds.filter(f => !f.disabled && !f.error_count).length;
    const err = feeds.filter(f => f.error_count).length;
    kpis.push({ label: "Reader feeds", value: ok + "/" + feeds.length, sub: "healthy sources" });
    out.push(panel("termux_reader — feed health",
      barRow("healthy", feeds.length ? (ok / feeds.length) * 100 : 0,
        ok + " ok" + (err ? " · " + err + " erroring" : ""), err ? "warn" : "good") +
      `<div class="k-tablewrap"><table class="k-table">
        <thead><tr><th>Feed</th><th>Category</th><th>Lang</th><th>Status</th></tr></thead>
        <tbody>${feeds.map(f => `<tr><td>${esc(f.name || f.url || "?")}</td><td>${esc(f.category_name || "")}</td><td>${esc(f.lang || "")}</td>
          <td>${f.disabled ? badge("disabled", "warn") : f.error_count ? badge(f.error_count + " errors", "bad") : badge("ok", "good")}</td></tr>` +
          (f.last_error ? `<tr><td colspan="4" class="k-meta">↳ ${esc(clamp(f.last_error, 130))}</td></tr>` : "")).join("")}
        </tbody></table></div>`));
  }

  out.push(mdPanel("bc250 — SMU findings", ktext("mobile-android", "bc250-steamos-real-toolkit", "external/bc250-steamos/bc250-power/SMU-FINDINGS.md")));
  out.push(mdPanel("nct6687d — testing results", ktext("mobile-android", "bc250-steamos-real-toolkit", "external/nct6687d/TESTING_RESULTS.md")));
  out.push(mdPanel("TallDuoLauncher — merge summary", ktext("mobile-android", "TallDuoLauncher", "MERGE_SUMMARY.md")));
  out.push(mdPanel("TallDuoLauncher — architecture", ktext("mobile-android", "TallDuoLauncher", "docs/architecture.md")));
  out.push(mdPanel("termux_reader — roadmap", ktext("mobile-android", "termux_reader", "docs/roadmap.md")));

  const r = REPOS.get("mobile-android");
  if (r) {
    const bytes = r.files.reduce((a, f) => a + f[1], 0);
    kpis.push({ label: "Projects", value: num(r.members.length, 0), sub: num(r.files.length, 0) + " files · " + fmtBytes(bytes) });
    const comp = extBars(r, ["kt", "java", "xml", "gradle", "kts", "md", "json", "sh", "c", "h", "cpp", "py"], 8);
    if (comp) out.push(panel("Codebase composition", comp));
  }

  return kpiStrip(kpis) + `<div class="panels">${out.join("")}</div>`;
}

function dashGeo() {
  const out = [], kpis = [];
  const r = REPOS.get("geo-unity");

  if (r) {
    const totalBytes = r.files.reduce((a, f) => a + f[1], 0);
    const glb = r.files.filter(f => f[0].endsWith(".glb"));
    const glbBytes = glb.reduce((a, f) => a + f[1], 0);
    kpis.push({ label: "Projects", value: num(r.members.length, 0), sub: "Unity / geo codebases" });
    kpis.push({ label: "Files indexed", value: num(r.files.length, 0), sub: fmtBytes(totalBytes) });
    kpis.push({ label: "3D models", value: num(glb.length, 0), sub: fmtBytes(glbBytes) + " glTF" });

    if (glb.length) {
      const max = Math.max(...glb.map(x => x[1]));
      out.push(panel("3D asset catalog", bars(glb.slice().sort((a, b) => b[1] - a[1]).map(f => {
        const parts = f[0].split("/");
        return [parts[parts.length - 1] + " · " + parts[1], (f[1] / max) * 100, fmtBytes(f[1])];
      })) + `<div class="k-meta">binary glTF models in repos/1ooo/public/models</div>`));
    }

    const cells = r.members.map(m => {
      const files = r.files.filter(f => f[0].startsWith(m.path + "/"));
      const bytes = files.reduce((a, f) => a + f[1], 0);
      const ext = {};
      for (const [p] of files) { const e = extOf(p); if (e) ext[e] = (ext[e] || 0) + 1; }
      const top = Object.entries(ext).sort((a, b) => b[1] - a[1]).slice(0, 4)
        .map(([e, n]) => `<span class="chip">${esc(e)} ${n}</span>`).join("");
      return `<div class="card"><h3>${esc(m.name)}<span class="repo-tag">${files.length} files</span></h3>
        <p>${esc(clamp(descFrom(m.readme, ""), 150))}</p>
        <div class="meta"><span>${fmtBytes(bytes)}</span><span>${top}</span></div></div>`;
    }).join("");
    out.push(panel("Project matrix", `<div class="grid">${cells}</div>`));

    out.push(panel("Codebase composition", extBars(r, ["cs", "ts", "js", "json", "md", "html", "cpp", "h", "py", "shader", "unity"], 8)));
  }

  const mf = kjson("geo-unity", "CityBuilder", "CityBuilder/Packages/manifest.json");
  if (mf && mf.dependencies) {
    out.push(panel("CityBuilder — Unity packages", Object.keys(mf.dependencies)
      .map(d => `<span class="chip">${esc(d)} ${esc(String(mf.dependencies[d]))}</span>`).join("")));
  }

  const tp = kjson("geo-unity", "cesium-unity", "ThirdParty.json");
  if (Array.isArray(tp) && tp.length) {
    out.push(panel("cesium-unity — third-party", `<div class="k-tablewrap"><table class="k-table">
      <thead><tr><th>Library</th><th>Version</th><th>License</th></tr></thead><tbody>
      ${tp.map(x => `<tr><td>${linkOrText(x.name || "?", x.url)}</td><td>${esc(x.version || "")}</td><td>${esc((x.license || []).join(", "))}</td></tr>`).join("")}
      </tbody></table></div>`));
  }

  const laya = kjson("geo-unity", "1ooo", "data/laya-reference.json");
  if (laya) {
    out.push(panel("1ooo — Laya ML model", `
      <table class="k-table kv"><tbody>
        <tr><th>model</th><td>${esc(laya.model || "—")}</td></tr>
        <tr><th>input → output</th><td>${esc(laya.inputName || "—")} → ${esc(laya.outputName || "—")}</td></tr>
        <tr><th>opset / hidden / seed</th><td>${esc(String(laya.opset != null ? laya.opset : "—"))} / ${esc(String(laya.hidden != null ? laya.hidden : "—"))} / ${esc(String(laya.seed != null ? laya.seed : "—"))}</td></tr>
        <tr><th>tolerance / samples</th><td>${esc(String(laya.tolerance != null ? laya.tolerance : "—"))} / ${esc(num(laya.samples, 0))}</td></tr>
      </tbody></table>
      ${Array.isArray(laya.features) && laya.features.length ? `<div class="sub-h">features (${laya.features.length})</div><div class="k-chips">${laya.features.slice(0, 16).map(f => `<span class="chip">${esc(f)}</span>`).join("")}</div>` : ""}
      ${Array.isArray(laya.intents) && laya.intents.length ? `<div class="sub-h">intents</div><div class="k-chips">${laya.intents.map(f => `<span class="chip">${esc(f)}</span>`).join("")}</div>` : ""}`));
  }

  const ur = kjson("geo-unity", "unity-roadmap", "docs/data.json");
  if (ur && typeof ur.insight === "string" && ur.insight && !/^Error/i.test(ur.insight)) {
    out.push(panel("Unity roadmap — AI insight", `<div class="k-summary-text">${esc(clamp(ur.insight, 900))}</div>`));
  }

  return kpiStrip(kpis) + `<div class="panels">${out.join("")}</div>`;
}

const DASHES = [
  { repo: "quant-econ", title: "Quant & Econ Desk", sub: "Markets, model rankings and the China go/no-go engine — live from TASI, TQR, China & macro feeds", render: dashQuant },
  { repo: "news-dashboards", title: "News Intelligence", sub: "Live headlines, Iran desk, war metrics, PAI digest and AI stock movers", render: dashNews },
  { repo: "agent-tools", title: "Agent Lab", sub: "Newsjack eval scoreboards, BLS job outlook, CoreML benchmarks and OpenViking docs", render: dashAgents },
  { repo: "mobile-android", title: "Mobile & Embedded", sub: "Feed health, hardware test findings, launcher merges and codebase composition", render: dashMobile },
  { repo: "geo-unity", title: "Geo & Unity Studio", sub: "3D asset catalog, Unity packages, Cesium third-party and the Laya ML model", render: dashGeo },
];

function viewDashboard(repoName) {
  const d = DASHES.find(x => x.repo === repoName) || DASHES[0];
  const km = KMEM.filter(x => x.repo === d.repo);
  const nFiles = km.reduce((a, x) => a + Object.keys(x.files).length, 0);
  const r = REPOS.get(d.repo);
  let body;
  try { body = d.render(); } catch (e) { body = `<p class="error">Dashboard error: ${esc(e.message)}</p>`; }
  content().innerHTML = `
    <div class="dash-head">
      <div>
        <div class="dash-title">${esc(d.title)}</div>
        <div class="dash-sub">${esc(d.sub)}</div>
      </div>
      <div class="dash-side">
        <span class="chip">${r ? r.members.length : 0} projects</span>
        <span class="chip">${nFiles} data files</span>
        <span class="chip">${DATA && DATA.generated_at ? new Date(DATA.generated_at).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "not generated"}</span>
      </div>
    </div>` + body;
}

function setActiveTab() {
  const key = location.hash || "#/d/quant-econ";
  document.querySelectorAll(".tabs a").forEach(a =>
    a.classList.toggle("active", a.getAttribute("href") === key));
}

/* ---------- search ---------- */

function runSearch(q) {
  const box = document.getElementById("results");
  if (!q || q.length < 2) { box.hidden = true; box.innerHTML = ""; return; }
  const needle = q.toLowerCase();
  const hits = [];
  for (const m of MEMBERS) {
    if (m.name.toLowerCase().includes(needle) || m.title.toLowerCase().includes(needle)) {
      hits.push({ label: `${m.name} `, repo: m.repo, dir: "member", href: `#/m/${encodeURIComponent(m.repo)}/${encodeURIComponent(m.name)}` });
    }
  }
  for (const r of DATA.repos) {
    for (const [path] of r.files) {
      if (path.toLowerCase().includes(needle)) {
        hits.push({
          label: path.split("/").pop(), repo: r.repoName || r.name,
          dir: path.slice(0, path.lastIndexOf("/")),
          href: `#/f/${encodeURIComponent(r.name)}/${path.split("/").map(encodeURIComponent).join("/")}`,
        });
        if (hits.length >= 80) break;
      }
    }
    if (hits.length >= 80) break;
  }
  box.hidden = false;
  box.innerHTML = hits.length
    ? hits.slice(0, 80).map(h =>
        `<a class="hit" href="${h.href}"><span class="repo">${esc(h.repo)}</span> <span class="dir">${esc(h.dir)}</span> ${esc(h.label)}</a>`).join("")
    : `<div class="empty">no matches for “${esc(q)}”</div>`;
  box.querySelectorAll("a").forEach(a => a.addEventListener("click", () => {
    box.hidden = true;
    document.getElementById("search").value = "";
  }));
}

/* ---------- router ---------- */

function route() {
  setActiveTab();
  const raw = location.hash || "";
  if (raw === "#/") return viewHome();
  const h = raw.replace(/^#\/?/, "");
  if (!h) return viewDashboard("quant-econ");
  const parts = h.split("/").map(decodeURIComponent);
  if (parts[0] === "d" && parts[1]) return viewDashboard(parts[1]);
  if (parts[0] === "m" && parts.length >= 3) return viewMember(parts[1], parts.slice(2).join("/"));
  if (parts[0] === "f" && parts.length >= 3) return viewFile(parts[1], parts.slice(2).join("/"));
  viewHome();
}

(async function init() {
  await load();
  renderTree();
  document.getElementById("search").addEventListener("input", e => runSearch(e.target.value));
  document.getElementById("search").addEventListener("keydown", e => {
    if (e.key === "Escape") { e.target.value = ""; runSearch(""); }
  });
  window.addEventListener("hashchange", route);
  route();
  if (!DATA.generated_at) {
    content().innerHTML = `<p class="notice">data.json has not been generated yet — run the <b>Refresh dashboard data</b> workflow.</p>`;
  }
})();
