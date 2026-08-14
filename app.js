/* =========================================================
   Tacos Olmedo · Repartidor  (PWA / APK)
   Mejorado: mapa en vivo, filtros por fecha, historial.
   Sincroniza con la web vía localStorage('tacosOrders').
   ========================================================= */

const REP_PASS = "tacos789"; // ya no se usa; mantenido por compatibilidad
const ORDERS_KEY = "tacosOrders";
const LOC_KEY = "repLocation";
const DEMO_KEY = "repDemoSeeded";
const SESSION_KEY = "repAuth";
const GEO_KEY = "repGeocache";

// Perfiles de acceso. Cada perfil define rol y (si aplica) el repartidor asignado.
// Las claves son por defecto; cámbialas en este arreglo.
const PROFILES = [
  { user: "jefe",        pass: "jt2025",   name: "Jefe Taquero",        rol: "local",    repartidor: null },
  { user: "cocinero",     pass: "coc2025",  name: "Cocinero",            rol: "local",    repartidor: null },
  { user: "asistente",    pass: "as2025",   name: "Asistente de Cocina", rol: "local",    repartidor: null },
  { user: "empaquetador", pass: "emp2025",  name: "Empaquetador",        rol: "local",    repartidor: null },
  { user: "repartidor01", pass: "r012025",  name: "Repartidor 01",       rol: "repartidor", repartidor: "Repartidor 01" },
  { user: "repartidor02", pass: "r022025",  name: "Repartidor 02",       rol: "repartidor", repartidor: "Repartidor 02" }
];
let activeProfile = null;

const IC = {
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>',
  logout:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
  map:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>',
  nav:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>',
  phone:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/></svg>',
  plus:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  close:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  route:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h6a3 3 0 000-6H9a3 3 0 010-6h6"/></svg>'
};

let orders = [];
let currentFilter = "Todo";
let currentRep = "Repartidor 01";     // repartidor seleccionado en el dropdown
let dateFrom = null, dateTo = null;   // filtros de fecha (Date)
let map, meMarker, orderMarkers = {};
let myPos = null;

const $ = id => document.getElementById(id);
const fmtMoney = n => "$" + Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function parseTotal(t) {
  if (typeof t === "number") return t;
  const m = String(t).replace(/[^0-9.]/g, "");
  return m ? parseFloat(m) : 0;
}
function orderDate(o) {
  // o.date es string local; parsear a Date
  const d = new Date(o.date);
  return isNaN(d) ? new Date(0) : d;
}

/* ---------- Login ---------- */
function tryLogin() {
  const user = $("userInput").value.trim().toLowerCase();
  const pass = $("passInput").value;
  const profile = PROFILES.find(p => p.user === user && p.pass === pass);
  if (profile) {
    activeProfile = profile;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user: profile.user }));
    showApp();
  } else {
    $("loginError").style.display = "block";
  }
}
function logout() {
  activeProfile = null;
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
}
function showApp() {
  $("login").hidden = true;
  $("app").hidden = false;
  // Personalizar header con el perfil activo
  const isRep = activeProfile && activeProfile.rol === "repartidor";
  $("topbarName").textContent = activeProfile ? activeProfile.name : "RUTA OLMEDO";
  // Repartidores: fijar currentRep y ocultar dropdown
  if (isRep) {
    currentRep = activeProfile.repartidor;
    if ($("repSelect")) $("repSelect").hidden = true;
  } else {
    currentRep = "Repartidor 01"; // personal local ve por defecto Rep 01 (puede cambiar)
    if ($("repSelect")) $("repSelect").hidden = false;
  }
  $("refreshBtn").innerHTML = IC.refresh;
  $("logoutBtn").innerHTML = IC.logout;
  $("addBtn").innerHTML = IC.plus;
  $("closeAdd").innerHTML = IC.close;
  $("routeBtn").innerHTML = IC.route + " Ruta óptima";
  bindEvents();
  initMap();
  loadOrders();
  startGPS();
  registerSW();
}

