if (typeof BareMux === 'undefined') {
    BareMux = { BareMuxConnection: class { constructor() { } setTransport() { } } };
}

let scramjet;
let tabs = [];
let activeTabId = null;
let nextTabId = 1;
const DEFAULT_WISP = "wss://gointospace.app/wisp/";

document.addEventListener('DOMContentLoaded', async function () {
    const basePath = location.pathname.replace(/[^/]*$/, '');
    const { ScramjetController } = $scramjetLoadController();

    scramjet = new ScramjetController({
        files: {
            wasm: "https://cdn.jsdelivr.net/gh/Destroyed12121/Staticsj@main/JS/scramjet.wasm.wasm",
            all: "https://cdn.jsdelivr.net/gh/Destroyed12121/Staticsj@main/JS/scramjet.all.js",
            sync: "https://cdn.jsdelivr.net/gh/Destroyed12121/Staticsj@main/JS/scramjet.sync.js"
        }
    });

    await scramjet.init();

    if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.register(basePath + 'sw.js', { scope: basePath });
        await navigator.serviceWorker.ready;
        const wispUrl = localStorage.getItem("proxServer") || DEFAULT_WISP;
        reg.active.postMessage({ type: "config", wispurl: wispUrl });

        const connection = new BareMux.BareMuxConnection(basePath + "bareworker.js");
        await connection.setTransport("https://cdn.jsdelivr.net/npm/@mercuryworkshop/epoxy-transport/dist/index.mjs", [{ wisp: wispUrl }]);
    }

    await initializeBrowser();
});

async function initializeBrowser() {
    const root = document.getElementById("app");
    root.innerHTML = `
        <div class="browser-container">
            <div class="flex tabs" id="tabs-container"></div>
            <div class="flex nav">
                <button id="back-btn"><i class="fa-solid fa-chevron-left"></i></button>
                <button id="fwd-btn"><i class="fa-solid fa-chevron-right"></i></button>
                <button id="reload-btn"><i class="fa-solid fa-rotate-right"></i></button>
                <input class="bar" id="address-bar" autocomplete="off" placeholder="Search or type a URL">
                <button id="devtools-btn"><i class="fa-solid fa-code"></i></button>
                <button id="wisp-settings-btn"><i class="fa-solid fa-cog"></i></button>
            </div>
            <div class="loading-bar-container"><div class="loading-bar" id="loading-bar"></div></div>
            <div class="iframe-container" id="iframe-container"></div>
        </div>`;

    document.getElementById('back-btn').onclick = () => getActiveTab()?.frame.back();
    document.getElementById('fwd-btn').onclick = () => getActiveTab()?.frame.forward();
    document.getElementById('reload-btn').onclick = () => getActiveTab()?.frame.reload();
    document.getElementById('devtools-btn').onclick = toggleDevTools;
    document.getElementById('wisp-settings-btn').onclick = openWISPSettingsModal;

    const addrBar = document.getElementById('address-bar');
    addrBar.onkeyup = (e) => { if (e.key === 'Enter') handleSubmit(); };

    // --- FIX START: Listen for messages from NT.html ---
    window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'navigate') {
            handleSubmit(e.data.url);
        }
    });
    // --- FIX END ---

    createTab(true);
    initializeWISPEvents();
    checkHashParameters();
}

function createTab(makeActive = true) {
    const frame = scramjet.createFrame();
    const tab = { id: nextTabId++, title: "New Tab", url: "", frame: frame, loading: true };

    frame.frame.src = "NT.html";

    frame.addEventListener("urlchange", (e) => {
        tab.url = e.url;
        tab.loading = true;
        try { tab.title = new URL(e.url).hostname; } catch (err) { tab.title = "Browsing"; }
        updateTabsUI();
        updateAddressBar();
        updateLoadingBar(tab, 10);
    });

    frame.frame.addEventListener('load', () => {
        tab.loading = false;
        try { tab.title = frame.frame.contentWindow.document.title || tab.title; } catch (e) { }
        updateTabsUI();
        updateLoadingBar(tab, 100);
    });

    tabs.push(tab);
    document.getElementById("iframe-container").appendChild(frame.frame);
    if (makeActive) switchTab(tab.id);
    return tab;
}

