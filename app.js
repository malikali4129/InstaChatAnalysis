const FILE_COUNT = 32;
const FILE_NAMES = Array.from({ length: FILE_COUNT }, (_, i) => `message_${i + 1}.html`);
const COLORS = ["#2563eb", "#0f8a67", "#b86b00", "#c2415d", "#6b7280"];
const STOP_WORDS = new Set([
  "the", "and", "you", "your", "for", "with", "that", "this", "hai", "hain", "tha", "thi", "kya", "nhi",
  "naw", "hn", "ha", "me", "to", "ko", "ki", "ka", "kr", "kro", "kru", "ap", "baby", "acha", "achaw",
  "g", "ho", "na", "ni", "bhi", "bht", "sent", "attachment", "message", "liked", "reacted", "your"
]);

let allMessages = [];
let analysis = null;

const els = {
  status: document.getElementById("status"),
  fileInput: document.getElementById("fileInput"),
  exportCsv: document.getElementById("exportCsv"),
  summaryGrid: document.getElementById("summaryGrid"),
  rangeLabel: document.getElementById("rangeLabel"),
  participants: document.getElementById("participants"),
  rhythm: document.getElementById("rhythm"),
  contentMix: document.getElementById("contentMix"),
  topWords: document.getElementById("topWords"),
  topEmojis: document.getElementById("topEmojis"),
  messages: document.getElementById("messages"),
  explorerCount: document.getElementById("explorerCount"),
  searchBox: document.getElementById("searchBox"),
  senderFilter: document.getElementById("senderFilter"),
  typeFilter: document.getElementById("typeFilter"),
};

document.addEventListener("DOMContentLoaded", () => {
  els.fileInput.addEventListener("change", handleFileInput);
  els.searchBox.addEventListener("input", renderExplorer);
  els.senderFilter.addEventListener("change", renderExplorer);
  els.typeFilter.addEventListener("change", renderExplorer);
  els.exportCsv.addEventListener("click", exportCsv);
});

async function loadDefaultFiles() {
  showLoadingScreen(FILE_NAMES.length);
  try {
    const allMessages = [];
    for (let i = 0; i < FILE_NAMES.length; i++) {
      const name = FILE_NAMES[i];
      updateLoadingProgress(i + 1, FILE_NAMES.length, `Fetching ${name}...`);
      const response = await fetch(name);
      if (!response.ok) throw new Error(`${name} returned ${response.status}`);
      const text = await response.text();
      await new Promise(r => setTimeout(r, 0));
      updateLoadingProgress(i + 1, FILE_NAMES.length, `Parsing ${name}...`);
      const messages = parseHtml(text, name);
      await new Promise(r => setTimeout(r, 0));
      updateLoadingProgress(i + 1, FILE_NAMES.length, `${name}: ${messages.length} messages`);
      allMessages.push(...messages);
    }
    hideLoadingScreen();
    finishProcess(allMessages);
  } catch (error) {
    hideLoadingScreen();
    els.status.textContent = "Auto-load was blocked or files were not found. Use Load HTML files and select message_1.html through message_32.html.";
  }
}

function showLoadingScreen(total) {
  const existing = document.getElementById("loadingScreen");
  if (existing) existing.remove();
  document.querySelector("main").style.display = "none";
  const loader = document.createElement("div");
  loader.id = "loadingScreen";
  loader.innerHTML = `
    <div class="loading-content">
      <div class="loading-spinner"></div>
      <div class="loading-text">Loading messages...</div>
      <div class="loading-progress"><div class="loading-progress-bar"><div class="loading-progress-fill" id="loadingProgressFill"></div></div><span id="loadingProgressText">0 / ${total}</span></div>
      <div class="loading-logs" id="loadingLogs"></div>
    </div>
  `;
  document.body.appendChild(loader);
}

function updateLoadingProgress(current, total, message) {
  const fill = document.getElementById("loadingProgressFill");
  const text = document.getElementById("loadingProgressText");
  const logs = document.getElementById("loadingLogs");
  if (fill) fill.style.width = `${(current / total) * 100}%`;
  if (text) text.textContent = `${current} / ${total}`;
  if (logs && message) {
    const entry = document.createElement("div");
    entry.className = "log-entry";
    entry.textContent = `[${current}/${total}] ${message}`;
    logs.appendChild(entry);
    logs.scrollTop = logs.scrollHeight;
  }
}

