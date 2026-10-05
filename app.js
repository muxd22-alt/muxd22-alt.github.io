const LANG_COLORS = {
  Python: "#3572A5", JavaScript: "#f1e05a", TypeScript: "#3178c6",
  HTML: "#e34c26", CSS: "#563d7c", Kotlin: "#A97BFF", "C#": "#178600",
  Go: "#00ADD8", Rust: "#dea584", Shell: "#89e051", Java: "#b07219",
  Ruby: "#701516", Swift: "#F05138", C: "#555555", "C++": "#f34b7d",
  Vue: "#41b883", PHP: "#4F5D95", HTML: "#e34c26", Lua: "#000080",
  Kotlin: "#A97BFF", Dart: "#00B4AB", Vim: "#199f4b", Nix: "#7e7eff",
  Makefile: "#427819", Dockerfile: "#384d54", Jupyter: "#DA5B0B",
  Powerbuilder: "#3089bc", Batchfile: "#C1F12E", "Jupyter Notebook": "#DA5B0B",
};

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + " GB";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + " MB";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + " KB";
  return n + " B";
}

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 2592000) return Math.floor(s / 86400) + "d ago";
  return Math.floor(s / 2592000) + "mo ago";
}

async function main() {
  let data;
  try {
    data = await (await fetch("data.json?ts=" + Date.now())).json();
  } catch (e) {
    document.body.appendChild(el("div", "error", "Failed to load data.json — refresh data workflow has not run yet."));
    return;
  }

  document.getElementById("generated").textContent = new Date(data.generated_at).toUTCString();

  const cards = document.getElementById("cards");
  const commits = document.querySelector("#commits tbody");
  const runs = document.querySelector("#runs tbody");
  const members = document.getElementById("members");
  const mgrid = el("div", "members-grid");

  for (const r of data.repos) {
    // --- card ---
    const card = el("div", "card");
    const lastRun = r.runs && r.runs[0];
    const runBadge = lastRun
      ? `<span class="status ${lastRun.conclusion === "success" ? "success" : lastRun.conclusion === "failure" ? "failure" : "neutral"}">${lastRun.conclusion || lastRun.status}</span>`
      : `<span class="status neutral">no runs</span>`;
    card.appendChild(el("h3", null, `<a href="${r.url}">${r.name}</a> ${runBadge}`));
    card.appendChild(el("p", "desc", r.description || ""));

    const totalFiles = Object.values(r.member_stats || {}).reduce((a, s) => a + s.files, 0);
    const totalBytes = Object.values(r.member_stats || {}).reduce((a, s) => a + s.bytes, 0);
    card.appendChild(el("div", "stats",
      `<span><b>${r.members.length}</b> members</span>
       <span><b>${totalFiles}</b> files</span>
       <span><b>${fmt(totalBytes)}</b></span>
       <span><b>${r.stars}</b> ★</span>
       <span>pushed ${timeAgo(r.pushed_at)}</span>`));

    // language bars
    const langs = Object.entries(r.languages || {}).sort((a, b) => b[1] - a[1]);
    const total = langs.reduce((a, [, v]) => a + v, 0) || 1;
    const bars = el("div", "bars");
    const legend = [];
    for (const [name, bytes] of langs.slice(0, 6)) {
      const s = el("span");
      s.style.width = (bytes / total * 100) + "%";
      s.style.background = LANG_COLORS[name] || "#8b949e";
      s.title = name;
      bars.appendChild(s);
      legend.push(`${name} ${(bytes / total * 100).toFixed(0)}%`);
    }
    if (langs.length) {
      card.appendChild(bars);
      card.appendChild(el("div", "legend", legend.join(" · ")));
    }
    cards.appendChild(card);

    // --- commits ---
    for (const c of (r.commits || []).slice(0, 8)) {
      const tr = el("tr");
      tr.appendChild(el("td", null, `<a href="${r.url}/commit/${c.sha}">${r.name}</a>`));
      tr.appendChild(el("td", null, new Date(c.date).toISOString().slice(0, 10)));
      tr.appendChild(el("td", null, c.author || ""));
      tr.appendChild(el("td", "msg", escapeHtml(c.msg)));
      commits.appendChild(tr);
    }

    // --- runs ---
    for (const w of (r.runs || []).slice(0, 4)) {
      const tr = el("tr");
      tr.appendChild(el("td", null, `<a href="${r.url}">${r.name}</a>`));
      tr.appendChild(el("td", null, escapeHtml(w.name || "")));
      tr.appendChild(el("td", null, w.status));
      const cls = w.conclusion === "success" ? "success" : w.conclusion === "failure" ? "failure" : "neutral";
      tr.appendChild(el("td", null, `<span class="status ${cls}">${w.conclusion || "—"}</span>`));
      runs.appendChild(tr);
    }

    // --- members index ---
    const col = el("div", "col");
    col.appendChild(el("h4", null, r.name));
    const ul = el("ul");
    for (const m of r.members.sort()) {
      const s = (r.member_stats || {})[m] || { files: 0, bytes: 0 };
      const li = el("li");
      li.appendChild(el("span", null, `<a href="${r.url}/tree/main/repos/${m}" style="color:inherit">${m}</a>`));
      li.appendChild(el("span", null, `${s.files} files · ${fmt(s.bytes)}`));
      ul.appendChild(li);
    }
    col.appendChild(ul);
    mgrid.appendChild(col);
  }
  members.appendChild(mgrid);

  if (!commits.children.length) commits.appendChild(el("tr", null, `<td colspan="4">no commits yet</td>`));
  if (!runs.children.length) runs.appendChild(el("tr", null, `<td colspan="4">no workflow runs yet</td>`));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

main();