function switchTab(tabId) {
    activeTabId = tabId;
    tabs.forEach(t => t.frame.frame.classList.toggle("hidden", t.id !== tabId));
    updateTabsUI();
    updateAddressBar();
}

function closeTab(tabId) {
    const idx = tabs.findIndex(t => t.id === tabId);
    if (idx === -1) return;
    const tab = tabs[idx];
    tab.frame.frame.remove();
    tabs.splice(idx, 1);

    if (activeTabId === tabId) {
        if (tabs.length > 0) switchTab(tabs[Math.max(0, idx - 1)].id);
        else createTab(true);
    } else {
        updateTabsUI();
    }
}

function updateTabsUI() {
    const container = document.getElementById("tabs-container");
    container.innerHTML = "";

    tabs.forEach(tab => {
        const el = document.createElement("div");
        el.className = `tab ${tab.id === activeTabId ? "active" : ""}`;
        el.innerHTML = `<span class="tab-title">${tab.title}</span><span class="tab-close">&times;</span>`;
        el.onclick = () => switchTab(tab.id);
        el.querySelector(".tab-close").onclick = (e) => { e.stopPropagation(); closeTab(tab.id); };
        container.appendChild(el);
    });

    const newBtn = document.createElement("button");
    newBtn.className = "new-tab";
    newBtn.textContent = "+";
    newBtn.onclick = () => createTab(true);
    container.appendChild(newBtn);
}

function updateAddressBar() {
    const bar = document.getElementById("address-bar");
    const tab = getActiveTab();
    if (bar && tab) bar.value = tab.url;
}

function getActiveTab() { return tabs.find(t => t.id === activeTabId); }

function handleSubmit(url) {
    const tab = getActiveTab();
    let input = url || document.getElementById("address-bar").value.trim();
    if (!input) return;

    if (!input.startsWith('http')) {
        if (input.includes('.') && !input.includes(' ')) input = 'https://' + input;
        else input = 'https://search.brave.com/search?q=' + encodeURIComponent(input);
    }
    tab.frame.go(input);
}

function updateLoadingBar(tab, percent) {
    if (tab.id !== activeTabId) return;
    const bar = document.getElementById("loading-bar");
    bar.style.width = percent + "%";
    bar.style.opacity = percent === 100 ? "0" : "1";
    if (percent === 100) setTimeout(() => { bar.style.width = "0%"; }, 200);
}

function openWISPSettingsModal() {
    const modal = document.getElementById('wisp-settings-modal');
    modal.classList.remove('hidden');
    document.getElementById('current-wisp-url').textContent = localStorage.getItem('proxServer') || DEFAULT_WISP;
}

function initializeWISPEvents() {
    document.getElementById('close-wisp-modal').onclick = () => document.getElementById('wisp-settings-modal').classList.add('hidden');

    document.querySelectorAll('.wisp-option-btn').forEach(btn => {
        btn.onclick = () => setWisp(btn.dataset.url);
    });

    document.getElementById('save-custom-wisp-btn').onclick = () => {
        const url = document.getElementById('custom-wisp-url').value.trim();
        if (url.startsWith('wss://') || url.startsWith('ws://')) setWisp(url);
        else alert("Invalid WISP URL");
    };
}

function setWisp(url) {
    localStorage.setItem('proxServer', url);
    document.getElementById('current-wisp-url').textContent = url;
    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'config', wispurl: url });
    }
    location.reload();
}

function toggleDevTools() {
    const win = getActiveTab()?.frame.frame.contentWindow;
    if (!win) return;
    const script = win.document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/eruda";
    script.onload = () => { win.eruda.init(); win.eruda.show(); };
    win.document.body.appendChild(script);
}

async function checkHashParameters() {
    if (window.location.hash) {
        const hash = decodeURIComponent(window.location.hash.substring(1));
        if (hash) handleSubmit(hash);
        history.replaceState(null, null, location.pathname);
    }
}