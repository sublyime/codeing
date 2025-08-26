import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  GeoJSON,
  LayersControl,
  LayerGroup,
  useMapEvents,
  Polyline,
} from "react-leaflet";
import L from "leaflet";
import * as turf from "@turf/turf";
import "leaflet/dist/leaflet.css";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png",
});

const poiIcons = {
  school: L.icon({
    iconUrl:
      "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-green.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  }),
  hospital: L.icon({
    iconUrl:
      "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-red.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  }),
  restaurant: L.icon({
    iconUrl:
      "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-orange.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  }),
  fuel: L.icon({
    iconUrl:
      "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-yellow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  }),
  place_of_worship: L.icon({
    iconUrl:
      "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-violet.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  }),
  bank: L.icon({
    iconUrl:
      "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-grey.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  }),
  pharmacy: L.icon({
    iconUrl:
      "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-blue.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  }),
  default: L.Icon.Default.prototype,
};

const getPoiIcon = (type) => poiIcons[type] || poiIcons.default;

const DISPERSION_MODELS = [
  { value: "GAUSSIAN", label: "Gaussian" },
  { value: "ALOHA", label: "ALOHA" },
];

const AI_MODELS = [
  { value: "codellama:7b", label: "CodeLlama 7B" },
  { value: "llama3:70b", label: "Llama 3 70B" },
  { value: "codellama:latest", label: "CodeLlama Latest" },
];

const POI_TYPES = [
  "school",
  "hospital",
  "restaurant",
  "fuel",
  "place_of_worship",
  "bank",
  "pharmacy",
];

const sourceOptions = {
  GAS: { label: "Gas", rateLabel: "Source Concentration (ppm)" },
  LIQUID: { label: "Liquid", rateLabel: "Source Volume (liters/sec)" },
  CHEMICAL: { label: "Chemical", rateLabel: "Mass (kg)" },
};

const DEFAULT_RADIUS = 8046;
const AI_BASE_URL = "http://localhost:11434";
const AI_GENERATE_ENDPOINT = `${AI_BASE_URL}/api/generate`;

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
    dispersionModel: DISPERSION_MODELS[0].value,
    aiModel: AI_MODELS[0].value,
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
  const [downwindCorridor, setDownwindCorridor] = useState(null);

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
    setPlume(null);
    setAnalysis("");
    setDownwindCorridor(null);
    fetchPois(latlng.lat, latlng.lng, form.poiRadius);
  };

  const onDrag = (e) => {
    onMapClick(e.target.getLatLng());
  };

  async function fetchPois(lat, lon, radius) {
    const query = `[out:json][timeout:25];
      (
        node["amenity"](around:${radius},${lat},${lon});
        way["amenity"](around:${radius},${lat},${lon});
        relation["amenity"](around:${radius},${lat},${lon});
      );
      out center;`;

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch("https://overpass-api.de/api/interpreter", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: query,
        });
        if (!res.ok) throw new Error(`Overpass API error: ${res.status}`);
        const data = await res.json();
        const cleaned = data.elements
          .map((el) => ({
            id: el.id,
            name: el.tags?.name || "Unnamed",
            type: el.tags?.amenity || "other",
            lat: el.lat ?? el.center?.lat,
            lon: el.lon ?? el.center?.lon,
          }))
          .filter((p) => p.lat && p.lon);
        setPois(cleaned);
        setReceptors(cleaned);
        return;
      } catch (err) {
        if (attempt === maxRetries) {
          setPois([]);
          setReceptors([]);
          alert("Failed to load Points of Interest after multiple attempts");
        } else {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }
  }

  useEffect(() => {
    if (!form.latitude || !form.longitude) return;

    let canceled = false;

    async function fetchWeather() {
      try {
        const res = await fetch(
          `https://api.weather.gov/points/${form.latitude},${form.longitude}`
        );
        if (!res.ok) throw new Error("Failed to get points");
        const data = await res.json();

        if (!data.properties?.observationStations)
          throw new Error("No Observation Stations");

        const stationsRes = await fetch(data.properties.observationStations);
        if (!stationsRes.ok) throw new Error("Failed to get stations");

        const stationsData = await stationsRes.json();

        if (!stationsData.features?.length) throw new Error("No stations found");

        const stationUrl = stationsData.features[0].id;

        const obsRes = await fetch(`${stationUrl}/observations/latest`);
        if (!obsRes.ok) throw new Error("Failed to get latest observation");

        const obsData = await obsRes.json();

        if (canceled) return;

        const p = obsData.properties;

        setForm((f) => ({
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
        console.error("Weather fetch error:", e);
        if (!canceled) setForm((f) => ({ ...f, weather: null }));
      }
    }

    fetchWeather();
    const interval = setInterval(fetchWeather, 15000);
    return () => {
      canceled = true;
      clearInterval(interval);
    };
  }, [form.latitude, form.longitude]);

  useEffect(() => {
    if (!markerPos || !form.weather?.windDirection || !form.weather?.windSpeed) {
      setDownwindCorridor(null);
      return;
    }

    const lengthMeters = 4000;
    const widthMeters = 500;

    const windBearing = (form.weather.windDirection + 180) % 360;
    const rad = (windBearing * Math.PI) / 180;

    const metersToLat = (m) => m / 111320;
    const metersToLng = (m, lat) => m / (111320 * Math.cos((lat * Math.PI) / 180));

    const startLat = markerPos.lat;
    const startLng = markerPos.lng;

    const lengthLat = Math.sin(rad) * metersToLat(lengthMeters);
    const lengthLng = Math.cos(rad) * metersToLng(lengthMeters, startLat);

    const widthLat = Math.sin(rad + Math.PI / 2) * metersToLat(widthMeters);
    const widthLng = Math.cos(rad + Math.PI / 2) * metersToLng(widthMeters, startLat);

    const polygon = [
      [startLat + widthLat, startLng + widthLng],
      [startLat + lengthLat + widthLat, startLng + lengthLng + widthLng],
      [startLat + lengthLat - widthLat, startLng + lengthLng - widthLng],
      [startLat - widthLat, startLng - widthLng],
      [startLat + widthLat, startLng + widthLng], // close polygon
    ];

    setDownwindCorridor(polygon);
  }, [markerPos, form.weather]);

  const extractImpactedPOIs = useCallback(() => {
    if (!plume || !pois.length) return [];

    try {
      const plumePolygon = plume;

      return pois
        .filter((poi) => {
          if (!poi.lat || !poi.lon) return false;
          const pt = turf.point([poi.lon, poi.lat]);
          return turf.booleanPointInPolygon(pt, plumePolygon);
        })
        .map((poi) => ({
          name: poi.name,
          type: poi.type,
          maxConcentration: 42.5,
        }));
    } catch (e) {
      console.error("Error checking POIs inside plume polygon:", e);
      return [];
    }
  }, [plume, pois]);

  useEffect(() => {
    const impacted = extractImpactedPOIs();
    if (impacted.length) {
      const impactSummary =
        "\nImpacted locations:\n" +
        impacted
          .map(
            (p, idx) =>
              `${idx + 1}. ${p.name} (${p.type}) — Max Concentration: ${p.maxConcentration}`
          )
          .join("\n");
      setAnalysis((prev) => (prev ? prev + "\n\n" : "") + impactSummary);
    }
  }, [extractImpactedPOIs]);

  async function fetchAnalysis(plumeData, receptorsData, hazardSummary) {
    if (!plumeData || !hazardSummary) {
      setAnalysis("Insufficient data for analysis.");
      return;
    }
    try {
      const impacted = extractImpactedPOIs();
      const impactedText =
        impacted.length === 0
          ? "No impacted locations identified."
          : impacted
              .map(
                (p) =>
                  `- ${p.name} (${p.type}), Max Concentration: ${p.maxConcentration}`
              )
              .join("\n");

      const prompt = `
You are an environmental analyst. Given the following chemical plume data:

${JSON.stringify(plumeData)}

And receptors information:

${JSON.stringify(receptorsData)}

Summary of hazard:

${hazardSummary}

Impacted locations:

${impactedText}

Analyze the potential health impact at each location. Provide a clear, concise summary.
`;

      const response = await fetch(AI_GENERATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: form.aiModel,
          prompt,
          stream: false,
        }),
      });
      if (!response.ok) throw new Error(`AI API error ${response.status}`);
      const data = await response.json();
      setAnalysis(data.response || "No response from analysis.");
    } catch (e) {
      console.error("Error in AI analysis:", e);
      setAnalysis("AI analysis failed to complete.");
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.chemicalName || !form.latitude || !form.longitude || !form.rate) {
      alert("Please fill all required fields.");
      return;
    }
    try {
      const res = await fetch("/api/dispersion/calculate", {
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
        }),
      });
      if (!res.ok) throw new Error("Dispersion calculation failed.");
      const data = await res.json();
      setPlume(data.geoJsonPlume ? JSON.parse(data.geoJsonPlume) : null);
      await fetchAnalysis(data.geoJsonPlume, receptors, data.hazardSummary);
    } catch (err) {
      alert(err.message);
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
    });
    setMarkerPos(null);
    setPois([]);
    setReceptors([]);
    setPlume(null);
    setSelectedPois([]);
    setDownwindCorridor(null);
    setAnalysis("");
  }

  return (
    <>
      <header
        style={{
          padding: 16,
          backgroundColor: "#222",
          color: "white",
          fontWeight: "bold",
        }}
      >
        Chemical Dispersion Application
      </header>

      <div style={{ display: "flex", height: "calc(100vh - 64px)" }}>
        <aside
          style={{
            width: 420,
            padding: 20,
            backgroundColor: "#f7f7f7",
            borderRight: "1px solid #ccc",
            overflowY: "auto",
            boxSizing: "border-box",
          }}
        >
          <form
            onSubmit={onSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            <label>Chemical Name *</label>
            <input
              name="chemicalName"
              value={form.chemicalName}
              onChange={onChange}
              required
            />

            <label>Dispersion Model</label>
            <select
              name="dispersionModel"
              value={form.dispersionModel}
              onChange={onChange}
            >
              {DISPERSION_MODELS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <label>AI Model</label>
            <select name="aiModel" value={form.aiModel} onChange={onChange}>
              {AI_MODELS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <label>Source Type *</label>
            <select
              name="sourceType"
              value={form.sourceType}
              onChange={onChange}
            >
              {Object.entries(sourceOptions).map(([key, val]) => (
                <option key={key} value={key}>
                  {val.label}
                </option>
              ))}
            </select>

            <label>{sourceOptions[form.sourceType]?.rateLabel}</label>
            <input name="rate" value={form.rate} onChange={onChange} />

            <label>Latitude</label>
            <input name="latitude" value={form.latitude} readOnly />

            <label>Longitude</label>
            <input name="longitude" value={form.longitude} readOnly />

            <label>POI Radius (meters)</label>
            <input
              name="poiRadius"
              value={form.poiRadius}
              type="number"
              min={10}
              max={100000}
              onChange={onRadiusChange}
            />

            <label>Toggle Points of Interest</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {POI_TYPES.map((type) => (
                <label key={type} style={{ flexBasis: "45%" }}>
                  <input
                    type="checkbox"
                    checked={selectedPois.includes(type)}
                    onChange={() => togglePoi(type)}
                  />{" "}
                  {type.replace(/_/g, " ")}
                </label>
              ))}
            </div>

            <section
              style={{
                marginTop: 20,
                whiteSpace: "pre-wrap",
                fontFamily: "monospace",
                maxHeight: 200,
                overflowY: "auto",
                backgroundColor: "#fff",
                borderRadius: 6,
                border: "1px solid #ccc",
                padding: 10,
              }}
            >
              <h3>Analysis</h3>
              {analysis}
            </section>

            <section
              style={{
                marginTop: 20,
                backgroundColor: "#fff",
                padding: 10,
                borderRadius: 6,
                border: "1px solid #ccc",
              }}
            >
              <h3>Weather</h3>
              <p>
                Temperature:{" "}
                {form.weather?.temperature != null
                  ? form.weather.temperature.toFixed(1) + " °C"
                  : "N/A"}
              </p>
              <p>Humidity: {form.weather?.humidity ?? "N/A"}</p>
              <p>
                Wind Speed:{" "}
                {form.weather?.windSpeed != null
                  ? form.weather.windSpeed.toFixed(1) + " m/s"
                  : "N/A"}
              </p>
              <p>Wind Direction: {form.weather?.windDirection ?? "N/A"}</p>
              <p>Condition: {form.weather?.condition ?? "N/A"}</p>
            </section>

            <div style={{ marginTop: 20 }}>
              <button type="submit" style={{ marginRight: 10 }}>
                Calculate
              </button>
              <button type="button" onClick={onClear}>
                Clear
              </button>
            </div>
          </form>
        </aside>

        <main style={{ flexGrow: 1 }}>
          <MapContainer
            center={[39.9526, -75.165]}
            zoom={12}
            style={{ height: "calc(100vh - 64px)", width: "100%" }}
            whenCreated={(map) => (mapRef.current = map)}
          >
            <LayersControl position="topright">
              <LayersControl.BaseLayer name="OpenStreetMap" checked>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              </LayersControl.BaseLayer>

              <LayersControl.Overlay name="Dispersion" checked>
                {plume && (
                  <GeoJSON
                    data={plume}
                    style={{ color: "red", weight: 3, opacity: 0.5 }}
                  />
                )}
                {downwindCorridor && (
                  <Polyline
                    positions={downwindCorridor}
                    pathOptions={{ color: "blue", weight: 3, dashArray: "8,8" }}
                  />
                )}
              </LayersControl.Overlay>

              <LayersControl.Overlay name="Points of Interest" checked>
                <LayerGroup>
                  {pois
                    .filter((p) => selectedPois.includes(p.type))
                    .map((poi) => (
                      <Marker
                        key={poi.id}
                        position={[poi.lat, poi.lon]}
                        icon={getPoiIcon(poi.type)}
                      >
                        <Popup>
                          <strong>{poi.name}</strong>
                          <br />
                          {poi.type}
                        </Popup>
                      </Marker>
                    ))}
                </LayerGroup>
              </LayersControl.Overlay>

              <LayersControl.Overlay name="Release Location" checked>
                {markerPos && (
                  <Marker
                    position={markerPos}
                    draggable
                    eventHandlers={{ dragend: onDrag }}
                  />
                )}
              </LayersControl.Overlay>
            </LayersControl>

            <LocationSelector onClick={onMapClick} />
          </MapContainer>
        </main>
      </div>
    </>
  );
}
