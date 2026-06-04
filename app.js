const FILE_COUNT = 32;
const FILE_NAMES = Array.from({ length: FILE_COUNT }, (_, i) => `message_${i + 1}.html`);
const COLORS = ["#2563eb", "#0f8a67", "#b86b00", "#c2415d", "#7c3aed"];
const STOP_WORDS = new Set([
  "the", "and", "you", "your", "for", "with", "that", "this", "hai", "hain", "tha", "thi", "kya", "nhi",
  "naw", "hn", "ha", "me", "to", "ko", "ki", "ka", "kr", "kro", "kru", "ap", "baby", "acha", "achaw",
  "g", "ho", "na", "ni", "bhi", "bht", "sent", "attachment", "message", "liked", "reacted", "your"
]);

let allMessages = [];
let analysis = null;

const els = {
  statusText: document.getElementById("statusText"),
  fileInput: document.getElementById("fileInput"),
  exportCsv: document.getElementById("exportCsv"),
  pageTitle: document.getElementById("pageTitle"),
  pageSubtitle: document.getElementById("pageSubtitle"),
  // stat boxes
  statTotal: document.getElementById("statTotal"),
  statDays: document.getElementById("statDays"),
  statPerDay: document.getElementById("statPerDay"),
  statWords: document.getElementById("statWords"),
  statPeople: document.getElementById("statPeople"),
  statSessions: document.getElementById("statSessions"),
  // overview
  rangeLabel: document.getElementById("rangeLabel"),
  quickStats: document.getElementById("quickStats"),
  participantsBars: document.getElementById("participantsBars"),
  contentBars: document.getElementById("contentBars"),
  topWords: document.getElementById("topWords"),
  topEmojis: document.getElementById("topEmojis"),
  // explorer
  messages: document.getElementById("messages"),
  explorerCount: document.getElementById("explorerCount"),
  searchBox: document.getElementById("searchBox"),
  senderFilter: document.getElementById("senderFilter"),
  typeFilter: document.getElementById("typeFilter"),
  // participants
  participantsList: document.getElementById("participantsList"),
  rhythmList: document.getElementById("rhythmList"),
  // content
  contentFullList: document.getElementById("contentFullList"),
  emojiChart: document.getElementById("emojiChart"),
  wordCloud: document.getElementById("wordCloud"),
  // tooltip
  tooltip: document.getElementById("tooltip"),
  // theme
  themeToggle: document.getElementById("themeToggle"),
};

document.addEventListener("DOMContentLoaded", () => {
  // Tab navigation
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      document.getElementById(`tab-${tab}`).classList.add("active");
      els.pageTitle.textContent = btn.querySelector("span")?.textContent || tab;
      els.pageSubtitle.textContent = {
        overview: "Key insights from your chat",
        participants: "Who talks the most",
        timing: "When you're most active",
        content: "What you're sharing",
        explorer: "Browse all messages",
      }[tab] || "";
    });
  });

  els.fileInput.addEventListener("change", handleFileInput);
  els.searchBox.addEventListener("input", renderExplorer);
  els.senderFilter.addEventListener("change", renderExplorer);
  els.typeFilter.addEventListener("change", renderExplorer);
  els.exportCsv.addEventListener("click", exportCsv);

  // Dark mode
  els.themeToggle.addEventListener("change", () => {
    document.documentElement.classList.toggle("dark", els.themeToggle.checked);
  });

  // Tooltip system
  document.addEventListener("mouseover", e => {
    const el = e.target.closest("[data-tooltip]");
    if (!el) return;
    els.tooltip.textContent = el.dataset.tooltip;
    els.tooltip.classList.add("visible");
    positionTooltip(el);
  });
  document.addEventListener("mouseout", e => {
    if (e.target.closest("[data-tooltip]")) {
      els.tooltip.classList.remove("visible");
    }
  });
  document.addEventListener("mousemove", e => {
    if (els.tooltip.classList.contains("visible")) {
      positionTooltipAt(e.clientX + 14, e.clientY + 10);
    }
  });

  // View toggle
  document.querySelectorAll(".view-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".view-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // Auto-load default files
  loadDefaultFiles();
});

function positionTooltip(el) {
  const rect = el.getBoundingClientRect();
  const tRect = els.tooltip.getBoundingClientRect();
  let x = rect.right + 14;
  let y = rect.top;
  if (x + 220 > window.innerWidth) x = rect.left - 220;
  if (y + tRect.height > window.innerHeight) y = window.innerHeight - tRect.height - 10;
  positionTooltipAt(x, y);
}

function positionTooltipAt(x, y) {
  els.tooltip.style.left = `${x}px`;
  els.tooltip.style.top = `${y}px`;
}

