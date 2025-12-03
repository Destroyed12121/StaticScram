if (typeof BareMux === 'undefined') {
    BareMux = { BareMuxConnection: class { constructor() { } setTransport() { } } };
}

let scramjet;
let tabs = [];
let activeTabId = null;
let nextTabId = 1;

// --- CONFIGURATION ---
const DEFAULT_WISP = "wss://dash.goip.de/wisp/"; 
const WISP_SERVERS = [
    { name: "DaydreamX's Wisp", url: "wss://dash.goip.de/wisp/" },
    { name: "Space's Wisp", url: "wss://register.goip.it/wisp/" },
    { name: "Rhw's Wisp", url: "wss://wisp.rhw.one/wisp/" }

];

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

        // Ensure config consistency
        if (!localStorage.getItem("proxServer")) localStorage.setItem("proxServer", DEFAULT_WISP);

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
                <button id="back-btn" title="Back"><i class="fa-solid fa-chevron-left"></i></button>
                <button id="fwd-btn" title="Forward"><i class="fa-solid fa-chevron-right"></i></button>
                <button id="reload-btn" title="Reload"><i class="fa-solid fa-rotate-right"></i></button>
                <input class="bar" id="address-bar" autocomplete="off" placeholder="Search or type a URL">
                <button id="devtools-btn" title="DevTools"><i class="fa-solid fa-code"></i></button>
                <button id="wisp-settings-btn" title="Proxy Settings"><i class="fa-solid fa-server"></i></button>
            </div>
            <div class="loading-bar-container"><div class="loading-bar" id="loading-bar"></div></div>
            <div class="iframe-container" id="iframe-container"></div>
        </div>`;

    // Event Bindings
    document.getElementById('back-btn').onclick = () => getActiveTab()?.frame.back();
    document.getElementById('fwd-btn').onclick = () => getActiveTab()?.frame.forward();
    document.getElementById('reload-btn').onclick = () => getActiveTab()?.frame.reload();
    document.getElementById('devtools-btn').onclick = toggleDevTools;
    document.getElementById('wisp-settings-btn').onclick = openSettings;

    const addrBar = document.getElementById('address-bar');
    addrBar.onkeyup = (e) => { if (e.key === 'Enter') handleSubmit(); };
    addrBar.onfocus = () => addrBar.select();

    // Listener for New Tab page messages
    window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'navigate') {
            handleSubmit(e.data.url);
        }
    });

    createTab(true);
    checkHashParameters();
}

// --- TAB MANAGEMENT ---

function createTab(makeActive = true) {
    const frame = scramjet.createFrame();
    const tab = {
        id: nextTabId++,
        title: "New Tab",
        url: "NT.html",
        frame: frame,
        loading: false,
        favicon: null
    };

    frame.frame.src = "NT.html";

    // Event: URL Change (Navigation started)
    frame.addEventListener("urlchange", (e) => {
        tab.url = e.url;
        tab.loading = true;

        // Optimistic title update
        try {
            const urlObj = new URL(e.url);
            tab.title = urlObj.hostname;
            // Favicon logic: Only set if not internal
            tab.favicon = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
        } catch (err) {
            tab.title = "Browsing";
            tab.favicon = null;
        }

        updateTabsUI();
        updateAddressBar();
        updateLoadingBar(tab, 10);
    });

    // Event: Load Finished
    frame.frame.addEventListener('load', () => {
        tab.loading = false;

        // Grab actual title from frame if possible
        try {
            const internalTitle = frame.frame.contentWindow.document.title;
            if (internalTitle) tab.title = internalTitle;
        } catch (e) { }

        // Final check on Favicon for internal pages
        if (frame.frame.contentWindow.location.href.includes('NT.html') ||
            frame.frame.contentWindow.location.href === 'about:blank') {
            tab.title = "New Tab";
            tab.url = ""; // Clear URL bar for new tab
            tab.favicon = null; // Ensure no favicon
        }

        updateTabsUI();
        updateAddressBar();
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

        // Loading State vs Favicon
        let iconHtml;
        if (tab.loading) {
            iconHtml = `<div class="tab-spinner"></div>`;
        } else if (tab.favicon) {
            iconHtml = `<img src="${tab.favicon}" class="tab-favicon" onerror="this.style.display='none'">`;
        } else {
            iconHtml = `<div class="no-favicon"></div>`;
        }

        el.innerHTML = `
            ${iconHtml}
            <span class="tab-title">${tab.loading ? "Loading..." : tab.title}</span>
            <span class="tab-close">&times;</span>
        `;

        el.onclick = () => switchTab(tab.id);
        el.querySelector(".tab-close").onclick = (e) => { e.stopPropagation(); closeTab(tab.id); };
        container.appendChild(el);
    });

    const newBtn = document.createElement("button");
    newBtn.className = "new-tab";
    newBtn.innerHTML = "<i class='fa-solid fa-plus'></i>";
    newBtn.onclick = () => createTab(true);
    container.appendChild(newBtn);
}

function updateAddressBar() {
    const bar = document.getElementById("address-bar");
    const tab = getActiveTab();
    if (bar && tab) {
        // Don't show NT.html in the bar
        bar.value = (tab.url && !tab.url.includes("NT.html")) ? tab.url : "";
    }
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

// --- SETTINGS & WISP LOGIC ---

function openSettings() {
    const modal = document.getElementById('wisp-settings-modal');
    modal.classList.remove('hidden');

    // Init Logic
    document.getElementById('close-wisp-modal').onclick = () => modal.classList.add('hidden');
    document.getElementById('save-custom-wisp').onclick = saveCustomWisp;

    // Close on backdrop click
    modal.onclick = (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    };

    renderServerList();
}

function getStoredWisps() {
    try {
        return JSON.parse(localStorage.getItem('customWisps') || '[]');
    } catch (e) { return []; }
}

function renderServerList() {
    const list = document.getElementById('server-list');
    list.innerHTML = ''; 

    const currentUrl = localStorage.getItem('proxServer') || DEFAULT_WISP;
    const customWisps = getStoredWisps();
    
    // Combine defaults and custom wisps
    const allWisps = [
        ...WISP_SERVERS, 
        ...customWisps
    ];

    allWisps.forEach((server, index) => {
        const isActive = server.url === currentUrl;
        const isCustom = index >= WISP_SERVERS.length; // Identify if it's a custom wisp
        
        const item = document.createElement('div');
        item.className = `wisp-option ${isActive ? 'active' : ''}`;

        // Add Delete button only for custom wisps
        const deleteBtn = isCustom 
            ? `<button class="delete-wisp-btn" title="Delete" onclick="event.stopPropagation(); deleteCustomWisp('${server.url}')"><i class="fa-solid fa-trash"></i></button>` 
            : '';

        item.innerHTML = `
            <div class="wisp-option-header">
                <div class="wisp-option-name">
                    ${server.name} 
                    ${isActive ? '<i class="fa-solid fa-check" style="margin-left:8px; font-size: 0.8em; color: var(--primary);"></i>' : ''}
                </div>
                <div class="server-status">
                    <span class="ping-text">...</span>
                    <div class="status-indicator status-loading"></div>
                    ${deleteBtn}
                </div>
            </div>
            <div class="wisp-option-url">${server.url}</div>
        `;

        item.onclick = () => setWisp(server.url);
        list.appendChild(item);

        checkServerHealth(server.url, item);
    });
}

function saveCustomWisp() {
    const input = document.getElementById('custom-wisp-input');
    const url = input.value.trim();
    
    if (!url) return;

    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
        alert("URL must start with wss:// or ws://");
        return;
    }

    const customWisps = getStoredWisps();
    
    // Check if it already exists
    if (customWisps.some(w => w.url === url) || WISP_SERVERS.some(w => w.url === url)) {
        alert("This Wisp is already in the list.");
        return;
    }

    // Add new wisp
    const newWisp = {
        name: `Custom Server ${customWisps.length + 1}`,
        url: url
    };

    customWisps.push(newWisp);
    localStorage.setItem('customWisps', JSON.stringify(customWisps));
    
    input.value = ''; // Clear input
    renderServerList(); // Refresh list
}

// Global function to handle deletion (attached to window for onclick access)
window.deleteCustomWisp = function(urlToDelete) {
    if (!confirm("Remove this custom server?")) return;
    
    let customWisps = getStoredWisps();
    customWisps = customWisps.filter(w => w.url !== urlToDelete);
    localStorage.setItem('customWisps', JSON.stringify(customWisps));
    
    // If we deleted the active wisp, reset to default
    if (localStorage.getItem('proxServer') === urlToDelete) {
        setWisp(DEFAULT_WISP);
    } else {
        renderServerList();
    }
};

async function checkServerHealth(url, element) {
    const dot = element.querySelector('.status-indicator');
    const text = element.querySelector('.ping-text');
    const start = Date.now();

    try {
        const socket = new WebSocket(url);
        
        const timeout = setTimeout(() => {
            if (socket.readyState !== WebSocket.OPEN) {
                socket.close();
                markOffline();
            }
        }, 3000);

        socket.onopen = () => {
            clearTimeout(timeout);
            const latency = Date.now() - start;
            socket.close();

            dot.className = 'status-indicator status-success';
            text.textContent = `${latency}ms`;
            
            if (latency > 300) {
                dot.style.background = '#f59e0b';
                text.style.color = '#f59e0b';
            }
        };

        socket.onerror = () => { clearTimeout(timeout); markOffline(); };

    } catch (e) { markOffline(); }

    function markOffline() {
        dot.className = 'status-indicator status-error';
        text.textContent = "Offline";
    }
}

function setWisp(url) {
    localStorage.setItem('proxServer', url);
    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'config', wispurl: url });
    }
    location.reload();
}

// --- UTILS ---

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