/* ---------- Almacenamiento ---------- */
function loadOrders() {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    orders = raw ? JSON.parse(raw) : [];
  } catch (e) { orders = []; }

  if (orders.length === 0 && !localStorage.getItem(DEMO_KEY)) {
    orders = seedDemo();
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    localStorage.setItem(DEMO_KEY, "1");
  }
  render();
  updateSyncBadge();
}
function saveOrders() {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  broadcast();
  updateSyncBadge();
}
function broadcast() {
  try {
    if (!window.__bc) window.__bc = new BroadcastChannel("tacosOrders");
    window.__bc.postMessage({ ts: Date.now() });
  } catch (e) {}
}
function updateSyncBadge() {
  const d = new Date();
  $("syncBadge").textContent = "↻ " + d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

/* ---------- Filtrado por fecha + estado ---------- */
function inDateRange(o) {
  const d = orderDate(o);
  if (dateFrom && d < dateFrom) return false;
  if (dateTo) {
    const end = new Date(dateTo); end.setHours(23, 59, 59, 999);
    if (d > end) return false;
  }
  return true;
}
function visibleOrders() {
  let v = orders.slice().reverse();
  v = v.filter(o => (o.repartidor || "Repartidor 01") === currentRep);
  if (currentFilter !== "Todo") v = v.filter(o => o.status === currentFilter);
  if (dateFrom || dateTo) v = v.filter(inDateRange);
  return v;
}

/* ---------- Render ---------- */
function render() {
  updateStats();
  const list = $("list");
  const view = visibleOrders();
  $("emptyMsg").hidden = view.length !== 0;
  list.innerHTML = view.map(o => cardHTML(o)).join("");
  updateMap();
  updateHistory();
}
function updateStats() {
  const pend = orders.filter(o => o.status === "Pendiente").length;
  const transit = orders.filter(o => o.status === "En Camino").length;
  const done = orders.filter(o => o.status === "Entregado").length;
  const cash = orders
    .filter(o => o.status !== "Entregado" && o.deliveryType !== "Local" && (!o.paymentMethod || o.paymentMethod === "Efectivo"))
    .reduce((a, o) => a + parseTotal(o.total), 0);
  $("statPending").textContent = pend;
  $("statTransit").textContent = transit;
  $("statDone").textContent = done;
  $("statCash").textContent = fmtMoney(cash);
}
function statusClass(s) {
  return s === "Pendiente" ? "b-pendiente" : s === "En Camino" ? "b-encamino" : "b-entregado";
}
function itemsText(o) {
  if (Array.isArray(o.items) && o.items.length) return o.items.map(i => `${i.title} x${i.quantity || 1}`).join(", ");
  return o.items || "—";
}
function cardHTML(o) {
  const paid = o.paymentMethod && o.paymentMethod !== "Efectivo";
  const payTxt = paid ? `Pagado · ${o.paymentMethod}` : "Cobrar en efectivo";
  const addr = o.address ? o.address : (o.deliveryType === "Local" ? "Recoger en local" : "");

  const actions = [];
  if (o.address) actions.push(`<a class="btn btn-maps" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}" target="_blank" rel="noopener">${IC.nav} Ir en GPS</a>`);
  if (o.customerPhone) actions.push(`<a class="btn btn-call" href="tel:${o.customerPhone.replace(/[^0-9+]/g, "")}">${IC.phone} Llamar</a>`);
  if (o.status === "Pendiente") actions.push(`<button class="btn btn-go" onclick="setStatus(${o.id},'En Camino')">${IC.nav} Marcar en camino</button>`);
  if (o.status === "En Camino") actions.push(`<button class="btn btn-done" onclick="setStatus(${o.id},'Entregado')">${IC.map} Confirmar entrega</button>`);

  return `
  <div class="order">
    <div class="order-top">
      <div>
        <span class="badge ${statusClass(o.status)}">${o.status}</span>
        <div class="order-id">#${o.id} · ${o.date ? o.date : ""}</div>
      </div>
      <div>
        <div class="order-total">${o.total}</div>
        <div class="order-pay ${paid ? "pay-paid" : "pay-cash"}">${payTxt}</div>
      </div>
    </div>
    <div class="order-cust">${escapeHTML(o.customerName || "Sin nombre")}</div>
    <div class="order-items">${escapeHTML(itemsText(o))}</div>
    <div class="addr-box">
      <span class="lbl">📍 Dirección</span>${escapeHTML(addr)}
      ${o.notes ? `<div class="notes">📝 ${escapeHTML(o.notes)}</div>` : ""}
    </div>
    <div class="actions">${actions.join("")}</div>
  </div>`;
}
function escapeHTML(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- Historial del periodo ---------- */
function updateHistory() {
  const box = $("historyBox");
  const base = (dateFrom || dateTo) ? orders.filter(inDateRange) : orders;
  const delivered = base.filter(o => o.status === "Entregado");
  const cash = delivered
    .filter(o => (!o.paymentMethod || o.paymentMethod === "Efectivo"))
    .reduce((a, o) => a + parseTotal(o.total), 0);
  const dist = myPos ? (myPos.accDist ? myPos.accDist.toFixed(2) + " km" : "—") : "—";

  $("hCount").textContent = delivered.length;
  $("hCash").textContent = fmtMoney(cash);
  $("hKm").textContent = dist;
  box.hidden = !(dateFrom || dateTo);
}

/* ---------- MAPA EN VIVO ---------- */
function initMap() {
  if (typeof L === "undefined") { $("gpsStatus").textContent = "📡 Mapa: Leaflet no cargó (revisa red)"; return; }
  map = L.map("map", { zoomControl: true }).setView([19.4326, -99.1332], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap", maxZoom: 19
  }).addTo(map);
  meMarker = L.circleMarker([19.4326, -99.1332], {
    radius: 8, color: "#ff4d00", fillColor: "#ff4d00", fillOpacity: 1, weight: 3
  }).addTo(map).bindPopup("Tu ubicación");
}
function geocode(addr) {
  const cache = JSON.parse(localStorage.getItem(GEO_KEY) || "{}");
  if (cache[addr]) return Promise.resolve(cache[addr]);
  return fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addr)}`)
    .then(r => r.json())
    .then(data => {
      if (data && data[0]) {
        const c = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
        cache[addr] = c; localStorage.setItem(GEO_KEY, JSON.stringify(cache));
        return c;
      }
      return null;
    }).catch(() => null);
}
function pinColor(status) {
  return status === "Pendiente" ? "#ffc107" : status === "En Camino" ? "#007bff" : "#28a745";
}
async function updateMap() {
  if (!map) return;
  // limpiar pines previos
  Object.values(orderMarkers).forEach(m => map.removeLayer(m));
  orderMarkers = {};

  const view = visibleOrders().filter(o => o.address);
  const pts = [];
  if (myPos) { meMarker.setLatLng([myPos.lat, myPos.lng]); pts.push([myPos.lat, myPos.lng]); }

  for (const o of view) {
    const c = await geocode(o.address);
    if (!c) continue;
    const m = L.circleMarker(c, { radius: 7, color: pinColor(o.status), fillColor: pinColor(o.status), fillOpacity: .9, weight: 2 })
      .addTo(map)
      .bindPopup(`<b>${escapeHTML(o.customerName || "")}</b><br>${escapeHTML(o.address)}<br>${o.status}`);
    orderMarkers[o.id] = m;
    pts.push(c);
  }
  if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 16 });
}

/* ---------- Acciones ---------- */
function setStatus(id, newStatus) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  o.status = newStatus;
  o.dateStatus = new Date().toLocaleString("es-MX");
  saveOrders();
  render();
  toast(newStatus === "Entregado" ? "✅ Entrega confirmada" : "🛵 En camino");
}
function generateRoute() {
  const pend = orders.filter(o => o.status !== "Entregado" && o.address && o.deliveryType !== "Local");
  if (pend.length === 0) return alert("No hay entregas a domicilio pendientes.");
  const dest = encodeURIComponent(pend[pend.length - 1].address);
  const wp = pend.slice(0, -1).map(o => encodeURIComponent(o.address)).join("|");
  const url = `https://www.google.com/maps/dir/?api=1&origin=My+Location&destination=${dest}${wp ? "&waypoints=" + wp : ""}`;
  window.open(url, "_blank");
}