function hideLoadingScreen() {
  const loader = document.getElementById("loadingScreen");
  if (loader) loader.remove();
  document.querySelector("main").style.display = "";
}

async function handleFileInput(event) {
  const selectedFiles = [...event.target.files].filter(file => file.name.endsWith(".html"));
  if (!selectedFiles.length) return;

  showLoadingScreen(selectedFiles.length);
  try {
    const allMessages = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      updateLoadingProgress(i + 1, selectedFiles.length, `Reading ${file.name}...`);
      const text = await file.text();
      await new Promise(r => setTimeout(r, 0));
      updateLoadingProgress(i + 1, selectedFiles.length, `Parsing ${file.name}...`);
      const messages = parseHtml(text, file.name);
      await new Promise(r => setTimeout(r, 0));
      updateLoadingProgress(i + 1, selectedFiles.length, `${file.name}: ${messages.length} messages`);
      allMessages.push(...messages);
    }
    hideLoadingScreen();
    finishProcess(allMessages);
  } catch (error) {
    hideLoadingScreen();
    els.status.textContent = `Error loading files: ${error.message}`;
  }
}

function finishProcess(parsedMessages) {
  allMessages = parsedMessages
    .filter(message => message.date instanceof Date && !Number.isNaN(message.date.valueOf()))
    .sort((a, b) => a.date - b.date);

  if (!allMessages.length) {
    els.status.textContent = "No messages were parsed. Check that the selected files are Instagram message HTML exports.";
    return;
  }

  const fileCount = new Set(allMessages.map(m => m.fileName)).size;
  analysis = analyze(allMessages);
  els.status.textContent = `Parsed ${formatNumber(allMessages.length)} messages from ${fileCount} HTML files. Linked media is ignored visually and counted as references only.`;
  render();
}

function parseHtml(html, fileName) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll("div.pam._a6-g")].map((card, index) => {
    const sender = clean(card.querySelector("h2")?.textContent || "Unknown");
    const dateText = clean(card.querySelector("._a6-o")?.textContent || "");
    const body = card.querySelector("._a6-p");
    const links = [...card.querySelectorAll("a[href]")].map(a => a.href || a.getAttribute("href"));
    const media = {
      images: card.querySelectorAll("img").length,
      videos: card.querySelectorAll("video").length,
      links: links.filter(Boolean).length,
    };
    const reactions = [...card.querySelectorAll("ul._a6-q li")].map(li => clean(li.textContent));
    const text = extractMessageText(body);
    const lower = text.toLowerCase();
    const type = lower.includes("reacted ") || lower === "liked a message"
      ? "reaction"
      : lower.includes("sent an attachment") || media.images || media.videos
        ? "attachment"
        : links.length
          ? "link"
          : "text";

    return {
      id: `${fileName}-${index}`,
      fileName,
      sender,
      date: parseInstagramDate(dateText),
      dateText,
      text,
      type,
      reactions,
      media,
      wordCount: words(text).length,
      charCount: [...text].length,
      hasQuestion: text.includes("?") || /\b(kya|ku|kyun|mean)\b/i.test(text),
      hasExclamation: text.includes("!"),
      emojis: emojis(text),
    };
  });
}

function extractMessageText(body) {
  if (!body) return "";
  const clone = body.cloneNode(true);
  clone.querySelectorAll("ul._a6-q, img, video, style, script").forEach(node => node.remove());
  clone.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
  return clean(clone.textContent).replace(/\n\s+/g, "\n");
}

