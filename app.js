let DATA = null;
let REPOS = new Map();      // name -> repo object
let MEMBERS = [];           // flattened member cards
let TREES = new Map();      // repo -> {dirs:Map, files:[{name,size}]}
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
      </h3>
      <p>${esc(m.desc)}</p>
      <div class="meta">
        <span>${m.files} files</span><span>${fmtBytes(m.bytes)}</span>
        <span>${m.stack.map(([e, n]) => `<span class="chip">${esc(e)} ${n}</span>`).join("")}</span>
      </div>
    </div>`;
  content().innerHTML = `
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