/* ---------- Alta manual ---------- */
function openAdd() {
  $("addForm").reset();
  $("addModal").hidden = false;
}
function closeAdd() { $("addModal").hidden = true; }
function submitAdd(e) {
  e.preventDefault();
  const total = parseTotal($("fTotal").value) || 0;
  const o = {
    id: Date.now(),
    repartidor: $("fRep").value,
    items: [{ title: $("fItems").value.trim() || "Pedido", quantity: 1 }],
    total: fmtMoney(total),
    customerName: $("fName").value.trim(),
    customerPhone: $("fPhone").value.trim(),
    deliveryType: $("fAddr").value.trim() ? "Entrega" : "Local",
    paymentMethod: $("fPay").value,
    address: $("fAddr").value.trim(),
    notes: $("fNotes").value.trim(),
    status: "Pendiente",
    date: new Date().toLocaleString("es-MX")
  };
  orders.push(o);
  saveOrders();
  render();
  closeAdd();
  toast("📦 Entrega agregada");
}

/* ---------- GPS con distancia acumulada ---------- */
function startGPS() {
  const el = $("gpsStatus");
  if (!navigator.geolocation) { el.textContent = "📡 GPS no disponible"; return; }
  navigator.geolocation.watchPosition(
    pos => {
      const n = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() };
      // distancia acumulada
      if (myPos) {
        const d = haversine(myPos.lat, myPos.lng, n.lat, n.lng);
        n.accDist = (myPos.accDist || 0) + d;
      } else { n.accDist = 0; }
      myPos = n;
      localStorage.setItem(LOC_KEY, JSON.stringify(n));
      el.textContent = `📡 GPS ok · ${n.lat.toFixed(4)}, ${n.lng.toFixed(4)}`;
      if (meMarker) meMarker.setLatLng([n.lat, n.lng]);
      updateHistory();
    },
    err => { el.textContent = "📡 GPS: permiso denegado"; },
    { enableHighAccuracy: true, maximumAge: 5000 }
  );
}
function haversine(a, b, c, d) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (c - a) * r, dLon = (d - b) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 1800);
}