async function loadDefaultFiles() {
  showLoadingScreen(FILE_NAMES.length);
  try {
    const allMsgs = [];
    for (let i = 0; i < FILE_NAMES.length; i++) {
      const name = FILE_NAMES[i];
      updateLoadingProgress(i + 1, FILE_NAMES.length, `Fetching ${name}...`);
      const response = await fetch(name);
      if (!response.ok) throw new Error(`${name} returned ${response.status}`);
      const text = await response.text();
      await new Promise(r => setTimeout(r, 0));
      updateLoadingProgress(i + 1, FILE_NAMES.length, `Parsing ${name}...`);
      const msgs = parseHtml(text, name);
      await new Promise(r => setTimeout(r, 0));
      updateLoadingProgress(i + 1, FILE_NAMES.length, `${name}: ${msgs.length} messages`);
      allMsgs.push(...msgs);
    }
    hideLoadingScreen();
    finishProcess(allMsgs);
  } catch (error) {
    hideLoadingScreen();
    els.statusText.textContent = "Auto-load blocked or files not found. Use Load Files and select message_1.html through message_32.html.";
  }
}

function showLoadingScreen(total) {
  const existing = document.getElementById("loadingScreen");
  if (existing) existing.remove();
  const loader = document.createElement("div");
  loader.id = "loadingScreen";
  loader.innerHTML = `
    <div class="loading-content">
      <div class="loading-title">Loading Messages...</div>
      <div class="loading-progress">
        <div class="loading-progress-bar">
          <div class="loading-progress-fill" id="loadingProgressFill"></div>
        </div>
        <span id="loadingProgressText">0 / ${total}</span>
      </div>
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
}

async function handleFileInput(event) {
  const selectedFiles = [...event.target.files].filter(file => file.name.endsWith(".html"));
  if (!selectedFiles.length) return;

  showLoadingScreen(selectedFiles.length);
  try {
    const allMsgs = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      updateLoadingProgress(i + 1, selectedFiles.length, `Reading ${file.name}...`);
      const text = await file.text();
      await new Promise(r => setTimeout(r, 0));
      updateLoadingProgress(i + 1, selectedFiles.length, `Parsing ${file.name}...`);
      const msgs = parseHtml(text, file.name);
      await new Promise(r => setTimeout(r, 0));
      updateLoadingProgress(i + 1, selectedFiles.length, `${file.name}: ${msgs.length} messages`);
      allMsgs.push(...msgs);
    }
    hideLoadingScreen();
    finishProcess(allMsgs);
  } catch (error) {
    hideLoadingScreen();
    els.statusText.textContent = `Error loading files: ${error.message}`;
  }
}

function finishProcess(parsedMessages) {
  allMessages = parsedMessages
    .filter(message => message.date instanceof Date && !Number.isNaN(message.date.valueOf()))
    .sort((a, b) => a.date - b.date);

  if (!allMessages.length) {
    els.statusText.textContent = "No messages parsed. Check that files are Instagram message HTML exports.";
    return;
  }

  const fileCount = new Set(allMessages.map(m => m.fileName)).size;
  analysis = analyze(allMessages);
  els.statusText.textContent = `Parsed ${formatNumber(allMessages.length)} messages from ${fileCount} HTML files.`;
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
    exclamations: rows.filter(m => m.hasExclamation).length,
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
  renderOverviewStats();
  renderQuickStats();
  renderParticipantsBars();
  renderContentBars();
  renderTags(els.topWords, analysis.topWords);
  renderTags(els.topEmojis, analysis.topEmojis);
  renderParticipantsFull();
  renderRhythm();
  renderContentFull();
  renderEmojiChart();
  renderWordCloud();
  setupFilters();
  renderExplorer();
  drawCharts();
}

function renderOverviewStats() {
  els.statTotal.textContent = formatNumber(analysis.total);
  els.statDays.textContent = formatNumber(analysis.days);
  els.statPerDay.textContent = oneDecimal(analysis.avgPerDay);
  els.statWords.textContent = formatNumber(analysis.totalWords);
  els.statPeople.textContent = formatNumber(analysis.perSender.length);
  els.statSessions.textContent = formatNumber(analysis.sessions.length);
  els.rangeLabel.textContent = `${shortDate(analysis.first.date)} — ${shortDate(analysis.last.date)}`;
}

function renderQuickStats() {
  const items = [
    { label: "Busiest Day", value: analysis.topDays[0]?.[0] || "—", sub: `${formatNumber(analysis.topDays[0]?.[1] || 0)} messages` },
    { label: "Peak Hour", value: analysis.mostActiveHour?.[0] ? `${analysis.mostActiveHour[0]}:00` : "—", sub: `${formatNumber(analysis.mostActiveHour?.[1] || 0)} messages` },
    { label: "Text Share", value: `${oneDecimal((analysis.content.text / analysis.total) * 100)}%`, sub: `${formatNumber(analysis.content.text)} text msgs` },
    { label: "Media Share", value: `${oneDecimal((analysis.content.attachment / analysis.total) * 100)}%`, sub: `${formatNumber(analysis.content.attachment)} attachments` },
  ];
  els.quickStats.innerHTML = items.map(item => `
    <div class="quick-stat-item">
      <div class="quick-stat-row">
        <span class="quick-stat-label">${escapeHtml(item.label)}</span>
        <span class="quick-stat-value">${escapeHtml(item.value)}</span>
      </div>
      <div class="quick-stat-sub">${escapeHtml(item.sub)}</div>
    </div>
  `).join("");
}

function renderParticipantsBars() {
  const top = analysis.perSender.slice(0, 6);
  els.participantsBars.innerHTML = top.map(p => `
    <div class="participant-bar">
      <div class="bar-label-row">
        <span class="bar-label">${escapeHtml(p.sender)}</span>
        <span class="bar-count">${formatNumber(p.count)}</span>
      </div>
      <div class="bar-track"><span style="width:${p.share * 100}%;background:${p.color}"></span></div>
    </div>
  `).join("");
}

function renderContentBars() {
  const items = [
    { label: "Text", count: analysis.content.text, color: "#2563eb" },
    { label: "Photos/Videos", count: analysis.content.attachment, color: "#0f8a67" },
    { label: "Reactions", count: analysis.content.reaction, color: "#b86b00" },
    { label: "Links", count: analysis.content.link, color: "#c2415d" },
  ];
  const max = Math.max(...items.map(i => i.count), 1);
  els.contentBars.innerHTML = items.map(item => `
    <div class="content-bar">
      <div class="bar-label-row">
        <span class="bar-label">${escapeHtml(item.label)}</span>
        <span class="bar-count">${formatNumber(item.count)}</span>
      </div>
      <div class="bar-track"><span style="width:${(item.count / max) * 100}%;background:${item.color}"></span></div>
    </div>
  `).join("");
}

function renderParticipantsFull() {
  els.participantsList.innerHTML = analysis.perSender.map((p, i) => {
    const bg = p.color;
    const initial = p.sender.charAt(0).toUpperCase();
    return `
      <div class="participant-row">
        <div class="participant-avatar" style="background:${bg}">${escapeHtml(initial)}</div>
        <div class="participant-info">
          <div class="participant-name">${escapeHtml(p.sender)}</div>
          <div class="participant-sub">${oneDecimal(p.share * 100)}% of messages · ${formatNumber(p.words)} words total · ${oneDecimal(p.avgWords)} avg words/msg</div>
        </div>
        <div class="participant-stats">
          <div class="pstat"><div class="pstat-val">${formatNumber(p.count)}</div><div class="pstat-lbl">Messages</div></div>
          <div class="pstat"><div class="pstat-val">${formatNumber(p.questions)}</div><div class="pstat-lbl">Questions</div></div>
          <div class="pstat"><div class="pstat-val">${formatNumber(p.exclamations)}</div><div class="pstat-lbl">Exclams</div></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderRhythm() {
  const longest = analysis.longestSession;
  const gap = analysis.longestGap;
  const items = [
    { label: "Sessions", value: formatNumber(analysis.sessions.length), sub: "30+ min gaps define sessions" },
    { label: "Longest Session", value: formatNumber(longest.count), sub: `${shortDateTime(longest.start)} · ${formatDuration(longest.minutes)}` },
    { label: "Longest Gap", value: formatDuration(gap.minutes), sub: `${shortDateTime(gap.from.date)} → ${shortDateTime(gap.to.date)}` },
  ];
  els.rhythmList.innerHTML = items.map(item => `
    <div class="rhythm-item">
      <div class="rhythm-label">${escapeHtml(item.label)}</div>
      <div class="rhythm-value">${escapeHtml(item.value)}</div>
      <div class="rhythm-sub">${escapeHtml(item.sub)}</div>
    </div>
  `).join("");
}

function renderContentFull() {
  const items = [
    { label: "Text Messages", count: analysis.content.text, color: "#2563eb", bg: "#eff6ff" },
    { label: "Photos & Videos", count: analysis.content.attachment, color: "#0f8a67", bg: "#ecfdf5" },
    { label: "Reactions", count: analysis.content.reaction, color: "#b86b00", bg: "#fffbeb" },
    { label: "Links Shared", count: analysis.content.link, color: "#c2415d", bg: "#fff1f3" },
    { label: "Questions Asked", count: analysis.content.questions, color: "#7c3aed", bg: "#f5f3ff" },
    { label: "Exclamations", count: analysis.content.exclamations, color: "#0f8a67", bg: "#ecfdf5" },
  ];
  els.contentFullList.innerHTML = items.map(item => `
    <div class="content-item">
      <div class="content-item-left">
        <span class="content-badge" style="background:${item.bg};color:${item.color}">${escapeHtml(item.label)}</span>
      </div>
      <strong>${formatNumber(item.count)}</strong>
    </div>
  `).join("");
}

function renderEmojiChart() {
  els.emojiChart.innerHTML = analysis.topEmojis.slice(0, 20).map(([emoji, count]) => `
    <span class="emoji-chip">${escapeHtml(emoji)}<strong>${formatNumber(count)}</strong></span>
  `).join("");
}

function renderWordCloud() {
  const words = analysis.topWords.slice(0, 40);
  if (!words.length) {
    els.wordCloud.innerHTML = '<span class="tag">No word data</span>';
    return;
  }
  const max = words[0][1];
  els.wordCloud.innerHTML = words.map(([word, count]) => {
    const size = 12 + (count / max) * 20;
    return `<span class="tag" style="font-size:${size}px;font-weight:700">${escapeHtml(word)}</span>`;
  }).join(" ");
}

function setupFilters() {
  const options = ["all", ...analysis.perSender.map(p => p.sender)];
  els.senderFilter.innerHTML = options.map(sender => `<option value="${escapeHtml(sender)}">${sender === "all" ? "All People" : escapeHtml(sender)}</option>`).join("");
}

function renderExplorer() {
  const query = els.searchBox.value.trim().toLowerCase();
  const sender = els.senderFilter.value;
  const type = els.typeFilter.value;
  const compact = document.querySelector(".view-btn.active")?.dataset.view === "compact";
  const rows = allMessages.filter(m => {
    if (sender !== "all" && m.sender !== sender) return false;
    if (type !== "all" && m.type !== type) return false;
    if (!query) return true;
    return `${m.sender} ${m.text} ${m.dateText} ${m.type}`.toLowerCase().includes(query);
  }).slice(-300).reverse();
  els.explorerCount.textContent = `${formatNumber(rows.length)} messages`;

  // Determine who is "mine" (the person with most messages, likely the viewer)
  const senderCounts = {};
  allMessages.forEach(m => { senderCounts[m.sender] = (senderCounts[m.sender] || 0) + 1; });
  const mineSender = Object.entries(senderCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";

  els.messages.className = `messages chat-bubbles${compact ? " compact" : ""}`;
  els.messages.innerHTML = rows.map(m => {
    const isMine = m.sender === mineSender;
    const color = analysis.perSender.find(p => p.sender === m.sender)?.color || "#2563eb";
    const initial = m.sender.charAt(0).toUpperCase();
    return `
      <div class="bubble-row${isMine ? " mine" : ""}">
        <div class="bubble-avatar" style="background:${color}">${escapeHtml(initial)}</div>
        <div class="bubble-wrap">
          ${!compact && !isMine ? `<div class="bubble-sender">${escapeHtml(m.sender)}</div>` : ""}
          <div class="bubble">${escapeHtml(m.text || (m.type === "attachment" ? "[Photo/Video]" : m.type === "reaction" ? "[Reaction]" : m.type === "link" ? "[Link]" : ""))}</div>
          <div class="bubble-meta">
            <span class="bubble-time">${escapeHtml(shortDateTime(m.date))}</span>
            <span class="bubble-type">${escapeHtml(m.type)}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function drawCharts() {
  drawBarChart("dailyChart", normalizeDateSeries(analysis.daily), { color: "#2563eb", maxLabels: 16 });
  drawBarChart("hourChart", Array.from({ length: 24 }, (_, h) => [String(h).padStart(2, "0"), analysis.hourly.get(String(h).padStart(2, "0")) || 0]), { color: "#0f8a67" });
  drawBarChart("weekdayChart", ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => [d, analysis.weekdays.get(d) || 0]), { color: "#b86b00" });
  drawBarChart("monthChart", [...analysis.months.entries()].sort(), { color: "#c2415d" });
}

function drawBarChart(id, data, options = {}) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
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
  ctx.strokeStyle = "#e2e8f0";
  ctx.fillStyle = "#64748b";
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
  data.forEach(([, value], i) => {
    const x = pad.left + i * (barW + gap);
    const h = chartH * (value / max);
    ctx.fillRect(x, pad.top + chartH - h, barW, h);
  });
  ctx.fillStyle = "#64748b";
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