function analyze(messages) {
  const senders = groupBy(messages, m => m.sender);
  const first = messages[0];
  const last = messages[messages.length - 1];
  const textMessages = messages.filter(m => m.text.trim());
  const totalWords = sum(messages, m => m.wordCount);
  const days = daysBetween(first.date, last.date) + 1;
  const perSender = [...senders.entries()].map(([sender, rows], i) => ({
    sender,
    count: rows.length,
    share: rows.length / messages.length,
    words: sum(rows, m => m.wordCount),
    avgWords: average(rows.map(m => m.wordCount)),
    avgChars: average(rows.map(m => m.charCount)),
    attachments: rows.filter(m => m.type === "attachment").length,
    reactions: rows.filter(m => m.type === "reaction").length,
    questions: rows.filter(m => m.hasQuestion).length,
    color: COLORS[i % COLORS.length],
  })).sort((a, b) => b.count - a.count);

  const daily = countBy(messages, m => dateKey(m.date));
  const hourly = countBy(messages, m => String(m.date.getHours()).padStart(2, "0"));
  const weekdays = countBy(messages, m => weekdayName(m.date));
  const months = countBy(messages, m => monthKey(m.date));
  const content = {
    text: messages.filter(m => m.type === "text").length,
    attachment: messages.filter(m => m.type === "attachment").length,
    reaction: messages.filter(m => m.type === "reaction").length,
    link: messages.filter(m => m.type === "link").length,
    empty: messages.filter(m => !m.text.trim()).length,
    questions: messages.filter(m => m.hasQuestion).length,
    exclamations: messages.filter(m => m.hasExclamation).length,
    mediaRefs: sum(messages, m => m.media.images + m.media.videos),
    links: sum(messages, m => m.media.links),
    reactionRefs: sum(messages, m => m.reactions.length),
  };

  const responseTimes = [];
  const sessions = [];
  let currentSession = [messages[0]];
  let longestGap = { minutes: 0, from: null, to: null };
  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1];
    const cur = messages[i];
    const diff = (cur.date - prev.date) / 60000;
    if (diff > longestGap.minutes) longestGap = { minutes: diff, from: prev, to: cur };
    if (diff <= 30) currentSession.push(cur);
    else {
      sessions.push(currentSession);
      currentSession = [cur];
    }
    if (cur.sender !== prev.sender && diff >= 0 && diff <= 1440) {
      responseTimes.push({ sender: cur.sender, minutes: diff });
    }
  }
  sessions.push(currentSession);

  const sessionStats = sessions.map(rows => ({
    start: rows[0].date,
    end: rows[rows.length - 1].date,
    count: rows.length,
    minutes: Math.max(0, (rows[rows.length - 1].date - rows[0].date) / 60000),
  }));

  return {
    total: messages.length,
    first,
    last,
    days,
    textMessages: textMessages.length,
    totalWords,
    avgPerDay: messages.length / days,
    perSender,
    daily,
    hourly,
    weekdays,
    months,
    content,
    longestGap,
    sessions: sessionStats,
    longestSession: sessionStats.sort((a, b) => b.count - a.count)[0],
    responseBySender: [...groupBy(responseTimes, r => r.sender).entries()].map(([sender, rows]) => ({
      sender,
      median: median(rows.map(r => r.minutes)),
      avg: average(rows.map(r => r.minutes)),
    })),
    topWords: topCounts(messages.flatMap(m => words(m.text)).filter(w => !STOP_WORDS.has(w) && w.length > 1), 30),
    topEmojis: topCounts(messages.flatMap(m => m.emojis), 30),
    topDays: [...daily.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    mostActiveHour: [...hourly.entries()].sort((a, b) => b[1] - a[1])[0],
  };
}

function render() {
  renderSummary();
  renderParticipants();
  renderRhythm();
  renderContentMix();
  renderTags(els.topWords, analysis.topWords);
  renderTags(els.topEmojis, analysis.topEmojis);
  setupFilters();
  renderExplorer();
  drawCharts();
}

function renderSummary() {
  const stats = [
    ["Total messages", formatNumber(analysis.total), `${formatNumber(analysis.textMessages)} with readable text`],
    ["Date range", `${analysis.days} days`, `${shortDate(analysis.first.date)} to ${shortDate(analysis.last.date)}`],
    ["Avg per day", oneDecimal(analysis.avgPerDay), "messages/day"],
    ["Total words", formatNumber(analysis.totalWords), `${oneDecimal(analysis.totalWords / analysis.total)} words/message`],
    ["Most active hour", `${analysis.mostActiveHour?.[0] || "--"}:00`, `${formatNumber(analysis.mostActiveHour?.[1] || 0)} messages`],
    ["Top day", analysis.topDays[0]?.[0] || "--", `${formatNumber(analysis.topDays[0]?.[1] || 0)} messages`],
  ];
  els.summaryGrid.innerHTML = stats.map(([label, value, note]) => `
    <article class="stat">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value">${escapeHtml(value)}</div>
      <div class="note">${escapeHtml(note)}</div>
    </article>
  `).join("");
  els.rangeLabel.textContent = `${shortDate(analysis.first.date)} - ${shortDate(analysis.last.date)}`;
}