/* ---------- Filtros de fecha ---------- */
function applyDateQuick() {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  dateFrom = hoy; dateTo = null;
  $("dateFrom").value = toISO(hoy); $("dateTo").value = "";
  render();
  toast("📅 Filtrando: Hoy");
}
function clearDate() {
  dateFrom = dateTo = null;
  $("dateFrom").value = ""; $("dateTo").value = "";
  render();
  toast("📅 Sin filtro de fecha");
}
function onDateChange() {
  dateFrom = $("dateFrom").value ? new Date($("dateFrom").value + "T00:00:00") : null;
  dateTo = $("dateTo").value ? new Date($("dateTo").value + "T00:00:00") : null;
  render();
}
function toISO(d) { return d.toISOString().slice(0, 10); }

/* ---------- Demo ---------- */
function seedDemo() {
  const now = new Date();
  const mk = (h) => { const d = new Date(now); d.setHours(d.getHours() - h); return d.toLocaleString("es-MX"); };
  return [
    { id: 101, repartidor: "Repartidor 01", customerName: "María González", customerPhone: "3312345678", deliveryType: "Entrega",
      paymentMethod: "Efectivo", address: "Av. Hidalgo 45, Centro, El Grullo", notes: "Tocar timbre verde",
      items: [{ title: "5 Tacos + Agua Fresca", quantity: 1 }], total: fmtMoney(90), status: "Pendiente", date: mk(1) },
    { id: 102, repartidor: "Repartidor 01", customerName: "Carlos Ramírez", customerPhone: "3323456789", deliveryType: "Entrega",
      paymentMethod: "Transferencia", address: "Calle Juárez 12, Col. Centro, El Grullo", notes: "",
      items: [{ title: "Torta de Carnitas", quantity: 2 }], total: fmtMoney(100), status: "En Camino", date: mk(2) },
    { id: 103, repartidor: "Repartidor 02", customerName: "Lucía Pérez", customerPhone: "3334567890", deliveryType: "Entrega",
      paymentMethod: "Efectivo", address: "Prolongación Morelos 88, El Grullo", notes: "Casa gris con portón",
      items: [{ title: "Orden de 7 tacos", quantity: 1 }], total: fmtMoney(100), status: "Pendiente", date: mk(0.5) },
    { id: 104, repartidor: "Repartidor 02", customerName: "Pedro López", customerPhone: "3345678901", deliveryType: "Entrega",
      paymentMethod: "Efectivo", address: "Calle Hidalgo 200, El Grullo", notes: "",
      items: [{ title: "5 Tacos", quantity: 1 }], total: fmtMoney(75), status: "Entregado", date: mk(26) }
  ];
}

/* ---------- Service Worker ---------- */
function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

/* ---------- Eventos ---------- */
function bindLoginEvents() {
  $("loginBtn").addEventListener("click", tryLogin);
  $("passInput").addEventListener("keydown", e => { if (e.key === "Enter") tryLogin(); });
  $("userInput").addEventListener("keydown", e => { if (e.key === "Enter") tryLogin(); });
}
function bindEvents() {
  bindLoginEvents();
  $("logoutBtn").addEventListener("click", logout);
  $("refreshBtn").addEventListener("click", () => { loadOrders(); toast("🔄 Sincronizado"); });
  $("routeBtn").addEventListener("click", generateRoute);
  $("addBtn").addEventListener("click", openAdd);
  $("closeAdd").addEventListener("click", closeAdd);
  $("addForm").addEventListener("submit", submitAdd);
  $("addModal").addEventListener("click", e => { if (e.target === $("addModal")) closeAdd(); });
  $("dateQuick").addEventListener("click", applyDateQuick);
  $("dateClear").addEventListener("click", clearDate);
  $("dateFrom").addEventListener("change", onDateChange);
  $("dateTo").addEventListener("change", onDateChange);
  $("repSelect").addEventListener("change", e => {
    currentRep = e.target.value;
    render();
    toast("👤 " + currentRep);
  });

  document.querySelectorAll(".tab").forEach(t => {
    t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      currentFilter = t.dataset.filter;
      render();
    });
  });

  window.addEventListener("storage", e => { if (e.key === ORDERS_KEY) loadOrders(); });
  try {
    const bc = new BroadcastChannel("tacosOrders");
    bc.onmessage = () => loadOrders();
    window.__bc = bc;
  } catch (e) {}
}

/* ---------- Arranque ---------- */
window.addEventListener("DOMContentLoaded", () => {
  bindLoginEvents();
  const saved = sessionStorage.getItem(SESSION_KEY);
  if (saved) {
    try {
      const { user } = JSON.parse(saved);
      activeProfile = PROFILES.find(p => p.user === user) || null;
    } catch (e) { activeProfile = null; }
    if (activeProfile) showApp();
  }
});
