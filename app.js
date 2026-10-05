let DATA = null;
let REPOS = new Map();      // name -> repo object
let MEMBERS = [];           // flattened member cards
let TREES = new Map();      // repo -> {dirs:Map, files:[{name,size}]}
let KNOW = [];              // knowledge sources (data files with actual content)
let KNOW_MAP = new Map();   // "repo/member" -> source
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
  return `<div class="k-gap">
    <div class="k-item-title">${esc(topic)}</div>
    ${reason ? `<div class="k-item-desc">${esc(clamp(reason, 380))}</div>` : ""}
    ${research ? `<div class="k-chips">${esc(clamp(research, 200))}</div>` : ""}
    ${g.found_urls && String(g.found_urls).trim() ? `<div class="k-meta">urls: ${esc(clamp(String(g.found_urls).trim(), 160))}</div>` : ""}
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

function csvRows(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length && rows.length < 40; i++) {
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
  const h = location.hash.replace(/^#\/?/, "");
  if (!h) return viewHome();
  const parts = h.split("/").map(decodeURIComponent);
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