function renderParticipants() {
  els.participants.innerHTML = analysis.perSender.map(p => `
    <div class="person-row">
      <div class="row-top"><span>${escapeHtml(p.sender)}</span><span>${formatNumber(p.count)}</span></div>
      <div class="row-sub">${oneDecimal(p.share * 100)}% share, ${formatNumber(p.words)} words, ${oneDecimal(p.avgWords)} avg words/msg, ${formatNumber(p.questions)} questions</div>
      <div class="bar"><span style="width:${p.share * 100}%;background:${p.color}"></span></div>
    </div>
  `).join("");
}

function renderRhythm() {
  const longest = analysis.longestSession;
  const gap = analysis.longestGap;
  const responses = analysis.responseBySender
    .map(r => `${escapeHtml(r.sender)}: ${formatDuration(r.median)} median`)
    .join("<br>");
  const rows = [
    ["Conversation sessions", formatNumber(analysis.sessions.length), "A new session starts after 30 quiet minutes."],
    ["Longest session", `${formatNumber(longest.count)} messages`, `${shortDateTime(longest.start)} for ${formatDuration(longest.minutes)}`],
    ["Longest quiet gap", formatDuration(gap.minutes), `${shortDateTime(gap.from.date)} to ${shortDateTime(gap.to.date)}`],
    ["Reply time by sender", "", responses || "Not enough alternating replies."],
  ];
  els.rhythm.innerHTML = rows.map(([label, value, note]) => `
    <div class="metric-row">
      <div class="row-top"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>
      <div class="row-sub">${note}</div>
    </div>
  `).join("");
}

function renderContentMix() {
  const rows = [
    ["Text messages", analysis.content.text],
    ["Attachments", analysis.content.attachment],
    ["Reaction messages", analysis.content.reaction],
    ["Messages with links", analysis.content.link],
    ["Referenced images/videos", analysis.content.mediaRefs],
    ["Linked URLs", analysis.content.links],
    ["Quoted reaction refs", analysis.content.reactionRefs],
    ["Question-like messages", analysis.content.questions],
    ["Empty/media-only bodies", analysis.content.empty],
  ];
  const max = Math.max(...rows.map(row => row[1]), 1);
  els.contentMix.innerHTML = rows.map(([label, value], i) => `
    <div class="mix-row">
      <div class="row-top"><span>${escapeHtml(label)}</span><span>${formatNumber(value)}</span></div>
      <div class="bar"><span style="width:${(value / max) * 100}%;background:${COLORS[i % COLORS.length]}"></span></div>
    </div>
  `).join("");
}

function setupFilters() {
  const options = ["all", ...analysis.perSender.map(p => p.sender)];
  els.senderFilter.innerHTML = options.map(sender => `<option value="${escapeHtml(sender)}">${sender === "all" ? "All senders" : escapeHtml(sender)}</option>`).join("");
}

function renderExplorer() {
  const query = els.searchBox.value.trim().toLowerCase();
  const sender = els.senderFilter.value;
  const type = els.typeFilter.value;
  const rows = allMessages.filter(m => {
    if (sender !== "all" && m.sender !== sender) return false;
    if (type !== "all" && m.type !== type) return false;
    if (!query) return true;
    return `${m.sender} ${m.text} ${m.dateText} ${m.type}`.toLowerCase().includes(query);
  }).slice(-300).reverse();
  els.explorerCount.textContent = `showing ${formatNumber(rows.length)} of ${formatNumber(allMessages.length)}`;
  els.messages.innerHTML = rows.map(m => `
    <article class="message">
      <div class="message-meta">
        <strong>${escapeHtml(m.sender)}</strong>
        <span>${escapeHtml(shortDateTime(m.date))} · ${escapeHtml(m.type)} · ${escapeHtml(m.fileName)}</span>
      </div>
      <div class="message-text">${escapeHtml(m.text || "[media-only or empty message]")}</div>
    </article>
  `).join("");
}

