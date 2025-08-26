import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  GeoJSON,
  LayersControl,
  LayerGroup,
  useMapEvents,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import * as turf from "@turf/turf";
import "leaflet/dist/leaflet.css";

// Fix Leaflet icon URLs
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
  { value: "codellama:7b", label: "CodeLlama 7B" },
  { value: "llama3:70b", label: "Llama 3 70B" },
  { value: "codellama:latest", label: "CodeLlama Latest" },
];

const DEFAULT_RADIUS = 8046;

const sourceOptions = {
  GAS: { label: "Gas", rateLabel: "Source Concentration (ppm)" },
  LIQUID: { label: "Liquid", rateLabel: "Volume (liters/sec)" },
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

const AI_ENDPOINT = "http://localhost:11434/api/generate";

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

const getPoiIcon = (type) => poiIcons[type] || poiIcons.default;

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

// Atmospheric stability based on weather
function getStabilityClass(weather) {
  if (!weather) return "D";
  const { windSpeed, temperature } = weather;
  if (windSpeed < 2) return temperature > 25 ? "A" : "B";
  else if (windSpeed < 5) return "C";
  else if (windSpeed < 8) return "D";
  else if (windSpeed < 10) return "E";
  else return "F";
}

// Pasquill-Gifford lateral dispersion parameter sigma_y (meters)
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

// Generate wedge-shaped plume corridor polygon around release point
function generateWedgePlume(center, bearing, length) {
  if (!center || bearing === null) return null;
  const pointsCount = 10;
  const rad = (bearing * Math.PI) / 180;
  const lat0 = center.lat,
    lng0 = center.lng;
  const toLat = (m) => m / 111320;
  const toLng = (m, lat) => m / (111320 * Math.cos((lat * Math.PI) / 180));
  // Use Neutral stability here or adapt dynamically
  const stability = "D";

  let leftEdge = [],
    rightEdge = [];
  for (let i = 0; i <= pointsCount; i++) {
    const dist = length * (i / pointsCount);
    const sigmaY = calculateSigmaY(dist, stability);
    const width = sigmaY * 3; // 3 sigma width (~99%)

    const baseLat = lat0 + toLat(dist * Math.sin(rad));
    const baseLng = lng0 + toLng(dist * Math.cos(rad), lat0);

    const leftLat = baseLat + toLat(width * Math.sin(rad + Math.PI / 2));
    const leftLng = baseLng + toLng(width * Math.cos(rad + Math.PI / 2), lat0);

    const rightLat = baseLat + toLat(width * Math.sin(rad - Math.PI / 2));
    const rightLng = baseLng + toLng(width * Math.cos(rad - Math.PI / 2), lat0);

    leftEdge.push([leftLat, leftLng]);
    rightEdge.push([rightLat, rightLng]);
  }
  return [center, ...leftEdge, ...rightEdge.reverse(), center];
}

// Gaussian plume concentration calculation
function calculateConcentration(Q, U, x, y, sigmaY) {
  if (x <= 0 || U <= 0 || sigmaY <= 0) return 0;
  const factor = Q / (2 * Math.PI * U * sigmaY * sigmaY);
  return factor * Math.exp(-(y * y) / (2 * sigmaY * sigmaY));
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
  const [downwindCorridor, setDownwindCorridor] = useState(null);
  const [analysis, setAnalysis] = useState("");
  const [impactedPOIs, setImpactedPOIs] = useState([]);
  const [chemicalProperties, setChemicalProperties] = useState({});
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
    if (val > 10 && val !== form.poiRadius) {
      setForm((f) => ({ ...f, poiRadius: val }));
    }
  };

  const onMarkerUpdate = (latlng) => {
    setMarkerPos(latlng);
    setForm((f) => ({
      ...f,
      latitude: latlng.lat.toFixed(6),
      longitude: latlng.lng.toFixed(6),
      weather: null,
    }));
    setPlume(null);
    setDownwindCorridor(null);
    setAnalysis("");
  };

  const onDrag = (e) => {
    onMarkerUpdate(e.target.getLatLng());
  };

  // Chemical properties fetch & caching + save to DB
  async function getChemicalProperties(chemicalName) {
    if (chemicalProperties[chemicalName]) {
      return chemicalProperties[chemicalName];
    }
    try {
      const res = await fetch(
        `/api/chemicals/properties?name=${encodeURIComponent(chemicalName)}`
      );
      if (!res.ok) throw new Error("Failed to fetch chemical properties");
      const data = await res.json();

      // Cache locally
      setChemicalProperties((props) => ({ ...props, [chemicalName]: data }));

      // Save to DB
      await fetch("/api/chemicals/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: chemicalName, properties: data }),
      });

      return data;
    } catch (err) {
      console.error("Chemical properties fetch error:", err);
      return null;
    }
  }

  async function fetchPoisInCorridor(polygon) {
    if (!polygon) return;

    const validCoords = polygon.filter(
      (pt) =>
        Array.isArray(pt) &&
        pt.length === 2 &&
        pt.every((c) => typeof c === "number" && !isNaN(c))
    );
    if (validCoords.length === 0) return;

    const polygonStr = validCoords.map((p) => p.join(" ")).join(" ");
    const query = `[out:json][timeout:25];
      (node["amenity"](poly:"${polygonStr}");
       way["amenity"](poly:"${polygonStr}");
       relation["amenity"](poly:"${polygonStr}"););
      out center;`;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch("https://overpass-api.de/api/interpreter", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: query,
        });
        if (!res.ok) throw new Error(`Overpass API error: ${res.status}`);
        const data = await res.json();
        const filteredPois = data.elements
          .map((el) => ({
            id: el.id,
            name: el.tags?.name || "Unnamed",
            type: el.tags?.amenity || "other",
            lat: el.lat ?? el.center?.lat,
            lon: el.lon ?? el.center?.lon,
          }))
          .filter((p) => p.lat && p.lon && selectedPois.includes(p.type));

        setPois(filteredPois);
        setReceptors(filteredPois);
        return;
      } catch (err) {
        if (attempt === 3) {
          alert("Failed to fetch POIs after retries");
          setPois([]);
          setReceptors([]);
        } else {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }
  }

  useEffect(() => {
    if (!markerPos || !form.weather?.windDirection) {
      setDownwindCorridor(null);
      setPlume(null);
      setPois([]);
      setReceptors([]);
      setImpactedPOIs([]);
      return;
    }

    const wedge = generateWedgePlume(
      markerPos,
      form.weather.windDirection,
      4000
    );

    setDownwindCorridor(wedge);

    if (wedge && wedge.every((p) => p.every((c) => typeof c === "number"))) {
      setPlume({
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [wedge.map((p) => [p[1], p[0]])],
        },
      });
      fetchPoisInCorridor(wedge);
    } else {
      setPlume(null);
      setPois([]);
    }
  }, [markerPos, form.weather, selectedPois]);

  const extractImpactedPois = useCallback(() => {
    if (!plume || !pois.length || !form.weather || !markerPos) return [];

    try {
      const polyFeature = turf.feature(plume.geometry);
      const stability = getStabilityClass(form.weather);
      const windRad = (form.weather.windDirection * Math.PI) / 180;

      const sourcePoint = turf.point([markerPos.lng, markerPos.lat]);

      return pois
        .filter((p) => p.lat && p.lon)
        .filter((p) => {
          const pt = turf.point([p.lon, p.lat]);
          return turf.booleanPointInPolygon(pt, polyFeature);
        })
        .map((poi) => {
          const receptorPoint = turf.point([poi.lon, poi.lat]);
          const distMeters =
            turf.distance(sourcePoint, receptorPoint, { units: "kilometers" }) *
            1000;

          const dx =
            (poi.lon - markerPos.lng) * 111320 * Math.cos((markerPos.lat * Math.PI) / 180);
          const dy = (poi.lat - markerPos.lat) * 111320;
          const crosswindDist = dx * Math.sin(windRad) - dy * Math.cos(windRad);

          // Use chemical property if available (e.g. decay factor) for advanced modeling in future

          // Calculate concentration with emission rate Q, wind speed U
          const Q = Number(form.rate) || 1;
          const U = form.weather.windSpeed || 1;
          const sigmaY = calculateSigmaY(distMeters, stability);

          const concentration = calculateConcentration(
            Q,
            U,
            distMeters,
            crosswindDist,
            sigmaY
          );

          return {
            ...poi,
            maxConcentration: concentration.toFixed(6),
          };
        });
    } catch (error) {
      console.error("extractImpactedPois error:", error);
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
    else {
      setAnalysis(
        `Potentially impacted locations within downwind corridor:\n${impacted
          .map(
            (p, i) =>
              `${i + 1}. ${p.name} (${p.type}) - Estimated Concentration: ${p.maxConcentration}`
          )
          .join("\n")}`
      );
    }
  }, [plume, extractImpactedPois]);

  async function fetchAnalysis(plumeData, receptorsData, hazardSummary) {
    if (!plumeData || !hazardSummary) {
      setAnalysis("Insufficient data for analysis.");
      return;
    }
    try {
      const impactedText =
        impactedPOIs.length > 0
          ? impactedPOIs
              .map(
                (p) =>
                  `${p.name} (${p.type}), Estimated Concentration: ${p.maxConcentration}`
              )
              .join("\n")
          : "No impacted POIs identified";

      const prompt = `
You are an environmental analyst.

Given the chemical plume data:

${JSON.stringify(plumeData)}

Receptors:

${JSON.stringify(receptorsData)}

Hazard summary:

${hazardSummary}

Impacted locations:

${impactedText}

Please provide a concise analysis of potential impacts.
      `;

      const response = await fetch(AI_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: form.aiModel,
          prompt,
          stream: false,
        }),
      });

      if (!response.ok)
        throw new Error(`AI API responded with status ${response.status}`);

      const data = await response.json();
      setAnalysis(data.response || "No response from AI");
    } catch (error) {
      console.error("AI analysis failed:", error);
      setAnalysis("AI analysis failed.");
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.chemicalName || !form.latitude || !form.longitude || !form.rate) {
      alert("Please fill all required fields");
      return;
    }

    // Fetch or get cached chemical properties first
    const chemProps = await getChemicalProperties(form.chemicalName);
    if (!chemProps) {
      alert("Failed to fetch chemical properties");
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
          chemicalProperties: chemProps,
        }),
      });

      if (!res.ok) throw new Error("Dispersion calculation failed");
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
    setImpactedPOIs([]);
    setSelectedPois([]);
    setDownwindCorridor(null);
    setAnalysis("");
  }

  // Weather fetch with 15s interval, rounded coords to avoid redirects
  useEffect(() => {
    let canceled = false;
    async function fetchWeather() {
      if (!form.latitude || !form.longitude) return;

      const lat = Number(form.latitude).toFixed(4);
      const lon = Number(form.longitude).toFixed(4);

      try {
        const res = await fetch(`https://api.weather.gov/points/${lat},${lon}`);
        if (!res.ok) throw new Error("Failed to get weather point");
        const data = await res.json();

        if (!data.properties?.observationStations)
          throw new Error("No observation stations found");

        const stationsRes = await fetch(data.properties.observationStations);
        if (!stationsRes.ok) throw new Error("Failed to get stations");
        const stationsData = await stationsRes.json();

        if (!stationsData.features.length) throw new Error("No stations returned");

        const latestStation = stationsData.features[0].id;

        const obsRes = await fetch(`${latestStation}/observations/latest`);
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
      } catch (error) {
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

  // POIs filtered for rendering by selected type and valid coords
  const visiblePois = pois.filter(
    (p) => p.lat && p.lon && selectedPois.includes(p.type)
  );

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
            <label>Source Type</label>
            <select name="sourceType" value={form.sourceType} onChange={onChange}>
              {Object.entries(sourceOptions).map(([key, val]) => (
                <option key={key} value={key}>
                  {val.label}
                </option>
              ))}
            </select>
            <label>{form.sourceType && sourceOptions[form.sourceType].rateLabel}</label>
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
              max={10000}
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
              <pre>{analysis}</pre>
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
            scrollWheelZoom
            style={{ height: "100vh", width: "100%" }}
            whenCreated={(map) => (mapRef.current = map)}
          >
            <ResizeFix />
            <LayersControl position="topright">
              <LayersControl.BaseLayer name="OpenStreetMap" checked>
                <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
              </LayersControl.BaseLayer>
              <LayersControl.Overlay name="Dispersion" checked>
                {plume &&
                  plume.geometry &&
                  plume.geometry.coordinates?.length > 0 && (
                    <GeoJSON
                      data={plume}
                      style={{ color: "red", weight: 3, opacity: 0.5 }}
                    />
                  )}
              </LayersControl.Overlay>
              <LayersControl.Overlay name="Points of Interest" checked>
                <LayerGroup>
                  {visiblePois.map((poi) => (
                    <Marker
                      key={poi.id}
                      position={[poi.lat, poi.lon]}
                      icon={getPoiIcon(poi.type)}
                    >
                      <Popup>
                        <strong>{poi.name}</strong>
                        <br />
                        Type: {poi.type}
                        <br />
                        Exposure:{" "}
                        {(() => {
                          const impact = impactedPOIs.find((i) => i.id === poi.id);
                          return impact ? impact.maxConcentration : "N/A";
                        })()}
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
            <LocationSelector onClick={onMarkerUpdate} />
          </MapContainer>
        </main>
      </div>
    </>
  );
}
