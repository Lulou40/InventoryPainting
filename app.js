// 1) Mets l'URL de ta Edge Function
const FN_URL = "https://dezvnwebpruznpfqisbo.supabase.co/functions/v1/dynamic-api";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlenZud2VicHJ1em5wZnFpc2JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxMDAzODEsImV4cCI6MjA4MjY3NjM4MX0.HPQsuomuxHt6ZLgRQk0zl51PF3xUmpmTQTY9N0qaHW8";


// 2) Gestion du code secret : URL ?key=... ou localStorage
function getKey() {
  const urlKey = new URLSearchParams(location.search).get("key");
  if (urlKey) {
    localStorage.setItem("userKey", urlKey);
    return urlKey;
  }
  let key = localStorage.getItem("userKey");
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem("userKey", key);
  }
  return key;
}

function setStatus(txt) {
  document.getElementById("status").textContent = txt;
}

async function loadInventory() {
  const key = getKey();
  const res = await fetch(`${FN_URL}?key=${encodeURIComponent(key)}`, {
    headers: {
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY
    }
  });
  const json = await res.json();
  return json.data ?? { owned: [], qty: {} };
}

async function saveInventory(inv) {
  const key = getKey();
  await fetch(`${FN_URL}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY
    },
    body: JSON.stringify({ data: inv }),
  });
}

// Utilitaires
function normalize(s) {
  return (s ?? "").toString().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

let PAINTS = [];
let INVENTORY = { owned: [], qty: {} };
let saveTimer = null;

function queueSave() {
  // Debounce : évite de spammer Supabase à chaque clic instantané
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    setStatus("Sauvegarde...");
    try {
      await saveInventory(INVENTORY);
      setStatus("Sauvegardé ✅");
    } catch (e) {
      console.error(e);
      setStatus("Erreur de sauvegarde ❌");
    }
  }, 500);
}

function isOwned(id) {
  return (INVENTORY.owned || []).includes(id);
}

function getQty(id) {
  return INVENTORY.qty?.[id] ?? 0;
}

function toggleOwned(id) {
  const s = new Set(INVENTORY.owned || []);
  s.has(id) ? s.delete(id) : s.add(id);
  INVENTORY.owned = [...s];
  queueSave();
  render();
}



function render() {
  const q = normalize(document.getElementById("search").value);
  const list = document.getElementById("list");

  const filtered = PAINTS.filter(p => {
    if (!applyFilter(p)) return false;
    const hay = normalize(`${p.name} ${p.brand} ${p.range_name || ""}`);
    return hay.includes(q);
  });

  const ownedCount = PAINTS.filter(p => (INVENTORY.owned || []).includes(p.id)).length;
  document.getElementById("count").textContent =
    `${filtered.length} / ${PAINTS.length} peintures (possédées: ${ownedCount})`;


  document.getElementById("count").textContent =
    `${filtered.length} / ${PAINTS.length} peintures`;

  list.innerHTML = "";
  filtered.forEach(p => {
    const row = document.createElement("div");
    row.className = "row";

    const owned = isOwned(p.id);
    const qty = getQty(p.id);

    row.innerHTML = `
    <label for="checkbox-${p.id}">
      <div class="got">
        <input id="checkbox-${p.id}" type="checkbox" ${owned ? "checked" : ""} />
        <p class=" ${owned ? "yes" : "no"}">${owned ? "Possédé" : "Manquant"}</p>
      </div>
      <div  class="img"> <img src="${p.image_url}" alt="${p.name}" /> </div>
      <div style="flex:1">
        <div class="topline">
          <span class="name">${p.name}</span>
          ${p.is_metallic > 0 ? `<span class="badge">Métallique</span>` : ""}
        </div>
        <div class="meta">${p.brand}${p.range_name ? " • " + p.range_name : ""}</div>
         <input class="qty" type="number" min="0" value="${qty}" />
      </label>
     
    `;

    const checkbox = row.querySelector("input[type=checkbox]");
    checkbox.addEventListener("change", () => toggleOwned(p.id));

    const labelInput = row.querySelector("label");

   

    const qtyInput = row.querySelector("input[type=number]");
    qtyInput.addEventListener("input", () => {
      const v = parseInt(qtyInput.value || "0", 10);
      const qty = Number.isFinite(v) ? v : 0;

      setQty(p.id, qty);

      // 🔥 synchro visuelle immédiate
      checkbox.checked = qty > 0;


      const label = row.querySelector(".got p");
      label.textContent = qty > 0 ? "Possédé" : "Manquant";
      label.className = qty > 0 ? "yes" : "no";


    });

    list.appendChild(row);
  });
}

function setQty(id, qty) {
  INVENTORY.qty = INVENTORY.qty || {};
  INVENTORY.qty[id] = qty;

  // si qty > 0, on coche automatiquement
  const s = new Set(INVENTORY.owned || []);
  if (qty > 0) s.add(id);
  else s.delete(id);
  INVENTORY.owned = [...s];

  queueSave();
}


async function init() {
  try {
    setStatus("Chargement du catalogue...");
    PAINTS = await fetch("paintsV2.json").then(r => r.json());

    setStatus("Chargement de ton inventaire...");
    INVENTORY = await loadInventory();

    setStatus("Prêt ✅");
    render();

    document.getElementById("search").addEventListener("input", render);

    document.getElementById("filterAll").onclick = () => { FILTER = "all"; render(); };
    document.getElementById("filterOwned").onclick = () => { FILTER = "owned"; render(); };
    document.getElementById("filterMissing").onclick = () => { FILTER = "missing"; render(); };


    // Bouton "copier lien"
    document.getElementById("copyLink").addEventListener("click", async () => {
      const key = getKey();
      const url = `${location.origin}${location.pathname}?key=${key}`;
      await navigator.clipboard.writeText(url);
      alert("Lien copié ✅\n" + url);
    });

  } catch (e) {
    console.error(e);
    setStatus("Erreur de chargement ❌ (voir console)");
  }
}

let FILTER = "all";

function applyFilter(paint) {
  const owned = isOwned(paint.id);
  if (FILTER === "owned") return owned;
  if (FILTER === "missing") return !owned;
  return true;
}


init();