function drawCharts() {
  drawBarChart("dailyChart", normalizeDateSeries(analysis.daily), { color: "#2563eb", maxLabels: 16 });
  drawBarChart("hourChart", Array.from({ length: 24 }, (_, h) => [String(h).padStart(2, "0"), analysis.hourly.get(String(h).padStart(2, "0")) || 0]), { color: "#0f8a67" });
  drawBarChart("weekdayChart", ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => [d, analysis.weekdays.get(d) || 0]), { color: "#b86b00" });
  drawBarChart("monthChart", [...analysis.months.entries()].sort(), { color: "#c2415d" });
}

function drawBarChart(id, data, options = {}) {
  const canvas = document.getElementById(id);
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || canvas.parentElement.clientWidth;
  const height = Number(canvas.getAttribute("height"));
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, width, height);
  const pad = { top: 12, right: 12, bottom: 34, left: 42 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const max = Math.max(...data.map(d => d[1]), 1);
  ctx.strokeStyle = "#dfe4ea";
  ctx.fillStyle = "#657184";
  ctx.font = "12px system-ui";
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + chartH - (chartH * i / 4);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillText(String(Math.round(max * i / 4)), 4, y + 4);
  }
  const gap = Math.min(5, chartW / data.length * .35);
  const barW = Math.max(2, (chartW - gap * (data.length - 1)) / data.length);
  ctx.fillStyle = options.color || "#2563eb";
  data.forEach(([label, value], i) => {
    const x = pad.left + i * (barW + gap);
    const h = chartH * (value / max);
    ctx.fillRect(x, pad.top + chartH - h, barW, h);
  });
  ctx.fillStyle = "#657184";
  const step = Math.max(1, Math.ceil(data.length / (options.maxLabels || 12)));
  data.forEach(([label], i) => {
    if (i % step !== 0 && i !== data.length - 1) return;
    const x = pad.left + i * (barW + gap);
    ctx.save();
    ctx.translate(x, height - 8);
    ctx.rotate(data.length > 12 ? -0.55 : 0);
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });
}

function exportCsv() {
  if (!allMessages.length) return;
  const header = ["date", "sender", "type", "words", "characters", "file", "text"];
  const rows = allMessages.map(m => [m.date.toISOString(), m.sender, m.type, m.wordCount, m.charCount, m.fileName, m.text]);
  const csv = [header, ...rows].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "instagram-chat-analysis.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function messageNumber(name) { return Number(name.match(/message_(\d+)/)?.[1] || 0); }
function parseInstagramDate(value) { return new Date(value.replace(/\u202f/g, " ")); }
function clean(value) { return value.replace(/\s+/g, " ").trim(); }
function words(text) { return (text.toLowerCase().match(/[a-z0-9_]+/gi) || []).map(w => w.toLowerCase()); }
function emojis(text) { return text.match(/\p{Extended_Pictographic}/gu) || []; }
function groupBy(rows, fn) { const map = new Map(); rows.forEach(row => { const key = fn(row); map.set(key, [...(map.get(key) || []), row]); }); return map; }
function countBy(rows, fn) { const map = new Map(); rows.forEach(row => { const key = fn(row); map.set(key, (map.get(key) || 0) + 1); }); return map; }
function sum(rows, fn) { return rows.reduce((total, row) => total + fn(row), 0); }
function average(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }
function median(values) { const sorted = values.slice().sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0; }
function topCounts(values, limit) { return [...countBy(values, x => x).entries()].sort((a, b) => b[1] - a[1]).slice(0, limit); }
function dateKey(date) { return date.toISOString().slice(0, 10); }
function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function weekdayName(date) { return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()]; }
function daysBetween(a, b) { return Math.floor((stripTime(b) - stripTime(a)) / 86400000); }
function stripTime(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function normalizeDateSeries(map) { return [...map.entries()].sort(); }
function formatNumber(value) { return new Intl.NumberFormat().format(Math.round(value)); }
function oneDecimal(value) { return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value); }
function shortDate(date) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date); }
function shortDateTime(date) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date); }
function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return "--";
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 1440) return `${oneDecimal(minutes / 60)} hr`;
  return `${oneDecimal(minutes / 1440)} days`;
}
function renderTags(target, rows) {
  target.innerHTML = rows.length
    ? rows.map(([label, count]) => `<span class="tag">${escapeHtml(label)}<strong>${formatNumber(count)}</strong></span>`).join("")
    : `<span class="tag">No data</span>`;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

window.addEventListener("resize", () => {
  if (analysis) drawCharts();
});
