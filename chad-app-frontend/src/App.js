import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  GeoJSON,
  LayerGroup,
  useMapEvents,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import * as turf from "@turf/turf";
import "leaflet/dist/leaflet.css";
// Custom red icon for source marker
const redIcon = L.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});


// Fix Leaflet marker icon issue in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png",
});

const DISPERSION_MODELS = [
  { value: "GAUSSIAN", label: "Gaussian" },
  { value: "ALOHA", label: "ALOHA" },
];

const AI_MODELS = [
  { value: "codellama:7b", label: "CodeLLaMA 7B" },
  { value: "llama3:70b", label: "LLaMA 3 70B" },
  { value: "codellama:latest", label: "CodeLLaMA Latest" },
];

const DEFAULT_RADIUS = 2076;
const AI_ENDPOINT = "http://localhost:8000";

const POI_TYPES = [
  "school",
  "hospital",
  "restaurant",
  "fuel",
  "place_of_worship",
  "bank",
  "pharmacy",
];

const poiIcons = {
  school: L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  }),
  hospital: L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  }),
  restaurant: L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  }),
  fuel: L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  }),
  place_of_worship: L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  }),
  bank: L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  }),
  pharmacy: L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  }),
  default: L.Icon.Default,
};

function getPoiIcon(type) {
  return poiIcons[type] || poiIcons.default;
}

const AVAILABLE_COLORS = [
  "red",
  "orange",
  "green",
  "blue",
  "violet",
  "yellow",
  "grey",
  "black",
];

