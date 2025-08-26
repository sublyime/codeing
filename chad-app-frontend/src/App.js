import React, { useState, useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  GeoJSON,
  LayersControl,
  LayerGroup,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Override Leaflet default icon paths to CDN URLs
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png",
});

// POI Icons (same as before)
const poiIcons = {
  school: L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-green.png", iconSize: [25,41], iconAnchor: [12,41], popupAnchor: [1,-34]}),
  hospital: L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-red.png", iconSize: [25,41], iconAnchor: [12,41], popupAnchor: [1,-34]}),
  restaurant: L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-orange.png", iconSize: [25,41], iconAnchor: [12,41], popupAnchor: [1,-34]}),
  fuel: L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-yellow.png", iconSize: [25,41], iconAnchor: [12,41], popupAnchor: [1,-34]}),
  place_of_worship: L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-violet.png", iconSize: [25,41], iconAnchor: [12,41], popupAnchor: [1,-34]}),
  bank: L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-grey.png", iconSize: [25,41], iconAnchor: [12,41], popupAnchor: [1,-34]}),
  pharmacy: L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-blue.png", iconSize: [25,41], iconAnchor: [12,41], popupAnchor: [1,-34]}),
  default: L.Icon.Default.prototype,
};
const getPoiIcon = (type) => poiIcons[type] || poiIcons.default;

// Dispersion models supported by your backend
const DISPERSION_MODELS = [
  { value: "GAUSSIAN", label: "Gaussian" },
  { value: "ALOHA", label: "ALOHA" },
];

// Ollama AI models you have installed
const AI_MODELS = [
  { value: "codellama:7b", label: "CodeLlama 7b" },
  { value: "llama3:70b", label: "LLaMA 3 70b" },
  { value: "codellama:latest", label: "CodeLlama latest" },
];

const sourceOptions = {
  GAS: { label: "Gas", rateLabel: "Source Concentration (ppm)" },
  LIQUID: { label: "Liquid", rateLabel: "Source Volume (liters/sec)" },
  CHEMICAL: { label: "Chemical", rateLabel: "Mass (kg)" },
};

const POI_TYPES = [
  "school",
  "hospital",
  "restaurant",
  "fuel",
  "place_of_worship",
  "bank",
  "pharmacy",
];

const DEFAULT_RADIUS = 8046;
const AI_BASE_URL = "http://localhost:11434";
const AI_GENERATE_ENDPOINT = `${AI_BASE_URL}/api/generate`;

// Map events handler
function LocationSelector({ onClick }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng);
    },
  });
  return null;
}

