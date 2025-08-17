// public/app.js
document.addEventListener("DOMContentLoaded", () => {
  const state = {
    map: null, layer: null,
    data: null, geo: null,
    selectedKey: null,
    selectedJob: "All Occupations",
    selectedSubjob: "All Occupations",
    selectedStage: "p50"
  };

  // ---- tweakable affordability thresholds (in COL-adjusted $/year) ----
  const AFF_THRESH = { hard: 50000, good: 70000 };

  // ---- styles (keep your look) ----
  const css = getComputedStyle(document.documentElement);
  const ACCENT = (css.getPropertyValue("--accent") || "#f10000").trim();
  const STYLES = {
    default: { color:"#002457", weight:1, opacity:1, fillColor:"#3c73ff", fillOpacity:0.70 },
    hover:   { color:"#df0000", weight:3, opacity:1, fillColor:"#dc083a", fillOpacity:0.35 },
    selected:{ color:ACCENT,    weight:3, opacity:1, fillColor:"#dc083a", fillOpacity:0.35 }
  };

  // ---------- helpers ----------
  const num = (x) => {
    if (x == null) return null;
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  };
  const fmtInt = x => (x==null||isNaN(x)) ? "—" : Number(x).toLocaleString();
  const fmtMoney = x => (x==null||isNaN(x)) ? "—" : "$"+Math.round(Number(x)).toLocaleString();

  // prefer requested percentile; fallback to p50; then mean
  function pickWage(v, stageKey) {
    if (!v) return null;
    if (v[stageKey] != null) return Number(v[stageKey]);
    if (v.p50 != null) return Number(v.p50);
    if (v.mean != null) return Number(v.mean);
    return null;
  }

  function getJobsUniverse(data){
    const jobs = new Set();
    const subjobs = new Map();
    Object.values(data).forEach(msa => {
      const j = msa.jobs || {};
      Object.keys(j).forEach(job => {
        jobs.add(job);
        const subs = Object.keys(j[job] || {});
        if(!subjobs.has(job)) subjobs.set(job, new Set());
        subs.forEach(s => subjobs.get(job).add(s));
      });
    });
    jobs.add("All Occupations");
    return {
      jobs: Array.from(jobs).sort((a,b)=> a==="All Occupations"?-1 : b==="All Occupations"?1 : a.localeCompare(b)),
      subjobs
    };
  }

  function populateJobDropdown(universe){
    const jobSel = document.getElementById("jobSelect");
    jobSel.innerHTML = "";
    universe.jobs.forEach(j => {
      const o = document.createElement("option");
      o.value=j; o.textContent=j; jobSel.appendChild(o);
    });
    jobSel.value = "All Occupations";
    state.selectedJob = "All Occupations";
  }

  function populateSubjobDropdown(universe){
    const subSel = document.getElementById("subjobSelect");
    subSel.innerHTML = "";
    if (state.selectedJob === "All Occupations") {
      const o = document.createElement("option");
      o.value = "All Occupations"; o.textContent = "All Occupations";
      subSel.appendChild(o);
      subSel.value = "All Occupations";
      state.selectedSubjob = "All Occupations";
      return;
    }
    const optAll = document.createElement("option");
    optAll.value="__ALL__"; optAll.textContent="All subjobs";
    subSel.appendChild(optAll);
    const subs = universe.subjobs.get(state.selectedJob) || new Set();
    Array.from(subs).sort().forEach(s=>{
      const o=document.createElement("option"); o.value=s; o.textContent=s; subSel.appendChild(o);
    });
    subSel.value="__ALL__";
    state.selectedSubjob="__ALL__";
  }

  // ---------- core stat extraction ----------
  function extractStats(msaObj){
    const idx = num(msaObj?.col_index); // RPP (U.S.=100)
    const jobsObj = msaObj?.jobs || {};
    const stageKey = state.selectedStage;

    if (state.selectedJob === "All Occupations") {
      const ao = msaObj?.all_occ || jobsObj["All Occupations"]?.["All Occupations"] || null;
      let workers = 0, wage = null;
      if (ao) {
        workers = num(ao.workers) || 0;
        wage = pickWage(ao, stageKey);
      } else {
        Object.values(jobsObj).forEach(subs=>{
          Object.values(subs).forEach(v=>{
            workers += num(v?.workers) || 0;
          });
        });
      }
      return { workers, wage, idx };
    }

    const subs = jobsObj[state.selectedJob] || {};
    if (state.selectedSubjob === "__ALL__") {
      const roll = subs["All (major group)"] || null;
      if (roll) {
        return {
          workers: num(roll.workers) || 0,
          wage:    pickWage(roll, stageKey),
          idx
        };
      }
      // combine detailed subjobs
      let workers=0, wsum=0, wsumW=0;
      Object.entries(subs).forEach(([name,v])=>{
        if (name === "All (major group)") return;
        const w = num(v?.workers) || 0;
        const pay = pickWage(v, stageKey);
        workers += w;
        if (pay!=null && w>0) { wsum += pay*w; wsumW += w; }
      });
      const wage = wsumW>0 ? (wsum/wsumW) : null;
      return { workers, wage, idx };
    } else {
      const v = subs[state.selectedSubjob] || null;
      if (v) return { workers: num(v.workers)||0, wage: pickWage(v, stageKey), idx };
      const roll = subs["All (major group)"] || null;
      if (roll) return { workers: num(roll.workers)||0, wage: pickWage(roll, stageKey), idx };
      const ao = msaObj?.all_occ || jobsObj["All Occupations"]?.["All Occupations"] || null;
      return { workers: num(ao?.workers)||0, wage: pickWage(ao, stageKey), idx };
    }
  }

  // ---------- affordability ----------
  // We use COL-adjusted wage: wage / (RPP/100).
  // Label:
  //   Good  >= 70k
  //   Okay   50–70k
  //   Hard  < 50k
  // ---------- affordability (label only; no numeric shown) ----------
  function getAffordabilityLabel(wage, rpp){
    const i = num(rpp), w = num(wage);
    if (i==null || i===0 || w==null) return { html:"—" };

    // COL-adjusted wage = wage / (RPP/100)
    const real = w / (i/100);

    // thresholds from earlier; tweak if you like
    // Good  >= 70k, Okay 50–70k, Bad < 50k
    let badge = "badge--ok", txt = "Okay";
    if (real >= AFF_THRESH.good) { badge = "badge--good"; txt = "Good"; }
    else if (real < AFF_THRESH.hard) { badge = "badge--bad"; txt = "Bad"; }

    // label only
    return { html: `<span class="badge ${badge}">${txt}</span>` };
  }


  function setPanel(msaName, workers, wage, rpp){
    document.getElementById("msaName").textContent = msaName || "Click a metro";
    document.getElementById("workers").textContent = fmtInt(workers);
    document.getElementById("wage").textContent = fmtMoney(wage);
    const aff = getAffordabilityLabel(wage, rpp);
    document.getElementById("afford").innerHTML = aff.html;
  }

  // ---------- map interactivity ----------
  function styleFeature(){ return { ...STYLES.default }; }
  function highlightFeature(e){
    const k = e.target.feature.properties.msa_key;
    if (k === state.selectedKey) return;
    e.target.setStyle({ ...STYLES.hover });
  }
  function resetHighlight(e){
    const k = e.target.feature.properties.msa_key;
    e.target.setStyle(k===state.selectedKey ? { ...STYLES.selected } : { ...STYLES.default });
  }
  function selectFeature(layer){
    state.layer.eachLayer(l=>{
      const k=l.feature.properties.msa_key;
      l.setStyle(k===state.selectedKey ? { ...STYLES.selected } : { ...STYLES.default });
    });
    state.map.fitBounds(layer.getBounds(), { padding:[20,20] });
  }
  function onEachFeature(feature, layer){
    layer.on({
      mouseover: highlightFeature,
      mouseout: resetHighlight,
      click: ()=>{
        state.selectedKey = feature.properties.msa_key;
        selectFeature(layer);
        const msa = state.data[state.selectedKey] || null;
        const s = extractStats(msa || {});
        setPanel(msa?.msa_name || feature.properties.msa_name, s.workers, s.wage, s.idx);
      }
    });
  }

  // ---------- init map ----------
  state.map = L.map("map", { zoomControl:true, minZoom:3, worldCopyJump:false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:"&copy; OpenStreetMap"
  }).addTo(state.map);

  // ---------- load data (tolerant to bad JSON tokens) ----------
  function loadSafeJSON(url){
    return fetch(url)
      .then(r => { if(!r.ok) throw new Error(url + " not found"); return r.text(); })
      .then(txt => {
        const safe = txt
          .replace(/\bNaN\b/g, "null")
          .replace(/\bInfinity\b/g, "null")
          .replace(/\b-Infinity\b/g, "null");
        return JSON.parse(safe);
      });
  }

  Promise.all([
    loadSafeJSON("./data/processed/msa_wages.json"),
    fetch("./data/processed/metros.geojson").then(r => { if(!r.ok) throw new Error("metros.geojson not found"); return r.json(); })
  ]).then(([data, geo])=>{
    state.data = data;
    state.geo  = geo;

    const universe = getJobsUniverse(state.data);
    populateJobDropdown(universe);
    populateSubjobDropdown(universe);

    document.getElementById("jobSelect").addEventListener("change", e=>{
      state.selectedJob = e.target.value;
      populateSubjobDropdown(universe);
      if(state.selectedKey){
        const msa = state.data[state.selectedKey] || null;
        const s = extractStats(msa || {});
        setPanel(msa?.msa_name || "Unknown metro", s.workers, s.wage, s.idx);
      }
    });

    document.getElementById("subjobSelect").addEventListener("change", e=>{
      state.selectedSubjob = e.target.value;
      if(state.selectedKey){
        const msa = state.data[state.selectedKey] || null;
        const s = extractStats(msa || {});
        setPanel(msa?.msa_name || "Unknown metro", s.workers, s.wage, s.idx);
      }
    });

    document.getElementById("stageSelect").addEventListener("change", e=>{
      state.selectedStage = e.target.value;
      if(state.selectedKey){
        const msa = state.data[state.selectedKey] || null;
        const s = extractStats(msa || {});
        setPanel(msa?.msa_name || "Unknown metro", s.workers, s.wage, s.idx);
      }
    });

    state.layer = L.geoJSON(state.geo, { style: styleFeature, onEachFeature }).addTo(state.map);
    state.map.fitBounds(state.layer.getBounds(), { padding:[10,10] });
    setTimeout(()=> state.map.invalidateSize(), 0);
  }).catch(err=>{
    console.error(err);
    setPanel("Data failed to load", null, null, null);
  });
});