// Helper to build a POI icon from settings (color or custom image)
function buildPoiIcon(settings) {
  if (settings?.customIcon) {
    return L.icon({
      iconUrl: settings.customIcon,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
    });
  }
  const color = settings?.color || "blue";
  return L.icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color}.png`,
    shadowUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });
}

function LocationSelector({ onClick }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng);
    },
  });
  return null;
}

function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 0);
  }, [map]);
  return null;
}

function getStabilityClass(weather) {
  if (!weather) return "D";
  const { windSpeed, temperature } = weather;
  if (windSpeed < 2) return temperature > 25 ? "A" : "B";
  else if (windSpeed < 5) return "C";
  else if (windSpeed < 8) return "D";
  else if (windSpeed < 10) return "E";
  else return "F";
}

function calculateSigmaY(x, stability) {
  const xKm = x / 1000;
  let sigmaY;
  switch (stability) {
    case "A":
      sigmaY = 0.22 * xKm * Math.pow(1 + 0.0001 * xKm, -0.5);
      break;
    case "B":
      sigmaY = 0.16 * xKm * Math.pow(1 + 0.0001 * xKm, -0.5);
      break;
    case "C":
      sigmaY = 0.11 * xKm * Math.pow(1 + 0.0001 * xKm, -0.5);
      break;
    case "D":
      sigmaY = 0.08 * xKm * Math.pow(1 + 0.0001 * xKm, -0.5);
      break;
    case "E":
      sigmaY = 0.06 * xKm * Math.pow(1 + 0.0001 * xKm, -0.5);
      break;
    case "F":
      sigmaY = 0.04 * xKm * Math.pow(1 + 0.0001 * xKm, -0.5);
      break;
    default:
      sigmaY = 0.08 * xKm * Math.pow(1 + 0.0001 * xKm, -0.5);
  }
  return sigmaY * 1000;
}

function generateWedgePlume(center, bearing, length) {
  if (!center || bearing === null) return null;

  const points = 10;
  const rad = (bearing * Math.PI) / 180;
  const lat0 = center.lat;
  const lng0 = center.lng;

  const toLat = (m) => m / 111320;
  const toLng = (m, lat) => m / (111320 * Math.cos((lat * Math.PI) / 180));
  const stability = "D";

  let leftEdge = [];
  let rightEdge = [];

  for (let i = 0; i <= points; i++) {
    const dist = length * (i / points);
    const sigmaY = calculateSigmaY(dist, stability);
    const width = sigmaY * 3;

    const baseLat = lat0 + toLat(dist * Math.sin(rad));
    const baseLng = lng0 + toLng(dist * Math.cos(rad), lat0);

    const leftLat = baseLat + toLat(width * Math.sin(rad + Math.PI / 2));
    const leftLng = baseLng + toLng(width * Math.cos(rad + Math.PI / 2), lat0);

    const rightLat = baseLat + toLat(width * Math.sin(rad - Math.PI / 2));
    const rightLng = baseLng + toLng(width * Math.cos(rad - Math.PI / 2), lat0);

    leftEdge.push([leftLat, leftLng]);
    rightEdge.push([rightLat, rightLng]);
  }

  return [...leftEdge, ...rightEdge.reverse(), leftEdge[0]];
}

function calculateConcentration(Q, U, x, y) {
  if (x <= 0 || U <= 0) return 0;
  const sigmaY = calculateSigmaY(x, "D"); // Use default stability D
  const denom = Math.sqrt(2 * Math.PI) * sigmaY;
  const expTerm = Math.exp(-(y * y) / (2 * sigmaY * sigmaY));
  return (Q / (U * denom)) * expTerm;
}

export default function App() {
  const [form, setForm] = useState({
    chemicalName: "",
    dispersionModel: DISPERSION_MODELS[0].value,
    aiModel: AI_MODELS[0].value,
    latitude: "",
    longitude: "",
    sourceType: "GAS",
    rate: "",
    poiRadius: DEFAULT_RADIUS,
    weather: null,
    chemicalData: null,
  });

  const [poiSettings, setPoiSettings] = useState(
    POI_TYPES.reduce((acc, type) => {
      acc[type] = { color: "blue", customIcon: null };
      return acc;
    }, {})
  );

  const [markerPos, setMarkerPos] = useState(null);
  const [pois, setPois] = useState([]);
  const [selectedPois, setSelectedPois] = useState(POI_TYPES);
  const [receptors, setReceptors] = useState([]);
  const [plume, setPlume] = useState(null);
  const [analysis, setAnalysis] = useState("");
  const [impactedPOIs, setImpactedPOIs] = useState([]);

  const [chemicalProperties, setChemicalProperties] = useState({});
  const [showDownwindCorridor, setShowDownwindCorridor] = useState(true);

  const mapRef = useRef();

  // Handlers

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const togglePoiSelection = (type) => {
    setSelectedPois((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const onDrag = (e) => {
    const latlng = e.target.getLatLng();
    setMarkerPos(latlng);
    setForm((f) => ({
      ...f,
      latitude: latlng.lat.toFixed(6),
      longitude: latlng.lng.toFixed(6),
      chemicalData: null,
      weather: null,
    }));
  };

  const onMarkerUpdate = (latlng) => {
    setMarkerPos(latlng);
    setForm((f) => ({
      ...f,
      latitude: latlng.lat.toFixed(6),
      longitude: latlng.lng.toFixed(6),
      chemicalData: null,
      weather: null,
    }));
    // setPlume(null); // keep plume persistent until Clear
    setAnalysis("");
  };

  async function getChemicalProperties(name) {
    if (chemicalProperties[name]) {
      return chemicalProperties[name];
    }
    try {
      const res = await fetch(`${AI_ENDPOINT}/chemicals/?name=${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error("Failed fetching chemical data");
      const json = await res.json();
      setChemicalProperties((prev) => ({
        ...prev,
        [name]: json.data || json,
      }));
      setForm((f) => ({ ...f, chemicalData: json.data || json }));
      return json.data || json;
    } catch (error) {
      console.error("Failed to fetch chemical properties", error);
      return null;
    }
  }

  const fetchPois = useCallback(
    async (polygon) => {
      if (!polygon) return;

      const validPoints = polygon.filter(
        (pt) => Array.isArray(pt) && pt.length === 2 && pt.every((c) => typeof c === "number")
      );
      if (validPoints.length === 0) return;

      const polygonStr = validPoints.map((p) => p.join(" ")).join(" ");
      const query = `[out:json][timeout:25];(node["amenity"](poly:"${polygonStr}");way["amenity"](poly:"${polygonStr}");relation["amenity"](poly:"${polygonStr}"););out center;`;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: query,
          });
          if (!res.ok) throw new Error("Overpass API error");
          const data = await res.json();

          const filtered = data.elements
            .map((el) => ({
              id: el.id,
              type: el.tags?.amenity || "other",
              name: el.tags?.name || "Unnamed",
              lat: el.lat ?? el.center?.lat,
              lon: el.lon ?? el.center?.lon,
            }))
            .filter((p) => p.lat && p.lon && selectedPois.includes(p.type));

          setPois(filtered);
          setReceptors(filtered);
          return;
        } catch (e) {
          if (attempt === 2) {
            setPois([]);
            setReceptors([]);
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    },
    [selectedPois]
  );

  useEffect(() => {
    if (!markerPos || !form.weather?.windDirection) {
      setPlume(null);
      setPois([]);
      setReceptors([]);
      setImpactedPOIs([]);
      return;
    }

    const wedge = generateWedgePlume(markerPos, form.weather.windDirection, 4000);
    if (!wedge) return;

    setPlume({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [wedge.map((p) => [p[1], p[0]])], // flip lat,lng to lng,lat
      },
      properties: {},
    });

    fetchPois(wedge);

    if (mapRef.current) {
      const layer = L.geoJSON({
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [wedge.map((p) => [p[1], p[0]])],
        },
      });
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds);
      }
    }
  }, [markerPos, form.weather, fetchPois]);

  const extractImpactedPois = useCallback(() => {
    if (!plume || !pois.length || !form.weather || !markerPos) return [];
    try {
      const stability = getStabilityClass(form.weather);
      const windRad = (form.weather.windDirection * Math.PI) / 180;
      const sourcePt = turf.point([markerPos.lng, markerPos.lat]);
      const poly = turf.feature(plume.geometry);
      return pois
        .filter((p) => turf.booleanPointInPolygon(turf.point([p.lon, p.lat]), poly))
        .map((p) => {
          const receptor = turf.point([p.lon, p.lat]);
          const dist = turf.distance(sourcePt, receptor, { units: "meters" });
          const dx = (p.lon - markerPos.lng) * 111320 * Math.cos((markerPos.lat * Math.PI) / 180);
          const dy = (p.lat - markerPos.lat) * 111320;
          const crossWindDist = dx * Math.sin(windRad) - dy * Math.cos(windRad);
          const conc = calculateConcentration(Number(form.rate), form.weather.windSpeed || 1, dist, crossWindDist);
          return { ...p, maxConcentration: conc.toFixed(6) };
        });
    } catch {
      return [];
    }
  }, [plume, pois, form.weather, form.rate, markerPos]);

  useEffect(() => {
    if (!plume) {
      setImpactedPOIs([]);
      setAnalysis("");
      return;
    }
    const impacted = extractImpactedPois();
    setImpactedPOIs(impacted);
    if (impacted.length === 0) setAnalysis("No impacted locations within downwind corridor.");
    else
      setAnalysis(
        `Potentially impacted locations within downwind corridor:\n${impacted
          .map(
            (p, i) =>
              `${i + 1}. ${p.name} (${p.type}) - Estimated Concentration: ${p.maxConcentration}`
          )
          .join("\n")}`
      );
  }, [plume, extractImpactedPois]);

  async function fetchAIAnalysis(plumeData, receptors, hazardSummary) {
    if (!plumeData || !hazardSummary) {
      setAnalysis("Insufficient data.");
      return;
    }
    let receptorNames = receptors.map((r) => r.name).join(", ") || "none";
    let prompt = `Analyze the impact of the chemical plume.\nPlume: ${JSON.stringify(
      plumeData
    )}\nReceptors: ${receptorNames}\nHazard Summary: ${hazardSummary}`;
    try {
      let response = await fetch(AI_ENDPOINT + "/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: form.aiModel, prompt, stream: false }),
      });
      if (!response.ok) throw new Error("AI service error");
      let data = await response.json();
      setAnalysis(data.response || "No response");
    } catch {
      setAnalysis("AI analysis failed.");
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.chemicalName || !form.latitude || !form.longitude || !form.rate) {
      alert("Fill all required fields");
      return;
    }
    const chemProps = await getChemicalProperties(form.chemicalName);
    if (!chemProps) {
      alert("Chemical data fetch failed");
      return;
    }
    try {
      const resp = await fetch("/api/dispersion/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chemicalName: form.chemicalName,
          model: form.dispersionModel,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
          sourceType: form.sourceType,
          rate: Number(form.rate),
          incident: "gas",
          chemicalProperties: chemProps,
        }),
      });
      if (!resp.ok) throw new Error("Dispersion Calculation Error");
      const data = await resp.json();
      setPlume(data.geoJsonPlume ? JSON.parse(data.geoJsonPlume) : plume);
      fetchAIAnalysis(data.geoJsonPlume, receptors, data.hazardSummary);
    } catch (error) {
      alert(error.message);
    }
  }

  function onClear() {
    setForm({
      chemicalName: "",
      dispersionModel: DISPERSION_MODELS[0].value,
      aiModel: AI_MODELS[0].value,
      latitude: "",
      longitude: "",
      sourceType: "GAS",
      rate: "",
      poiRadius: DEFAULT_RADIUS,
      weather: null,
      chemicalData: null,
    });
    setMarkerPos(null);
    setPois([]);
    setReceptors([]);
    // setPlume(null); // keep plume persistent until Clear
    setImpactedPOIs([]);
    setSelectedPois(POI_TYPES);
    setAnalysis("");
  }

  // Poll weather data every 15s when lat/lon changes
  useEffect(() => {
    if (!form.latitude || !form.longitude) return;
    let canceled = false;

    async function fetchWeather() {
      try {
        let res = await fetch(`https://api.weather.gov/points/${form.latitude},${form.longitude}`);
        if (!res.ok) throw new Error("Weather API Error");
        let data = await res.json();
        if (!data.properties.observationStations) throw new Error("No stations");
        let stationsRes = await fetch(data.properties.observationStations);
        if (!stationsRes.ok) throw new Error("Stations API Error");
        let stationsData = await stationsRes.json();
        if (!stationsData.features.length) throw new Error("No stations returned");
        let stationId = stationsData.features[0].id;
        let obsRes = await fetch(stationId + "/observations/latest");
        if (!obsRes.ok) throw new Error("Observation API Error");
        let obsData = await obsRes.json();
        if (canceled) return;
        setForm((f) => ({
          ...f,
          weather: {
            temperature: obsData.properties.temperature?.value,
            humidity: obsData.properties.relativeHumidity?.value,
            windSpeed: obsData.properties.windSpeed?.value,
            windDirection: obsData.properties.windDirection?.value,
            condition: obsData.properties.textDescription,
          },
        }));
      } catch {
        if (!canceled) setForm(f => ({ ...f, weather: null }));
      }
    }

    fetchWeather();
    const interval = setInterval(fetchWeather, 15000);

    return () => {
      canceled = true;
      clearInterval(interval);
    };
  }, [form.latitude, form.longitude]);

  const visiblePois = pois.filter((p) => p.lat && p.lon && selectedPois.includes(p.type));

  const POIMarkers = () => (
    <LayerGroup>
      {visiblePois.map((poi) => (
        <Marker key={poi.id} position={[poi.lat, poi.lon]} icon={buildPoiIcon(poiSettings[poi.type])}>
          <Popup>
            <b>{poi.name}</b><br />
            Type: {poi.type}<br />
            Exposure: {(() => {
              const matched = impactedPOIs.find((i) => i.id === poi.id);
              return matched ? matched.maxConcentration : "N/A";
            })()}
          </Popup>
        </Marker>
      ))}
    </LayerGroup>
  );

  const DownwindCorridor = () => (
    plume && showDownwindCorridor ? (
      <GeoJSON
        data={plume}
        style={{
          color: "blue",
          weight: 3,
          opacity: 0.7,
          fillOpacity: 0.3,
          fillColor: "lightblue",
        }}
      />
    ) : null
  );

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "Arial, sans-serif" }}>
      <aside
        style={{
          width: 320,
          backgroundColor: "#fafafa",
          padding: 20,
          overflowY: "auto",
          boxShadow: "2px 0 5px rgba(0,0,0,0.1)",
          zIndex: 2000,
        }}
      >
        <h2>Controls</h2>
        <form onSubmit={onSubmit}>
          <label>
            Chemical Name
            <input name="chemicalName" value={form.chemicalName} onChange={onChange} required />
          </label>
          <label>
            Dispersion Model
            <select name="dispersionModel" value={form.dispersionModel} onChange={onChange}>
              {DISPERSION_MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
          <label>
            Source Type
            <select name="sourceType" value={form.sourceType} onChange={onChange}>
              <option value="GAS">Gas</option>
              <option value="LIQUID">Liquid</option>
              <option value="CHEMICAL">Chemical</option>
            </select>
          </label>
          <label>
            Emission Rate
            <input name="rate" type="number" value={form.rate} onChange={onChange} step="any" required />
          </label>
          <label>
            AI Model
            <select name="aiModel" value={form.aiModel} onChange={onChange}>
              {AI_MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
          <button type="submit">Calculate</button> <button type="button" onClick={onClear}>Clear</button>
        </form>

        {form.chemicalData && (
          <div style={{ marginTop: 20, maxHeight: 200, overflowY: "auto", backgroundColor: "#f0f0f0", padding: 10, borderRadius: 6 }}>
            <h3>Chemical Properties</h3>
            <ul style={{ paddingLeft: 0, listStyle: "none", fontSize: 12 }}>
              {Object.entries(form.chemicalData).map(([key, val]) => (
                <li key={key}><b>{key.replace(/_/g, " ")}:</b> {val?.toString() || "-"}</li>
              ))}
            </ul>
          </div>
        )}

        <h3 style={{ marginTop: 20 }}>Weather</h3>
        {form.weather ? (
          <div>
            <p>Temperature: {form.weather.temperature?.toFixed(1)} °C</p>
            <p>Humidity: {form.weather.humidity?.toFixed(1)}%</p>
            <p>Wind Speed: {form.weather.windSpeed?.toFixed(1)} m/s</p>
            <p>Wind Direction: {form.weather.windDirection}°</p>
            <p>Condition: {form.weather.condition}</p>
          </div>
        ) : (
          <p>No weather data available</p>
        )}

        <h3 style={{ marginTop: 20 }}>Layers</h3>
        <label>
          <input type="checkbox" checked={showDownwindCorridor} onChange={() => setShowDownwindCorridor(!showDownwindCorridor)} />
          Show Downwind Corridor
        </label>

        <h3 style={{ marginTop: 20 }}>Points of Interest</h3>
        
{POI_TYPES.map((type) => (
  <div key={type} style={{ marginBottom: 12 }}>
    <label>
      <input
        type="checkbox"
        checked={selectedPois.includes(type)}
        onChange={() => togglePoiSelection(type)}
      />
      {type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ")}
    </label>
    <div>
      <label>Color: </label>
      <select
        value={poiSettings[type]?.color || "blue"}
        onChange={(e) =>
          setPoiSettings((prev) => ({
            ...prev,
            [type]: { ...prev[type], color: e.target.value },
          }))
        }
      >
        {AVAILABLE_COLORS.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
    <div>
      <label>Custom Icon: </label>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              setPoiSettings((prev) => ({
                ...prev,
                [type]: { ...prev[type], customIcon: ev.target.result },
              }));
            };
            reader.readAsDataURL(file);
          }
        }}
      />
    </div>
  </div>
))}


        <h3 style={{ marginTop: 20 }}>Analysis</h3>
        <textarea
          readOnly
          value={analysis}
          style={{ width: "100%", height: 100, fontFamily: "monospace", whiteSpace: "pre-wrap", backgroundColor: "#eee" }}
        />
      </aside>

      <main style={{ flex: 1 }}>
        <MapContainer
          center={form.latitude && form.longitude ? [Number(form.latitude), Number(form.longitude)] : [29.76, -95.37]}
          zoom={12}
          style={{ height: "100%", width: "100%" }}
          whenCreated={(mapInstance) => (mapRef.current = mapInstance)}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {markerPos && (
            <Marker position={[markerPos.lat, markerPos.lng]} draggable icon={redIcon} eventHandlers={{ dragend: onDrag }}>
              <Popup>Release Source</Popup>
            </Marker>
          )}
          <POIMarkers />
          <DownwindCorridor />
          <LocationSelector onClick={onMarkerUpdate} />
          <ResizeFix />
        </MapContainer>
      </main>
    </div>
  );
}
