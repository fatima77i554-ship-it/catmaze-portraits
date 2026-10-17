/* Логика сайта: вкладки, брифы, трекер по файлам из общей папки на Яндекс Диске, чек-листы. */
(() => {
  const C = window.CONFIG;
  const HEROES = window.HEROES;
  const LISTS = window.CHECKLISTS;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const safeUrl = u => (typeof u === "string" && u.startsWith("https://")) ? u : "";
  const fmtDate = s => s ? new Date(s).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "";

  function plural(n, forms) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }
  const pl = (n, forms) => `${n} ${plural(n, forms)}`;

  /* ---------- задачи ---------- */
  const TASKS = HEROES.flatMap(h => h.tasks.map(t => ({ hero: h, task: t })));
  const BUSTS = TASKS.filter(x => !x.task.search).length;

  const heroById = new Map();
  HEROES.forEach(h => { heroById.set(h.id, h); h.alias.forEach(a => heroById.set(a, h)); });

  /* Имя файла → герой и задача: alesta_N_v2.png → Алеста, задача N. */
  function parseName(name) {
    const parts = name.replace(/\.[^.]+$/, "").toLowerCase().split(/[_\-\s.]+/).filter(Boolean);
    const hero = heroById.get(parts[0]) || null;
    const task = hero && parts[1] ? hero.tasks.find(t => t.code.toLowerCase() === parts[1]) || null : null;
    return { hero, task };
  }

  /* ---------- общая папка ---------- */
  const FOLDERS = ["drafts", "wip", "done", "originals"];
  const disk = { state: C.diskPublicUrl ? "loading" : "off", files: { drafts: [], wip: [], done: [], originals: [] }, at: 0 };

  async function listFolder(key) {
    const q = new URLSearchParams({
      public_key: C.diskPublicUrl, path: "/" + C.folders[key],
      limit: "1000", preview_size: "L", preview_crop: "false", sort: "-modified"
    });
    const r = await fetch("https://cloud-api.yandex.net/v1/disk/public/resources?" + q);
    if (r.status === 404) return [];
    if (!r.ok) throw new Error("disk " + r.status);
    const j = await r.json();
    return ((j._embedded && j._embedded.items) || [])
      .filter(i => i.type === "file")
      .map(i => ({ name: i.name, preview: safeUrl(i.preview), url: safeUrl(i.file), modified: i.modified, folder: key, ...parseName(i.name) }));
  }

  async function loadDisk() {
    if (!C.diskPublicUrl) { disk.state = "off"; render(); return; }
    disk.state = "loading"; renderStatus();
    try {
      const lists = await Promise.all(FOLDERS.map(listFolder));
      FOLDERS.forEach((k, i) => { disk.files[k] = lists[i]; });
      disk.state = "ok"; disk.at = Date.now();
    } catch (e) {
      disk.state = "error";
    }
    render();
  }

  const filesFor = (folder, hero, task) => disk.files[folder].filter(f => f.hero === hero && (task === undefined || f.task === task));

  function statusOf(hero, task) {
    if (filesFor("done", hero, task).length) return "done";
    if (filesFor("wip", hero, task).length) return "review";
    if (C.now.includes(hero.id)) return "work";
    return "todo";
  }
  const STATUS = {
    todo:   { label: "Очередь",     cls: "" },
    work:   { label: "В работе",    cls: "chip--moon" },
    review: { label: "На проверке", cls: "chip--warn" },
    done:   { label: "Принято",     cls: "chip--ok" }
  };
  const chip = st => `<span class="chip ${STATUS[st].cls}">${STATUS[st].label}</span>`;

  function tally() {
    const t = { todo: 0, work: 0, review: 0, done: 0 };
    TASKS.forEach(x => { t[statusOf(x.hero, x.task)]++; });
    return t;
  }
  const heroDone = h => h.tasks.filter(t => statusOf(h, t) === "done").length;

  function diskStatusText() {
    if (disk.state === "off") return "Общая папка ещё не подключена, поэтому трекер пока показывает только план.";
    if (disk.state === "loading") return "Загружаю файлы из общей папки…";
    if (disk.state === "error") return "Не получилось открыть общую папку. Попробуй обновить страницу чуть позже.";
    return `Файлы из общей папки обновлены в ${new Date(disk.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}.`;
  }

  /* ---------- миниатюры файлов ---------- */
  const FOLDER_NAMES = { drafts: "Черновик Фатимы", wip: "Работа художницы", done: "Принято", originals: "Оригинал" };
  function thumb(f) {
    const ext = (f.name.split(".").pop() || "").toUpperCase();
    const bg = f.preview ? ` style="background-image:url('${esc(f.preview)}')"` : "";
    return `<a class="thumb" data-folder="${f.folder}" href="${esc(f.url || "#")}" target="_blank" rel="noopener" title="${esc(FOLDER_NAMES[f.folder] + ": " + f.name)}">
      <span${bg}>${f.preview ? "" : esc(ext)}</span><span>${esc(f.name)}</span></a>`;
  }

  /* ---------- открывашка ---------- */
  function renderStart() {
    const t = tally();
    $("#st-heroes").textContent = HEROES.length;
    $("#st-busts").textContent = BUSTS;
    $("#st-done").textContent = t.done;
    $("#tile-briefs").textContent = `${pl(HEROES.length, ["герой", "героя", "героев"])}, ${pl(TASKS.length, ["задача", "задачи", "задач"])}, ${pl(aiCount, ["черновик", "черновика", "черновиков"])}`;
    $("#tile-tracker").textContent = `Принято ${t.done} из ${TASKS.length}`;
    $("#tile-vibe").textContent = vibeCount() ? `Отмечено ${vibeCount()}` : "";
    const total = LISTS.reduce((s, l) => s + l.items.length, 0);
    const ticked = LISTS.reduce((s, l) => s + l.items.filter((_, i) => checks[l.id + ":" + i]).length, 0);
    $("#tile-check").textContent = `Отмечено ${ticked} из ${total}`;
    $("#tile-files").textContent = disk.state === "ok"
      ? `${pl(disk.files.drafts.length, ["черновик", "черновика", "черновиков"])}, ${pl(disk.files.wip.length, ["твой файл", "твоих файла", "твоих файлов"])}`
      : "";

    const now = C.now.map(id => heroById.get(id)).filter(Boolean);
    $("#now-box").innerHTML = now.map(h => {
      const next = h.tasks.find(x => statusOf(h, x) !== "done");
      return `<div class="dlg now-card">
        <span class="dlg-tab">Сейчас в работе</span>
        <img src="img/${h.id}.png" alt="">
        <div class="info">
          <h3>${esc(h.name)}</h3>
          <p class="muted">${next ? `Следующая задача: ${esc(next.code === "N" ? "базовый бюст" : next.label)}` : "Все задачи приняты"} · ${heroDone(h)} из ${h.tasks.length} готово</p>
          <div class="btns"><a class="btn btn--small" href="#briefs/${h.id}">Открыть бриф</a></div>
        </div>
      </div>`;
    }).join("");
  }

  /* ---------- брифы ---------- */
  let currentHero = C.now[0] || HEROES[0].id;

  function renderHeroNav() {
    $("#hero-list").innerHTML = HEROES.map(h => `<li><a href="#briefs/${h.id}" aria-current="${h.id === currentHero}">
      <img src="img/${h.id}.png" alt="" loading="lazy"><span>${esc(h.name)}</span><span class="prog">${heroDone(h)}/${h.tasks.length}</span></a></li>`).join("");
    $("#hero-select").innerHTML = HEROES.map(h => `<option value="${h.id}"${h.id === currentHero ? " selected" : ""}>${esc(h.name)} · ${heroDone(h)}/${h.tasks.length}</option>`).join("");
  }

  function renderBrief() {
    const h = heroById.get(currentHero) || HEROES[0];
    renderHeroNav();
    const chips = [
      C.now.includes(h.id) ? `<span class="chip chip--moon">Сейчас в работе</span>` : "",
      h.isNew ? `<span class="chip chip--warn">Новый дизайн</span>` : "",
      `<span class="chip">${pl(h.lines, ["реплика", "реплики", "реплик"])}</span>`
    ].join("");
    const original = disk.files.originals.find(f => f.hero === h);
    const list = (title, items) => items.length ? `<div><span class="px">${title}</span><ul class="bullets">${items.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
    const keepBlock = (h.keep.length || h.refine.length)
      ? `<div class="brief-sec two">${list("Сохраняем", h.keep)}${list(h.isNew ? "Как ищем" : "Упрощаем", h.refine)}</div>`
      : `<div class="brief-sec"><span class="px">Сохраняем</span><p class="muted">Опираемся на оригинал: цвета, силуэт и характер те же, мелкие детали и тени проще.</p></div>`;
    const palette = h.palette.length ? `<div class="brief-sec"><span class="px">Палитра, примерно</span>
      <div class="swatches">${h.palette.map(c => `<div class="sw"><i style="background:${esc(c)}"></i><small>${esc(c.slice(1))}</small></div>`).join("")}</div></div>` : "";
    const routes = h.routes.length ? `<div class="brief-sec"><span class="px">Направления поиска</span>
      <div class="routes">${h.routes.map(r => `<div class="route"><h3>${esc(r.name)}</h3><p>${esc(r.idea)}</p></div>`).join("")}</div></div>` : "";
    const heroDrafts = filesFor("drafts", h).filter(f => !f.task);
    const aboutHero = `<div class="brief-sec">
        <span class="px">О герое</span>
        <div class="hero-facts">
          <div><span class="px muted">Внешность</span><p>${esc(h.look)}</p></div>
          <div><span class="px muted">Характер</span><p>${esc(h.character)}</p></div>
        </div>
        <details class="spoiler"><summary>Роль в сюжете <span class="chip chip--warn">Спойлер</span></summary><p>${esc(h.story)}</p></details>
      </div>`;

    const tasks = h.tasks.map(t => {
      const st = statusOf(h, t);
      const files = ["drafts", "wip", "done"].flatMap(k => filesFor(k, h, t));
      const fname = `${h.id}_${t.code}.png`;
      return `<div class="task">
        <span class="task-code${t.search ? " is-search" : ""}">${t.search ? "★" : esc(t.code)}</span>
        <div class="task-body">
          <h3>${t.base ? "Базовый бюст · " : ""}${t.form ? esc(t.form) + " · " : ""}${esc(t.label)}</h3>
          <p>${esc(t.hint)}</p>
          <span class="file-name">Файл: <code>${esc(fname)}</code></span>
        </div>
        ${chip(st)}
        ${files.length ? `<div class="task-files">${files.map(thumb).join("")}</div>` : ""}
      </div>`;
    }).join("");

    $("#brief").innerHTML = `
      <div class="dlg brief-head">
        <span class="dlg-tab">Бриф</span>
        <img src="img/${h.id}.png" alt="${esc(h.name)}, портрет из оригинальной игры">
        <div class="info">
          <h2>${esc(h.name)}</h2>
          <p>${esc(h.about)}</p>
          <div class="chips">${chips}</div>
          <p class="muted">Латинское имя для файлов: <code>${esc(h.id)}</code>${original && original.url ? ` · <a href="${esc(original.url)}" target="_blank" rel="noopener">оригинал в полном размере ↗</a>` : ""}</p>
        </div>
      </div>
      ${aboutHero}${keepBlock}${palette}${routes}${aiDrafts(h)}
      ${heroDrafts.length ? `<div class="brief-sec"><span class="px">Мои черновики из общей папки</span><div class="task-files" style="margin-top:10px">${heroDrafts.map(thumb).join("")}</div></div>` : ""}
      <div class="brief-sec">
        <span class="px">Задачи · ${pl(h.tasks.length, ["задача", "задачи", "задач"])}</span>
        <div class="tasks">${tasks}</div>
        <div class="legend"><span><i style="background:var(--blue)"></i>мой черновик</span><span><i style="background:var(--warn)"></i>твой файл</span><span><i style="background:var(--ok)"></i>принято</span></div>
      </div>`;
  }

  /* ---------- нейросетевые черновики ---------- */
  const DRAFTS = window.DRAFTS || {};
  const AI_STATUS = {
    selected:  { chip: `<span class="chip chip--ok">Основа выбрана</span>`, text: b => `Основа — ${b}. Дорабатываем её, а не придумываем заново.` },
    direction: { chip: `<span class="chip chip--ok">Направление выбрано</span>`, text: b => `Знакомое направление, ближе всего к нему ${b}.` },
    working:   { chip: `<span class="chip chip--moon">Рабочая основа</span>`, text: b => b ? `Пока опираемся на ${b}. Окончательно выбираем вместе, можно предложить своё.` : "Окончательную основу выбираем вместе, можно предложить своё." },
    search:    { chip: `<span class="chip chip--warn">Новый поиск</span>`, text: () => "Старые варианты не подошли. Они здесь, чтобы было видно, чего избегать." }
  };

  /* Все арты героя одним списком: скетч, варианты, листы. src — ключ для пометок «вайб». */
  function artsOf(h) {
    const d = DRAFTS[h.id];
    if (!d) return [];
    const list = [];
    if (d.sketch) list.push(d.status === "search"
      ? { src: d.sketch, thumb: d.sketch, cap: "Новая проба образа, карандаш", label: "Новая проба", cls: "is-base" }
      : { src: d.sketch, thumb: d.sketch, cap: "Карандашный скетч состава", label: "Скетч", cls: "" });
    d.drafts.forEach(id => {
      const isBase = id === d.base, off = d.status === "search";
      list.push({ src: `img/drafts/${id}.jpg`, thumb: `img/drafts/t/${id}.jpg`, cap: id + (isBase ? " · основа" : ""),
        label: isBase ? "Основа" : off ? "Не подошёл" : "", cls: isBase ? "is-base" : off ? "is-off" : "" });
    });
    d.sheets.forEach(s => list.push({ src: s.src, thumb: s.thumb, cap: s.title, label: "", cls: "", wide: true }));
    return list.map(a => ({ ...a, hero: h }));
  }
  const ARTS = new Map();
  HEROES.forEach(h => artsOf(h).forEach(a => { if (!ARTS.has(a.src)) ARTS.set(a.src, a); }));
  const aiCount = ARTS.size;

  /* ---------- пометки «вайб» ---------- */
  let VIBE = Object.assign({}, window.VIBE || {});
  let editMode = false;
  const isVibe = src => Object.prototype.hasOwnProperty.call(VIBE, src);
  const vibeCount = () => Object.keys(VIBE).filter(k => ARTS.has(k)).length;

  async function detectEdit() {
    if (!["localhost", "127.0.0.1"].includes(location.hostname)) return;
    try {
      const r = await fetch("/__vibe", { cache: "no-store" });
      editMode = r.ok && (await r.json()).ok === true;
    } catch (e) { editMode = false; }
    document.body.classList.toggle("is-edit", editMode);
    if (editMode) render();
  }

  let saveTimer = 0, publishTimer = 0;
  function saveVibe() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const r = await fetch("/__vibe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(VIBE) });
        if (!r.ok) { toast("Не сохранилось, попробуй ещё раз"); return; }
        const j = await r.json();
        toast(`Сохранено · отмечено ${vibeCount()}. На сайт уйдёт само`);
        setPublishStatus(`Отправлю на сайт через ${j.publishIn || 20} секунд после последней пометки.`);
        clearTimeout(publishTimer);
        publishTimer = setTimeout(() => watchPublish(8), ((j.publishIn || 20) + 3) * 1000);
      } catch (e) { toast("Не сохранилось: режим правки выключен"); }
    }, 250);
  }

  /* сервер правки сам отправляет vibe.js на GitHub; узнаём, чем закончилось */
  async function watchPublish(triesLeft) {
    try {
      const p = (await (await fetch("/__vibe", { cache: "no-store" })).json()).publish || {};
      if (p.state === "done") {
        setPublishStatus("Пометки отправлены на сайт. Художница увидит их через минуту-две.");
        toast("Вайб отправлен на сайт");
        return;
      }
      if (p.state === "error") {
        setPublishStatus("Не получилось отправить на сайт: " + (p.message || "неизвестная ошибка") + ". Пометки сохранены, напиши Claude «обнови сайт».");
        toast("Не получилось отправить на сайт");
        return;
      }
    } catch (e) { /* сервер выключили — пометки всё равно в файле */ }
    if (triesLeft > 1) publishTimer = setTimeout(() => watchPublish(triesLeft - 1), 5000);
  }
  function setPublishStatus(text) {
    const el = $("#publish-status");
    if (el) { el.textContent = text; el.hidden = false; }
  }
  function toggleVibe(src) {
    if (isVibe(src)) delete VIBE[src]; else VIBE[src] = { note: "" };
    saveVibe();
  }
  let toastTimer = 0;
  function toast(text) {
    const t = $("#toast");
    t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  function artCard(a, group, showHero) {
    const v = isVibe(a.src);
    const note = v && VIBE[a.src].note ? VIBE[a.src].note : "";
    const cap = showHero ? `${a.hero.name} · ${a.cap}` : a.cap;
    return `<div class="dcard ${a.cls}${v ? " is-vibe" : ""}">
      <div class="pic-wrap">
        <a class="pic" href="${esc(a.src)}" data-zoom="${esc(group)}" data-src="${esc(a.src)}" data-cap="${esc(cap)}">
          ${a.label ? `<span class="badge">${esc(a.label)}</span>` : ""}${v ? `<span class="vibe-badge">★ Вайб</span>` : ""}
          <img src="${esc(a.thumb)}" alt="${esc(cap)}" loading="lazy"></a>
        ${editMode ? `<button class="vibe-btn" type="button" data-vibe="${esc(a.src)}" aria-pressed="${v}" aria-label="${v ? "Снять пометку «вайб»" : "Отметить вайб"}">${v ? "★" : "☆"}</button>` : ""}
      </div>
      <span class="dcap">${esc(cap)}</span>
      ${note ? `<span class="dnote">${esc(note)}</span>` : ""}
    </div>`;
  }

  function aiDrafts(h) {
    const d = DRAFTS[h.id];
    if (!d) return "";
    const st = AI_STATUS[d.status] || AI_STATUS.working;
    const group = "ai-" + h.id;
    const arts = artsOf(h);
    /* отмеченные «вайб» идут первыми, остальной порядок сохраняем */
    const order = (x, y) => (isVibe(y.src) - isVibe(x.src));
    const small = arts.filter(a => !a.wide).sort(order), wide = arts.filter(a => a.wide).sort(order);
    const marked = arts.filter(a => isVibe(a.src)).length;
    return `<div class="brief-sec">
      <span class="px">Наши черновики · нейросеть</span>
      <p class="ai-note">Это наброски нейросети, а не готовый стиль. Ориентир по образу: силуэт, костюм, характер. Манеру и мелкие детали не копируем. Звёздочкой ★ я отметила арты, где лучше всего видно нужное настроение. Нажми на картинку, чтобы открыть крупно.</p>
      <div class="ai-status">${st.chip}<p>${esc(st.text(d.base))}</p>${marked ? `<span class="chip chip--warn">★ ${marked}</span>` : ""}</div>
      ${small.length ? `<div class="drafts-grid">${small.map(a => artCard(a, group)).join("")}</div>` : ""}
      ${wide.length ? `<div class="drafts-grid is-wide">${wide.map(a => artCard(a, group)).join("")}</div>` : ""}
    </div>`;
  }

  /* ---------- вкладка «Вайб» ---------- */
  function renderVibe() {
    const marked = Object.keys(VIBE).filter(k => ARTS.has(k)).map(k => ARTS.get(k));
    const order = new Map(HEROES.map((h, i) => [h.id, i]));
    marked.sort((a, b) => order.get(a.hero.id) - order.get(b.hero.id));
    $("#vibe-edit").hidden = !editMode;
    $("#vibe-board").innerHTML = marked.length
      ? `<div class="drafts-grid is-mood">${marked.map(a => artCard(a, "vibe", true)).join("")}</div>`
      : `<div class="disk-note"><p><b>${editMode ? "Пока ничего не отмечено." : "Скоро здесь появятся арты с нужным настроением."}</b></p>
         <p>${editMode ? "Открой брифы героев и нажимай ☆ на картинках, которые лучше всего передают вайб. Отмеченные соберутся здесь." : "Я отмечу черновики, в которых лучше всего видно, к чему мы идём."}</p></div>`;
  }

  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("[data-vibe]");
    if (!b || !editMode) return;
    e.preventDefault();
    toggleVibe(b.dataset.vibe);
    render();
  });

  /* просмотр крупно: стрелки листают картинки одной группы, в режиме правки можно оставить заметку */
  const lb = $("#lightbox"), lbImg = $("#lb-img"), lbCap = $("#lb-cap"), lbNote = $("#lb-note"), lbStar = $("#lb-star"), lbNoteView = $("#lb-note-view");
  let lbList = [], lbIndex = 0;
  function lbShow(i) {
    lbIndex = (i + lbList.length) % lbList.length;
    const a = lbList[lbIndex], src = a.dataset.src;
    lbImg.src = a.getAttribute("href");
    lbImg.alt = a.dataset.cap || "";
    lbCap.textContent = `${a.dataset.cap || ""} · ${lbIndex + 1} из ${lbList.length}`;
    const v = isVibe(src), note = v ? VIBE[src].note : "";
    lbStar.hidden = !editMode;
    lbStar.textContent = v ? "★ Вайб" : "☆ Отметить вайб";
    lbStar.setAttribute("aria-pressed", String(v));
    lbNote.hidden = !(editMode && v);
    lbNote.value = note;
    lbNoteView.hidden = editMode || !note;
    lbNoteView.textContent = note ? "★ " + note : "";
  }
  document.addEventListener("click", e => {
    const a = e.target.closest && e.target.closest("a[data-zoom]");
    if (!a || !lb.showModal) return;
    e.preventDefault();
    lbList = [...document.querySelectorAll(`a[data-zoom="${CSS.escape(a.dataset.zoom)}"]`)];
    lbShow(lbList.indexOf(a));
    lb.showModal();
  });
  $("#lb-prev").addEventListener("click", () => lbShow(lbIndex - 1));
  $("#lb-next").addEventListener("click", () => lbShow(lbIndex + 1));
  $("#lb-close").addEventListener("click", () => lb.close());
  lbStar.addEventListener("click", () => { toggleVibe(lbList[lbIndex].dataset.src); lbShow(lbIndex); });
  lbNote.addEventListener("input", () => {
    const src = lbList[lbIndex].dataset.src;
    if (isVibe(src)) { VIBE[src].note = lbNote.value.slice(0, 500); saveVibe(); }
  });
  lb.addEventListener("close", () => { if (editMode) render(); });
  lb.addEventListener("click", e => { if (e.target === lb) lb.close(); });
  lb.addEventListener("keydown", e => {
    if (e.target === lbNote) return;
    if (e.key === "ArrowLeft") lbShow(lbIndex - 1);
    if (e.key === "ArrowRight") lbShow(lbIndex + 1);
  });

  /* ---------- трекер ---------- */
  let queueOpen = false;
  function renderTracker() {
    const t = tally(), n = TASKS.length;
    const w = k => (t[k] / n * 100).toFixed(2) + "%";
    $("#bar").innerHTML = `<i class="b-done" style="width:${w("done")}"></i><i class="b-review" style="width:${w("review")}"></i><i class="b-work" style="width:${w("work")}"></i>`;
    $("#counts").innerHTML = `<span>Принято <b>${t.done}</b> из <b>${n}</b></span><span>На проверке <b>${t.review}</b></span><span>В работе <b>${t.work}</b></span><span>В очереди <b>${t.todo}</b></span>`;
    $("#disk-status-tracker").textContent = diskStatusText();

    const card = x => {
      const files = ["wip", "done"].flatMap(k => filesFor(k, x.hero, x.task)).length;
      return `<a class="card" href="#briefs/${x.hero.id}"><img src="img/${x.hero.id}.png" alt="" loading="lazy">
        <span class="t"><b>${esc(x.hero.name)} · ${x.task.search ? "поиск" : esc(x.task.code)}</b><span>${esc(x.task.base ? "Базовый бюст" : x.task.label)}${files ? ` · ${pl(files, ["файл", "файла", "файлов"])}` : ""}</span></span></a>`;
    };
    const col = (st, items, extra = "") => `<div class="col col--${st}">
      <div class="col-head">${chip(st)}<b>${items.length}</b></div>
      ${items.length ? items.map(card).join("") : `<p class="col-empty">Пока пусто</p>`}${extra}</div>`;
    const by = st => TASKS.filter(x => statusOf(x.hero, x.task) === st);

    /* очередь показываем по героям, чтобы колонка не растягивалась на сотню карточек */
    const queueHeroes = HEROES.map(h => ({ h, left: h.tasks.filter(x => statusOf(h, x) === "todo").length })).filter(x => x.left);
    const shown = queueOpen ? queueHeroes : queueHeroes.slice(0, 8);
    const queue = `<div class="col col--todo">
      <div class="col-head">${chip("todo")}<b>${t.todo}</b></div>
      ${shown.map(({ h, left }) => `<a class="card" href="#briefs/${h.id}"><img src="img/${h.id}.png" alt="" loading="lazy">
        <span class="t"><b>${esc(h.name)}</b><span>${pl(left, ["задача", "задачи", "задач"])}</span></span></a>`).join("") || `<p class="col-empty">Пока пусто</p>`}
      ${queueHeroes.length > 8 ? `<button class="queue-more" type="button" id="queue-more">${queueOpen ? "Свернуть" : `Ещё ${queueHeroes.length - 8}`}</button>` : ""}
    </div>`;

    $("#board").innerHTML = queue + col("work", by("work")) + col("review", by("review")) + col("done", by("done"));
    const more = $("#queue-more");
    if (more) more.addEventListener("click", () => { queueOpen = !queueOpen; renderTracker(); });
  }

  /* ---------- чек-листы ---------- */
  const CHECK_KEY = "catmaze-portraits-checks";
  let checks = {};
  try { checks = JSON.parse(localStorage.getItem(CHECK_KEY) || "{}") || {}; } catch (e) { checks = {}; }
  const saveChecks = () => { try { localStorage.setItem(CHECK_KEY, JSON.stringify(checks)); } catch (e) { /* без сохранения */ } };

  function renderChecklist() {
    $("#checks").innerHTML = LISTS.map(l => {
      const done = l.items.filter((_, i) => checks[l.id + ":" + i]).length;
      return `<div class="dlg checklist">
        <span class="dlg-tab">${esc(l.title)}</span>
        <header><p class="muted">${esc(l.note)}</p><span class="px num">${done}/${l.items.length}</span></header>
        <ul>${l.items.map((it, i) => `<li><label><input type="checkbox" data-key="${l.id}:${i}"${checks[l.id + ":" + i] ? " checked" : ""}><span>${esc(it)}</span></label></li>`).join("")}</ul>
        ${l.reset ? `<button class="reset" type="button" data-reset="${l.id}">Снять галочки</button>` : ""}
      </div>`;
    }).join("");
  }
  $("#checks").addEventListener("change", e => {
    const key = e.target.dataset && e.target.dataset.key;
    if (!key) return;
    if (e.target.checked) checks[key] = true; else delete checks[key];
    saveChecks(); renderChecklist();
  });
  $("#checks").addEventListener("click", e => {
    const id = e.target.dataset && e.target.dataset.reset;
    if (!id) return;
    Object.keys(checks).forEach(k => { if (k.startsWith(id + ":")) delete checks[k]; });
    saveChecks(); renderChecklist();
  });

  /* ---------- файлы ---------- */
  let fileHero = "all";
  function renderFiles() {
    const el = $("#files");
    if (disk.state !== "ok") {
      el.innerHTML = `<div class="disk-note"><p><b>${disk.state === "off" ? "Общая папка скоро появится здесь." : esc(diskStatusText())}</b></p>
        <p>Пока присылай файлы в Telegram. Как только папка будет подключена, здесь появятся мои черновики, твои загрузки и оригиналы из игры.</p></div>`;
      return;
    }
    const uploadUrl = "https://disk.yandex.ru/client/disk/" + encodeURIComponent(C.diskFolderName) + "/" + encodeURIComponent(C.folders.wip);
    const sections = [
      { key: "drafts", title: C.folders.drafts, note: "Мои наброски и варианты. Смотри, но не обязательно повторять." },
      { key: "wip", title: C.folders.wip, note: "Сюда загружаешь наброски, промежуточные версии и чистовики." },
      { key: "done", title: C.folders.done, note: "Принятые работы. Сюда их переношу я." },
      { key: "originals", title: C.folders.originals, note: "Портреты из оригинальной игры в полном размере." }
    ];
    const pick = f => fileHero === "all" || (fileHero === "other" ? !f.hero : f.hero && f.hero.id === fileHero);
    el.innerHTML = `
      <div class="files-bar">
        <div class="btns">
          <a class="btn" href="${esc(uploadUrl)}" target="_blank" rel="noopener">Загрузить в «${esc(C.folders.wip)}» ↗</a>
          <a class="btn btn--ghost" href="${esc(C.diskPublicUrl)}" target="_blank" rel="noopener">Открыть общую папку ↗</a>
          <button class="btn btn--ghost" type="button" id="files-refresh">Обновить</button>
        </div>
        <label>Герой
          <select id="file-hero">
            <option value="all">Все</option>
            ${HEROES.map(h => `<option value="${h.id}"${fileHero === h.id ? " selected" : ""}>${esc(h.name)}</option>`).join("")}
            <option value="other"${fileHero === "other" ? " selected" : ""}>Без героя в имени</option>
          </select>
        </label>
      </div>
      <p class="status-line">${esc(diskStatusText())} Называй файлы так: <code>alesta_N.png</code>, <code>alesta_N_v2.png</code>. По имени сайт понимает, к какой задаче относится файл.</p>
      ${sections.map(s => {
        const items = disk.files[s.key].filter(pick);
        return `<div class="folder" style="margin-top:var(--s-4)">
          <div class="folder-head"><h3>${esc(s.title)} · <span class="num">${items.length}</span></h3><p>${esc(s.note)}</p></div>
          ${items.length ? `<div class="gallery">${items.map(f => {
            const ext = (f.name.split(".").pop() || "").toUpperCase();
            const bg = f.preview ? ` style="background-image:url('${esc(f.preview)}')"` : "";
            const tag = f.hero ? f.hero.name + (f.task ? " · " + (f.task.search ? "поиск" : f.task.code) : "") : "Без героя";
            return `<a class="gfile" href="${esc(f.url || "#")}" target="_blank" rel="noopener"><span class="pic"${bg}>${f.preview ? "" : esc(ext)}</span>
              <b title="${esc(f.name)}">${esc(f.name)}</b><span>${esc(tag)} · ${esc(fmtDate(f.modified))}</span></a>`;
          }).join("")}</div>` : `<p class="muted">Пока пусто.</p>`}
        </div>`;
      }).join("")}`;
    $("#file-hero").addEventListener("change", e => { fileHero = e.target.value; renderFiles(); });
    $("#files-refresh").addEventListener("click", loadDisk);
  }

  /* ---------- вкладки ---------- */
  const VIEWS = ["start", "project", "briefs", "vibe", "tracker", "checklist", "files", "rules"];
  let view = "start";

  function renderStatus() {
    if (view === "tracker") $("#disk-status-tracker").textContent = diskStatusText();
  }
  function render() {
    renderStart();
    if (view === "briefs") renderBrief();
    if (view === "vibe") renderVibe();
    if (view === "tracker") renderTracker();
    if (view === "checklist") renderChecklist();
    if (view === "files") renderFiles();
  }

  function route() {
    const [v, arg] = decodeURIComponent(location.hash.slice(1)).split("/");
    const next = VIEWS.includes(v) ? v : "start";
    const changed = next !== view;
    view = next;
    if (view === "briefs" && arg && heroById.has(arg)) currentHero = heroById.get(arg).id;
    document.querySelectorAll(".view").forEach(s => { s.hidden = s.dataset.view !== view; });
    document.querySelectorAll(".tabs a").forEach(a => {
      if (a.getAttribute("href") === "#" + view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    render();
    if (changed || arg) window.scrollTo(0, 0);
    if (disk.state === "ok" && Date.now() - disk.at > 60000) loadDisk();
  }

  $("#hero-select").addEventListener("change", e => { location.hash = "briefs/" + e.target.value; });
  window.addEventListener("hashchange", route);

  /* ---------- связь ---------- */
  $("#contact-label").textContent = C.contact.label;
  const handleEl = $("#contact-handle");
  handleEl.textContent = C.contact.handle;
  $("#contact-link").href = C.contact.url;
  const copyDone = $("#copy-done");
  $("#copy-btn").addEventListener("click", () => {
    const show = () => { copyDone.hidden = false; setTimeout(() => { copyDone.hidden = true; }, 2000); };
    const selectFallback = () => {
      const r = document.createRange(); r.selectNodeContents(handleEl);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    };
    try { navigator.clipboard.writeText(C.contact.handle).then(show, selectFallback); } catch (e) { selectFallback(); }
  });

  route();
  loadDisk();
  detectEdit();
  window.CatmazeApp = { reload: loadDisk };
})();
