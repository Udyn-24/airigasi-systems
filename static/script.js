/* =========================================
   GLOBAL VARIABLES
   ========================================= */
let map, marker;
let debounceTimer;
let sensorChart; 

const searchInput = document.getElementById('mapSearchInput');
const resultsList = document.getElementById('mapSearchResults');
const latInput = document.getElementById('latInput');
const longInput = document.getElementById('longInput');


/* =========================================
   1. RASPBERRY PI DATA (LOCAL SENSOR)
   ========================================= */
async function updateRoomData() {
  try {
    const response = await fetch('/sensor-read');
    const data = await response.json();

    // 1. Update Temperature
    if(data.temperature_c !== undefined) {
        const tempEl = document.getElementById('room-temp');
        tempEl.textContent = data.temperature_c;
        
        // FORCE COLOR RESET (Fixes the "Still Red" issue)
        tempEl.style.color = ""; 
        tempEl.style.fontWeight = "";
    }

    // 2. Update Other Values
    if(data.humidity !== undefined) document.getElementById('room-hum').textContent = data.humidity;
    if(data.soil_percent !== undefined) document.getElementById('room-soil').textContent = data.soil_percent;

    // 3. SYNC TOGGLE SWITCH (Fixes the "Switch looks off but Simulator is on" issue)
    const toggle = document.getElementById('simToggle');
    if (data.device === "SIMULATOR") {
        if (!toggle.checked) toggle.checked = true; // Turn switch ON if server is simulating
    } 

  } catch (e) {
    console.log("Waiting for Raspberry Pi...");
  }
}


/* =========================================
   2. MAP INITIALIZATION
   ========================================= */
function initMap() {
  map = L.map('map').setView([-6.1754, 106.8272], 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  marker = L.marker([-6.1754, 106.8272]).addTo(map);

  map.on('click', function(e) {
    const lat = e.latlng.lat.toFixed(4);
    const lng = e.latlng.lng.toFixed(4);
    updateMainInputs(lat, lng);
    marker.setLatLng(e.latlng);
    fetchWeatherData(lat, lng);
  });
}

function toggleMap() {
  document.body.classList.toggle('map-active');
  setTimeout(() => { map.invalidateSize(); }, 400);
}


/* =========================================
   3. WEATHER & LOCATION DATA
   ========================================= */
function searchFromInput() {
  const lat = latInput.value;
  const lon = longInput.value;
  if (!lat || !lon) { alert("Please enter both latitude and longitude."); return; }
  const newLatLng = new L.LatLng(lat, lon);
  map.setView(newLatLng, 13);
  marker.setLatLng(newLatLng);
  fetchWeatherData(lat, lon);
}

async function fetchWeatherData(lat, lon) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Weather fetch failed");
    const data = await res.json();
    const w = data.current_weather;

    document.getElementById('temp').textContent = `${w.temperature}`;
    document.getElementById('windspeed').textContent = `${w.windspeed}`;
    document.getElementById('winddir').textContent = `${w.winddirection}°`;
    document.getElementById('condition').textContent = getWeatherDescription(w.weathercode);
    document.getElementById('elevation').textContent = `${data.elevation} m`;

    const d = new Date(w.time);
    document.getElementById('time').textContent = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    fetchLocationName(lat, lon);
  } catch (error) { console.error(error); }
}

