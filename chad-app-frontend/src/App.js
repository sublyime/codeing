import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  GeoJSON,
  LayersControl,
  LayerGroup,
  Polyline,
  useMapEvents,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import * as turf from "@turf/turf";
import "leaflet/dist/leaflet.css";

// Leaflet icon fix
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

// Fix Leaflet map size issue on container render/resize
function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => {
      map.invalidateSize();
    }, 0);
  }, [map]);
  return null;
}

function generateDownwindCorridor(center, bearing, length, width) {
  if (!center || bearing === null) return null;

  const rad = ((bearing + 180) % 360) * (Math.PI / 180);
  const metersToLat = (m) => m / 111320;
  const metersToLng = (m, lat) => m / (111320 * Math.cos((lat * Math.PI) / 180));
  const lat = center.lat;
  const lng = center.lng;
  const lenLat = metersToLat(length);
  const lenLng = metersToLng(length, lat);
  const halfWidthLat = metersToLat(width / 2);
  const halfWidthLng = metersToLng(width / 2, lat);

  return [
    [lat + Math.sin(rad + Math.PI / 2) * halfWidthLat, lng + Math.cos(rad + Math.PI / 2) * halfWidthLng], // leftStart
    [lat + Math.sin(rad) * lenLat + Math.sin(rad + Math.PI / 2) * halfWidthLat, lng + Math.cos(rad) * lenLng + Math.cos(rad + Math.PI / 2) * halfWidthLng], // leftEnd
    [lat + Math.sin(rad) * lenLat + Math.sin(rad - Math.PI / 2) * halfWidthLat, lng + Math.cos(rad) * lenLng + Math.cos(rad - Math.PI / 2) * halfWidthLng], // rightEnd
    [lat + Math.sin(rad - Math.PI / 2) * halfWidthLat, lng + Math.cos(rad - Math.PI / 2) * halfWidthLng], // rightStart
    [lat + Math.sin(rad + Math.PI / 2) * halfWidthLat, lng + Math.cos(rad + Math.PI / 2) * halfWidthLng], // close polygon
  ];
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

  const fetchPOIsInCorridor = useCallback(
    async (corridor) => {
      if (!corridor) return;
      const polygonStr = corridor.map((pt) => pt.join(" ")).join(" ");
      const query = `[out:json][timeout:25];
        (
          node["amenity"](poly:"${polygonStr}");
          way["amenity"](poly:"${polygonStr}");
          relation["amenity"](poly:"${polygonStr}");
        );
        out center;`;

      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const res = await fetch(
            "https://overpass-api.de/api/interpreter",
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: query,
            }
          );
          if (!res.ok) throw new Error(`Overpass API error: ${res.status}`);
          const data = await res.json();
          const filtered = data.elements
            .map((el) => ({
              id: el.id,
              name: el.tags?.name || "Unnamed",
              type: el.tags?.amenity || "other",
              lat: el.lat ?? el.center?.lat,
              lon: el.lon ?? el.center?.lon,
            }))
            .filter((p) => p.lat && p.lon);
          setPois(filtered);
          setReceptors(filtered);
          return;
        } catch (error) {
          if (attempt === maxRetries) {
            alert("Failed to load POIs within downwind corridor after retries");
            setPois([]);
            setReceptors([]);
          } else {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
          }
        }
      }
    },
    []
  );

  useEffect(() => {
    if (
      !markerPos ||
      !form.weather?.windDirection ||
      form.weather.windDirection === null
    ) {
      setDownwindCorridor(null);
      setPlume(null);
      setPois([]);
      setReceptors([]);
      setImpactedPOIs([]);
      return;
    }
    const corridor = generateDownwindCorridor(
      markerPos,
      form.weather.windDirection,
      4000,
      form.poiRadius
    );
    setDownwindCorridor(corridor);
    setPlume({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [corridor.map((point) => [point[1], point[0]])],
      },
    });
    fetchPOIsInCorridor(corridor);
  }, [markerPos, form.weather, form.poiRadius, fetchPOIsInCorridor]);

  const extractImpactedPOIs = useCallback(() => {
    if (!plume || !pois.length) return [];
    try {
      const polygonFeature = turf.feature(plume.geometry);
      return pois
        .filter((poi) => {
          if (!poi.lat || !poi.lon) return false;
          const pt = turf.point([poi.lon, poi.lat]);
          return turf.booleanPointInPolygon(pt, polygonFeature);
        })
        .map((p) => ({
          ...p,
          maxConcentration: 42.5,
        }));
    } catch (e) {
      console.error("extractImpactedPOIs:", e);
      return [];
    }
  }, [plume, pois]);

  useEffect(() => {
    if (!plume) {
      setAnalysis("");
      setImpactedPOIs([]);
      return;
    }
    const impacted = extractImpactedPOIs();
    setImpactedPOIs(impacted);
    if (!impacted.length) {
      setAnalysis("No impacted locations within downwind corridor.");
      return;
    }
    const impactText = impacted
      .map(
        (poi, idx) =>
          `${idx + 1}. ${poi.name} (${poi.type}) - Max Concentration: ${poi.maxConcentration}`
      )
      .join("\n");
    setAnalysis(
      `Potentially impacted locations within downwind corridor:\n${impactText}`
    );
  }, [plume, extractImpactedPOIs]);

  async function fetchAnalysis(plumeData, receptorsData, hazardSummary) {
    if (!plumeData || !hazardSummary) {
      setAnalysis("Insufficient data for analysis.");
      return;
    }
    try {
      const impactedText = impactedPOIs.length
        ? impactedPOIs
            .map(
              (p) =>
                `${p.name} (${p.type}), Estimated Max Concentration: ${p.maxConcentration}`
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
    } catch (e) {
      console.error("AI analysis failed:", e);
      setAnalysis("AI analysis failed.");
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.chemicalName || !form.latitude || !form.longitude || !form.rate) {
      alert("Please fill all required fields");
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

  // Weather fetching effect - refreshes every 15 seconds
  useEffect(() => {
    let canceled = false;

    async function fetchWeather() {
      if (!form.latitude || !form.longitude) {
        console.log("No coordinates for weather fetch");
        return;
      }

      // Round coordinates to 4 decimals before fetching to avoid redirects
      const lat = Number(form.latitude).toFixed(4);
      const lon = Number(form.longitude).toFixed(4);
      const weatherUrl = `https://api.weather.gov/points/${lat},${lon}`;

      try {
        const res = await fetch(weatherUrl);
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
        console.error("Weather fetch error", error);
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

  return (
    <>
      <header
        style={{ padding: 16, backgroundColor: "#222", color: "white", fontWeight: "bold" }}
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
            scrollWheelZoom={true}
            style={{ height: "100vh", width: "100%" }}
            whenCreated={(map) => (mapRef.current = map)}
          >
            <ResizeFix />
            <LayersControl position="topright">
              <LayersControl.BaseLayer name="OpenStreetMap" checked>
                <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
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
                    pathOptions={{ color: "blue", weight: 3, dashArray: "8" }}
                  />
                )}
              </LayersControl.Overlay>

              <LayersControl.Overlay name="Points of Interest" checked>
                <LayerGroup>
                  {pois
                    .filter((poi) => selectedPois.includes(poi.type))
                    .map((poi) => (
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
                          {(() => {
                            const impact = impactedPOIs.find((i) => i.id === poi.id);
                            return impact
                              ? `Estimated Max Concentration: ${impact.maxConcentration}`
                              : "Impact data not available";
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