export default function App() {
  const [form, setForm] = useState({
    chemicalName: "",
    dispersionModel: "GAUSSIAN", // For backend calculation
    aiModel: "codellama:7b",     // For AI analysis
    latitude: "",
    longitude: "",
    sourceType: "GAS",
    rate: "",
    poiRadius: DEFAULT_RADIUS,
    weather: null,
  });

  const [markerPos, setMarkerPos] = useState(null);
  const [pois, setPois] = useState([]);
  const [selectedPois, setSelectedPois] = useState([]);
  const [receptors, setReceptors] = useState([]);
  const [plume, setPlume] = useState(null);
  const [analysis, setAnalysis] = useState("");
  const mapRef = useRef();

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const togglePoi = (type) => {
    setSelectedPois((sp) =>
      sp.includes(type) ? sp.filter((t) => t !== type) : [...sp, type]
    );
  };

  const onRadiusChange = (e) => {
    const val = Number(e.target.value);
    if (!isNaN(val) && val > 10) {
      setForm((f) => ({ ...f, poiRadius: val }));
      if (markerPos) {
        fetchPois(markerPos.lat, markerPos.lng, val);
      }
    }
  };

  const onMapClick = (latlng) => {
    setMarkerPos(latlng);
    setForm((f) => ({
      ...f,
      latitude: latlng.lat.toFixed(6),
      longitude: latlng.lng.toFixed(6),
      weather: null,
    }));
    fetchPois(latlng.lat, latlng.lng, form.poiRadius);
    setPlume(null);
    setAnalysis("");
  };

  const onDrag = (e) => {
    onMapClick(e.target.getLatLng());
  };

  async function fetchPois(lat, lon, radius){
    // Same retry logic as before...
    const query = `[out:json][timeout:25];
      (
        node["amenity"](around:${radius},${lat},${lon});
        way["amenity"](around:${radius},${lat},${lon});
        relation["amenity"](around:${radius},${lat},${lon});
      );
      out center;`;
    const maxRetries = 3;
    for(let attempt=1; attempt<=maxRetries; attempt++){
      try {
        const res = await fetch("https://overpass-api.de/api/interpreter", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: query,
        });
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const cleaned = data.elements.map(el => ({
          id: el.id,
          name: el.tags?.name || "Unnamed",
          type: el.tags?.amenity || "other",
          lat: el.lat ?? el.center?.lat,
          lon: el.lon ?? el.center?.lon,
        })).filter(p => p.lat && p.lon);
        setPois(cleaned);
        setReceptors(cleaned);
        return;
      } catch(e) {
        if(attempt === maxRetries){
          setPois([]);
          setReceptors([]);
          alert("Failed to load POIs after several attempts.");
        } else {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }
  }

  // Fixed weather fetch with correct station URL extraction
  useEffect(() => {
    async function fetchWeather() {
      if(!form.latitude || !form.longitude){
        setForm(f => ({...f, weather: null}));
        return;
      }
      try {
        const res = await fetch(`https://api.weather.gov/points/${form.latitude},${form.longitude}`);
        if(!res.ok) throw new Error("Failed to get points");
        const data = await res.json();
        if(!data.properties?.observationStations) throw new Error("No observation stations");
        const stationsRes = await fetch(data.properties.observationStations);
        if(!stationsRes.ok) throw new Error("Failed to get stations");
        const stationsData = await stationsRes.json();
        if(!stationsData.features?.length) throw new Error("No stations found");
        const stationUrl = stationsData.features[0].id;
        const obsRes = await fetch(`${stationUrl}/observations/latest`);
        if(!obsRes.ok) throw new Error("Failed to get latest observation");
        const obsData = await obsRes.json();
        const p = obsData.properties;
        setForm(f => ({
          ...f,
          weather: {
            temperature: p.temperature?.value,
            humidity: p.relativeHumidity?.value,
            windSpeed: p.windSpeed?.value,
            windDirection: p.windDirection?.value,
            condition: p.textDescription,
          },
        }));
      } catch (e) {
        console.error("Weather error:", e);
        alert("Failed to load weather data.");
      }
    }
    fetchWeather();
  }, [form.latitude, form.longitude]);

  async function fetchAnalysis(plume, receptors, summary) {
    if(!plume || !summary){
      setAnalysis("Insufficient data");
      return;
    }
    try {
      const prompt = `Environmental hazard analysis:\n${JSON.stringify(plume)}\n${JSON.stringify(receptors)}\n${JSON.stringify(summary)}\nPlease respond concisely.`;
      const res = await fetch(AI_GENERATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: form.aiModel,
          prompt,
          stream: false,
        }),
      });
      if(!res.ok) throw new Error(`AI API error: ${res.status}`);
      const data = await res.json();
      setAnalysis(data.response||"No response");
    } catch(e) {
      console.error("AI analysis error:", e);
      setAnalysis("AI analysis failed.");
    }
  }

  async function onSubmit(e){
    e.preventDefault();
    if(!form.chemicalName || !form.latitude || !form.longitude || !form.rate){
      alert("Please fill all required fields.");
      return;
    }
    try {
      const resp = await fetch("/api/dispersion/calculate", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          chemicalName: form.chemicalName,
          model: form.dispersionModel,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
          sourceType: form.sourceType,
          rate: Number(form.rate),
          incident: "gas",
        }),
      });
      if(!resp.ok) throw new Error("Dispersion API error");
      const data = await resp.json();
      setPlume(data.geoJsonPlume ? JSON.parse(data.geoJsonPlume) : null);
      await fetchAnalysis(data.geoJsonPlume, receptors, data.hazardSummary);
    } catch(e){
      alert(e.message);
    }
  }

  function onClear(){
    setForm({
      chemicalName: "",
      dispersionModel: "GAUSSIAN",
      aiModel: "codellama:7b",
      latitude: "",
      longitude: "",
      sourceType: "GAS",
      rate: "",
      poiRadius: DEFAULT_RADIUS,
      weather: null,
    });
    setMarkerPos(null);
    setPois([]);
    setReceptors([]);
    setPlume(null);
    setSelectedPois([]);
    setAnalysis("");
  }

  return (
    <>
      <header style={{padding:16, backgroundColor:"#222", color:"white", fontWeight:"bold"}}>
        Chemical Dispersion Application
      </header>
      <div style={{display:"flex", height:"calc(100vh - 64px)"}}>
        <aside style={{width:420, padding:20, backgroundColor:"#f7f7f7", borderRight:"1px solid #ccc", overflowY:"auto", boxSizing:"border-box"}}>
          <form onSubmit={onSubmit} style={{display:"flex", flexDirection:"column", gap:12}}>
            <label>Chemical Name *</label>
            <input name="chemicalName" value={form.chemicalName} onChange={onChange} required />

            <label>Dispersion Model</label>
            <select name="dispersionModel" value={form.dispersionModel} onChange={onChange}>
              {DISPERSION_MODELS.map(m => (<option key={m.value} value={m.value}>{m.label}</option>))}
            </select>

            <label>AI Model</label>
            <select name="aiModel" value={form.aiModel} onChange={onChange}>
              {AI_MODELS.map(m => (<option key={m.value} value={m.value}>{m.label}</option>))}
            </select>

            <label>Source Type *</label>
            <select name="sourceType" value={form.sourceType} onChange={onChange}>
              {Object.entries(sourceOptions).map(([key, val]) => (<option key={key} value={key}>{val.label}</option>))}
            </select>

            <label>{sourceOptions[form.sourceType]?.rateLabel}</label>
            <input name="rate" value={form.rate} onChange={onChange} />

            <label>Latitude</label>
            <input name="latitude" value={form.latitude} readOnly />

            <label>Longitude</label>
            <input name="longitude" value={form.longitude} readOnly />

            <label>POI Radius</label>
            <input name="poiRadius" value={form.poiRadius} type="number" min={10} max={100000} onChange={onRadiusChange} />

            <label>Toggle POI Types</label>
            <div style={{display:"flex", flexWrap:"wrap", gap:10}}>
              {POI_TYPES.map(type => (
                <label key={type} style={{flexBasis:"45%"}}>
                  <input type="checkbox" checked={selectedPois.includes(type)} onChange={() => togglePoi(type)} />
                  {" "+type.replace(/_/g," ")}
                </label>
              ))}
            </div>

            <section style={{marginTop:20, whiteSpace:"pre-wrap", fontFamily:"monospace", maxHeight:200, overflowY:"auto", backgroundColor:"#fff", borderRadius:6, border:"1px solid #ccc", padding:10}}>
              <h3>Analysis</h3>
              {analysis}
            </section>

            <section style={{marginTop:20, backgroundColor:"#fff", padding:10, borderRadius:6, border:"1px solid #ccc"}}>
              <h3>Weather</h3>
              <p>Temperature: {form.weather?.temperature ? form.weather.temperature.toFixed(1)+" °C" : "N/A"}</p>
              <p>Humidity: {form.weather?.humidity ?? "N/A"}</p>
              <p>Wind: {form.weather?.windSpeed ? form.weather.windSpeed.toFixed(1)+" m/s" : "N/A"}, Direction: {form.weather?.windDirection ?? "N/A"}</p>
              <p>Condition: {form.weather?.condition ?? "N/A"}</p>
            </section>

            <div style={{marginTop:20}}>
              <button type="submit" style={{marginRight:10}}>Calculate</button>
              <button type="button" onClick={onClear}>Clear</button>
            </div>
          </form>
        </aside>
        <main style={{flexGrow:1}}>
          <MapContainer center={[39.9526, -75.165]} zoom={12} style={{height:"calc(100vh - 64px)", width:"100%"}} whenCreated={map => (mapRef.current = map)}>
            <LayersControl position="topright">
              <LayersControl.BaseLayer name="OpenStreetMap" checked>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              </LayersControl.BaseLayer>
              <LayersControl.Overlay name="Dispersion" checked>
                {plume && <GeoJSON data={plume} style={{color:"red", weight:3, opacity:0.5}} />}
              </LayersControl.Overlay>
              <LayersControl.Overlay name="Points of Interest" checked>
                <LayerGroup>
                  {pois.filter(p => selectedPois.includes(p.type)).map(p => (
                    <Marker key={p.id} position={[p.lat, p.lon]} icon={getPoiIcon(p.type)}>
                      <Popup><strong>{p.name}</strong><br/>{p.type}</Popup>
                    </Marker>
                  ))}
                </LayerGroup>
              </LayersControl.Overlay>
              <LayersControl.Overlay name="Release Location" checked>
                {markerPos && <Marker position={markerPos} draggable eventHandlers={{dragend: onDrag}} />}
              </LayersControl.Overlay>
            </LayersControl>
            <LocationSelector onClick={onMapClick} />
          </MapContainer>
        </main>
      </div>
    </>
  );
}