async function fetchLocationName(lat, lon) {
  const locEl = document.getElementById('location');
  locEl.textContent = "Loading...";
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`;
    const res = await fetch(url);
    const data = await res.json();
    if (data && data.address) {
      const city = data.address.city || data.address.town || "Unknown";
      locEl.textContent = `${city}, ${data.address.country || ''}`;
    } else { locEl.textContent = "Unknown Location"; }
  } catch (e) { locEl.textContent = `${lat}, ${lon}`; }
}

function getWeatherDescription(code) {
  const codes = {0:'Cerah', 1:'Cerah Berawan', 2:'Berawan', 3:'Mendung', 61:'Hujan', 80:'Hujan Lokal', 95:'Badai Petir'};
  return codes[code] || 'Unknown';
}


/* =========================================
   4. AUTOCOMPLETE LOGIC
   ========================================= */
searchInput.addEventListener('input', function() {
  const query = this.value;
  clearTimeout(debounceTimer);
  if (query.length < 3) { resultsList.style.display = 'none'; return; }
  debounceTimer = setTimeout(() => { fetchSuggestions(query); }, 300);
});

async function fetchSuggestions(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    showSuggestions(data);
  } catch (e) { console.error(e); }
}

function showSuggestions(data) {
  resultsList.innerHTML = '';
  if (data.length === 0) { resultsList.style.display = 'none'; return; }
  data.forEach(item => {
    const div = document.createElement('div');
    div.className = 'search-result-item';
    div.textContent = item.display_name;
    div.onclick = () => { selectLocation(item.lat, item.lon, item.display_name); };
    resultsList.appendChild(div);
  });
  resultsList.style.display = 'flex';
}

function selectLocation(lat, lon, name) {
  searchInput.value = name;
  resultsList.style.display = 'none';
  const newLatLng = new L.LatLng(lat, lon);
  map.setView(newLatLng, 13);
  marker.setLatLng(newLatLng);
  updateMainInputs(lat, lon);
  fetchWeatherData(lat, lon);
}

function updateMainInputs(lat, lon) {
  latInput.value = parseFloat(lat).toFixed(4);
  longInput.value = parseFloat(lon).toFixed(4);
}

document.addEventListener('click', function(e) {
  if (!searchInput.contains(e.target) && !resultsList.contains(e.target)) {
    resultsList.style.display = 'none';
  }
});


/* =========================================
   6. CHART CONFIGURATION (Clean White Mode)
   ========================================= */
function initChart() {
  const ctx = document.getElementById('activityChart').getContext('2d');
  
  // Gradients
  let gradientGreen = ctx.createLinearGradient(0, 0, 0, 400);
  gradientGreen.addColorStop(0, 'rgba(34, 197, 94, 0.4)');
  gradientGreen.addColorStop(1, 'rgba(34, 197, 94, 0.0)');

  let gradientBlue = ctx.createLinearGradient(0, 0, 0, 400);
  gradientBlue.addColorStop(0, 'rgba(14, 70, 163, 0.4)');
  gradientBlue.addColorStop(1, 'rgba(14, 70, 163, 0.0)');

  let gradientBrown = ctx.createLinearGradient(0, 0, 0, 400);
  gradientBrown.addColorStop(0, 'rgba(139, 69, 19, 0.4)');
  gradientBrown.addColorStop(1, 'rgba(139, 69, 19, 0.0)');

  sensorChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Temp (°C)',
          borderColor: '#0e46a3',
          backgroundColor: gradientBlue,
          borderWidth: 2,
          pointRadius: 0,       
          pointHoverRadius: 4,
          fill: true,           
          data: [],
          tension: 0.4          
        },
        {
          label: 'Humidity (%)',
          borderColor: '#22c55e',
          backgroundColor: gradientGreen,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: true,
          data: [],
          tension: 0.4
        },
        {
          label: 'Soil Moisture (%)',
          borderColor: '#8b4513',
          backgroundColor: gradientBrown,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: true,
          data: [],
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#374151' } } },
      scales: {
        x: { ticks: { color: '#6b7280', maxTicksLimit: 6 }, grid: { color: '#e5e7eb' } },
        y: { beginAtZero: true, max: 100, ticks: { color: '#6b7280' }, grid: { color: '#e5e7eb' } }
      }
    }
  });
}

async function updateChartData() {
  try {
    const response = await fetch('/history');
    const history = await response.json();
    sensorChart.data.labels = [];
    sensorChart.data.datasets[0].data = [];
    sensorChart.data.datasets[1].data = [];
    sensorChart.data.datasets[2].data = [];

    history.forEach(entry => {
      sensorChart.data.labels.push(entry.time);
      sensorChart.data.datasets[0].data.push(entry.temp);
      sensorChart.data.datasets[1].data.push(entry.hum);
      sensorChart.data.datasets[2].data.push(entry.soil);
    });
    sensorChart.update();
  } catch (e) { console.error("Chart update failed", e); }
}


/* =========================================
   7. SIMULATION TOGGLE
   ========================================= */
async function toggleSimulation() {
  const toggle = document.getElementById('simToggle');
  const isActive = toggle.checked;
  
  try {
    await fetch('/toggle-sim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: isActive })
    });
  } catch (e) {
    console.error("Toggle failed", e);
    toggle.checked = !isActive;
  }
}


/* =========================================
   5. STARTUP
   ========================================= */
window.onload = function() {
  initMap();
  initChart();
  searchFromInput();
  
  setInterval(updateRoomData, 2000);
  setInterval(updateChartData, 2000);
};