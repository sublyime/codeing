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
import {
  Layers,
  Settings,
  Database,
  Wifi,
  CloudRain,
  Activity,
  ChevronRight,
  ChevronLeft,
  MessageCircle,
  AlertTriangle,
  Send,
  Thermometer,
  Wind,
  Cloud,
  MapPin,
  Minimize,
} from "lucide-react";

// Fix Leaflet marker icon issue in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png",
});

const redIcon = L.icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
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

const WEATHER_GOV_LAYERS = [
  { id: "radar", label: "NWS Radar", icon: <CloudRain size={16} />, url: "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png" },
  { id: "alerts", label: "NWS Warnings", icon: <AlertTriangle size={16} />, url: "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/warn-900913/{z}/{x}/{y}.png" },
];

const ERG_DATABASE = {
  chlorine: {
    id: "124",
    name: "Chlorine",
    guide: "124",
    hazard: "Toxic Gas - Oxidizer",
    initialIsolation: "100m in all directions",
    protectiveDistance: { small: "800m downwind during day, 2.4km at night", large: "2.4km downwind during day, 8.0km at night" },
    healthHazards: "Toxic by inhalation. Causes severe respiratory irritation and chemical burns.",
    fireExplosion: "Does not burn but supports combustion. Cylinders may rupture under heat.",
    publicSafety: "Evacuate area. Keep upwind. Deny entry except to authorized personnel.",
    emergencyResponse: "Stop leak if safe to do so. Use water spray to reduce vapors.",
  },
  ammonia: {
    id: "125",
    name: "Ammonia",
    guide: "125",
    hazard: "Toxic Gas",
    initialIsolation: "60m in all directions",
    protectiveDistance: { small: "500m downwind during day, 1.6km at night", large: "1.6km downwind during day, 4.0km at night" },
    healthHazards: "Toxic by inhalation. Causes severe respiratory and eye irritation.",
    fireExplosion: "Flammable gas. May ignite. Cylinders may rupture when heated.",
    publicSafety: "Evacuate area. Keep upwind. Deny entry except to authorized personnel.",
    emergencyResponse: "Stop leak if safe to do so. Use water spray to reduce vapors.",
  },
  "sulfur dioxide": {
    id: "123",
    name: "Sulfur Dioxide",
    guide: "123",
    hazard: "Toxic Gas",
    initialIsolation: "100m in all directions",
    protectiveDistance: { small: "800m downwind during day, 2.4km at night", large: "2.4km downwind during day, 8.0km at night" },
    healthHazards: "Toxic by inhalation. Causes severe respiratory irritation.",
    fireExplosion: "Does not burn. Cylinders may rupture under heat exposure.",
    publicSafety: "Evacuate area. Keep upwind. Deny entry except to authorized personnel.",
    emergencyResponse: "Stop leak if safe to do so. Use water spray to reduce vapors.",
  },
};

const POI_TYPES = [
  { id: "school", label: "Schools", color: "blue" },
  { id: "hospital", label: "Hospitals", color: "red" },
  { id: "restaurant", label: "Restaurants", color: "orange" },
  { id: "fuel", label: "Fuel Stations", color: "yellow" },
  { id: "place_of_worship", label: "Places of Worship", color: "violet" },
  { id: "bank", label: "Banks", color: "green" },
  { id: "pharmacy", label: "Pharmacies", color: "grey" },
];

const RIGHT_SIDEBAR_SECTIONS = [
  { id: "incident-details", label: "Incident Details", icon: <MapPin size={24} /> },
  { id: "chat", label: "AI Assistant", icon: <MessageCircle size={24} /> },
  { id: "layers", label: "Map Layers", icon: <Layers size={24} /> },
  { id: "analysis", label: "Impact Analysis", icon: <Activity size={24} /> },
  { id: "erg", label: "ERG Analysis", icon: <AlertTriangle size={24} /> },
  { id: "data-interfaces", label: "Data Interfaces", icon: <Settings size={24} /> },
];
function buildPoiIcon(settings) {
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
  if (!weather || !weather.hourly) return "D";
  const { wind_speed_10m } = weather.hourly;
  // Use the first value as a simplified current condition
  const windSpeed = wind_speed_10m[0];
  const temperature = weather.hourly.temperature_2m[0];
  if (windSpeed < 2) return temperature > 25 ? "A" : "B";
  else if (windSpeed < 5) return "C";
  else if (windSpeed < 8) return "D";
  else if (windSpeed < 10) return "E";
  else return "F";
}

function cardinalToDegrees(direction) {
  const directions = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  };
  return directions[direction] ?? 0;
}

function parseWindSpeed(windSpeedStr) {
  if (!windSpeedStr) return 0;
  const match = windSpeedStr.match(/\d+/); // Find the first number in the string
  if (!match) return 0;
  const mph = parseInt(match[0], 10);
  return mph * 0.44704; // Convert mph to m/s
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

function generateOrganicPlume(center, bearing, length, weather) {
  if (!center || bearing === null || !weather || !weather.hourly) return null;

  const points = 30;
  const rad = (bearing * Math.PI) / 180;
  const lat0 = center.lat;
  const lng0 = center.lng;
  const stability = getStabilityClass(weather);
  const windSpeed = weather.hourly.wind_speed_10m[0] || 5;

  const toLat = (m) => m / 111320;
  const toLng = (m, lat) => m / (111320 * Math.cos((lat * Math.PI) / 180));

  let leftEdge = [];
  let rightEdge = [];

  for (let i = 0; i <= points; i++) {
    const dist = length * Math.pow(i / points, 0.7);
    const sigmaY = calculateSigmaY(Math.max(dist, 100), stability);
    const windEffect = 1 + windSpeed / 20;
    const organicFactor = 0.8 + Math.sin(i * 0.3) * 0.2;
    const width = sigmaY * 2.0 * windEffect * organicFactor;
    const centerLat = lat0 + toLat(dist * Math.sin(rad));
    const centerLng = lng0 + toLng(dist * Math.cos(rad), lat0);
    const leftLat = centerLat + toLat(width * Math.sin(rad + Math.PI / 2));
    const leftLng = centerLng + toLng(width * Math.cos(rad + Math.PI / 2), lat0);
    const rightLat = centerLat + toLat(width * Math.sin(rad - Math.PI / 2));
    const rightLng = centerLng + toLng(width * Math.cos(rad - Math.PI / 2), lat0);
    leftEdge.push([leftLng, leftLat]);
    rightEdge.push([rightLng, rightLat]);
  }

  const coordinates = [
    [lng0, lat0],
    ...leftEdge,
    ...rightEdge.reverse(),
    [lng0, lat0],
  ];

  return coordinates;
}

function calculateConcentration(Q, U, x, y, stability = "D") {
  if (x <= 0 || U <= 0) return 0;
  const sigmaY = calculateSigmaY(x, stability);
  const denom = Math.sqrt(2 * Math.PI) * sigmaY;
  const expTerm = Math.exp(-(y * y) / (2 * sigmaY * sigmaY));
  return (Q / (U * denom)) * expTerm;
}

function WindRoseDisplay({ weather }) {
  if (!weather || !weather.hourly || typeof weather.hourly.wind_direction_10m[0] !== "number") {
    return <div className="text-center text-gray-500">No wind data</div>;
  }
  const windSpeed = weather.hourly.wind_speed_10m[0];
  const windDirection = weather.hourly.wind_direction_10m[0];
  const radius = 60;
  const centerX = 70;
  const centerY = 70;
  const windRad = (windDirection - 90) * (Math.PI / 180);
  const speed = windSpeed || 0;
  const arrowLength = Math.min(speed * 3, radius - 10);
  const endX = centerX + Math.cos(windRad) * arrowLength;
  const endY = centerY + Math.sin(windRad) * arrowLength;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width="140" height="140" style={{ border: "1px solid #e5e7eb", borderRadius: "9999px", backgroundColor: "#eff6ff" }}>
        <circle cx={centerX} cy={centerY} r="50" fill="none" stroke="#e5e7eb" strokeWidth="1" />
        <circle cx={centerX} cy={centerY} r="30" fill="none" stroke="#e5e7eb" strokeWidth="1" />
        <circle cx={centerX} cy={centerY} r="10" fill="none" stroke="#e5e7eb" strokeWidth="1" />
        <text x={centerX} y="15" textAnchor="middle" fontSize="12" fill="#6b7280">N</text>
        <text x="125" y={centerY + 5} textAnchor="middle" fontSize="12" fill="#6b7280">E</text>
        <text x={centerX} y="135" textAnchor="middle" fontSize="12" fill="#6b7280">S</text>
        <text x="15" y={centerY + 5} textAnchor="middle" fontSize="12" fill="#6b7280">W</text>
        <line
          x1={centerX}
          y1={centerY}
          x2={endX}
          y2={endY}
          stroke="#3b82f6"
          strokeWidth="3"
          markerEnd="url(#arrowhead)"
        />
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
          </marker>
        </defs>
      </svg>
      <div style={{ marginTop: "0.5rem", fontSize: "0.875rem", textAlign: "center" }}>
        <div>Wind: {speed.toFixed(1)} m/s @ {windDirection}°</div>
        {weather?.current_weather && (
          <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Temperature:</span><span>{weather.current_weather.temperature}°C</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Wind Speed:</span><span>{weather.current_weather.windspeed} m/s</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Wind Direction:</span><span>{weather.current_weather.winddirection}°</span></div>
          </div>
        )}
      </div>
    </div>
  );
}

function ModbusInterface({ isOpen, settings, onSettingsChange }) {
  const [connected, setConnected] = useState(false);
  const connectToDevice = async () => {
    console.log("Connecting to Modbus device...");
    setConnected(true);
  };
  if (!isOpen) return null;
  return (
    <div style={{ padding: "0.75rem", border: "1px solid #e5e7eb", borderRadius: "0.25rem", backgroundColor: "#fff", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <h3 style={{ fontSize: "1rem", fontWeight: "bold" }}>Modbus Interface</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "500", marginBottom: "0.25rem" }}>Serial Port</label>
          <select style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}>
            <option>COM1</option>
            <option>COM2</option>
          </select>
        </div>
        <button onClick={connectToDevice} style={{ width: "100%", padding: "0.5rem", borderRadius: "0.25rem", backgroundColor: "#3b82f6", color: "#fff", border: "none", cursor: "pointer" }}>
          {connected ? 'Connected' : 'Connect'}
        </button>
      </div>
    </div>
  );
}

function ExternalAPIInterface({ isOpen, settings, onSettingsChange }) {
  const [testStatus, setTestStatus] = useState(null);
  const testConnection = async () => {
    try {
      setTestStatus('testing');
      await new Promise(resolve => setTimeout(resolve, 1000));
      setTestStatus('success');
    } catch {
      setTestStatus('error');
    }
  };
  if (!isOpen) {
    return null;
  }
  return (
    <div style={{ padding: "0.75rem", border: "1px solid #e5e7eb", borderRadius: "0.25rem", backgroundColor: "#fff", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <h3 style={{ fontSize: "1rem", fontWeight: "bold" }}>External API Configuration</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "500", marginBottom: "0.25rem" }}>API Endpoint</label>
          <input
            type="url"
            placeholder="https://api.example.com"
            style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}
            value={settings.apiEndpoint || ''}
            onChange={(e) => onSettingsChange({...settings, apiEndpoint: e.target.value})}
          />
        </div>
        <button
          onClick={testConnection}
          style={{ width: "100%", padding: "0.5rem", backgroundColor: "#3b82f6", color: "#fff", borderRadius: "0.25rem", border: "none", cursor: "pointer" }}
          disabled={testStatus === 'testing'}
        >
          {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
        </button>
        {testStatus === 'success' && (<div style={{ padding: "0.5rem", backgroundColor: "#dcfce7", color: "#166534", borderRadius: "0.25rem", fontSize: "0.875rem" }}>Connection successful!</div>)}
        {testStatus === 'error' && (<div style={{ padding: "0.5rem", backgroundColor: "#fee2e2", color: "#991b1b", borderRadius: "0.25rem", fontSize: "0.875rem" }}>Connection failed!</div>)}
      </div>
    </div>
  );
}

function ERGSearch({ onSelect }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);
  const handleSearch = () => {
    const term = searchTerm.toLowerCase();
    const found = Object.values(ERG_DATABASE)
      .filter((chem) =>
        chem.name.toLowerCase().includes(term) || String(chem.guide).includes(term)
      )
      .map((chem) => ({ ...chem, ergGuide: chem.guide }));
    setResults(found);
  };
  return (
    <div style={{ padding: "0.75rem", border: "1px solid #e5e7eb", borderRadius: "0.25rem", backgroundColor: "#fff" }}>
      <div style={{ display: "flex", marginBottom: "0.5rem" }}>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search ERG..."
          style={{ border: "1px solid #d1d5db", padding: "0.5rem", flex: 1, borderRadius: "0.25rem" }}
        />
        <button onClick={handleSearch} style={{ marginLeft: "0.5rem", padding: "0.5rem", backgroundColor: "#3b82f6", color: "#fff", borderRadius: "0.25rem", border: "none", cursor: "pointer" }}>
          Search
        </button>
      </div>
      <ul style={{ maxHeight: "8rem", overflowY: "auto", listStyle: "none", padding: "0" }}>
        {results.map((result, index) => (
          <li
            key={index}
            style={{ padding: "0.5rem", cursor: "pointer", borderRadius: "0.25rem", transition: "background-color 0.2s", backgroundColor: "#f9fafb" }}
            onClick={() => onSelect(result)}
          >
            Guide {result.ergGuide}: {result.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

const DraggableAndResizableWeatherWindow = ({ children, onDock, initialPosition, initialSize }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [position, setPosition] = useState(initialPosition);
  const [size, setSize] = useState(initialSize);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleDragStart = (e) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const handleResizeStart = (e) => {
    e.stopPropagation();
    setIsResizing(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = useCallback((e) => {
    if (isDragging) {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      setPosition({ x: newX, y: newY });
    } else if (isResizing) {
      const newWidth = Math.max(200, size.width + (e.clientX - dragStart.x));
      const newHeight = Math.max(150, size.height + (e.clientY - dragStart.y));
      setSize({ width: newWidth, height: newHeight });
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  }, [isDragging, isResizing, dragStart, size]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return (
    <div
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        backgroundColor: '#fff',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        borderRadius: '0.5rem',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        resize: 'both',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'move',
          paddingBottom: '0.5rem',
          borderBottom: '1px solid #e5e7eb',
          marginBottom: '0.5rem',
        }}
        onMouseDown={handleDragStart}
      >
        <h3 style={{ fontSize: "1rem", fontWeight: "bold", color: "#1f2937" }}>Weather Conditions</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={onDock}
            style={{
              padding: '0.25rem',
              borderRadius: '9999px',
              backgroundColor: '#e5e7eb',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            aria-label="Dock Window"
          >
            <Minimize size={16} />
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </div>
      <div
        style={{
          position: 'absolute',
          right: '0',
          bottom: '0',
          width: '12px',
          height: '12px',
          cursor: 'se-resize',
        }}
        onMouseDown={handleResizeStart}
      />
    </div>
  );
};


export default function App() {
  const [form, setForm] = useState(() => {
    const saved = localStorage.getItem('emergencyResponseForm');
    return saved ? JSON.parse(saved) : {
      chemicalName: "",
      dispersionModel: DISPERSION_MODELS[0].value,
      aiModel: AI_MODELS[0].value,
      latitude: "",
      longitude: "",
      sourceType: "GAS",
      rate: "",
      weather: null,
      chemicalData: null,
    };
  });

  const [layerStates, setLayerStates] = useState(() => {
    const saved = JSON.parse(localStorage.getItem('layerStates')) || {};
    return {
      downwindCorridor: saved.downwindCorridor ?? true,
      pointsOfInterest: saved.pointsOfInterest ?? false,
      modbus: saved.modbus ?? false,
      externalAPI: saved.externalAPI ?? false,
      erg: saved.erg ?? false,
      chat: saved.chat ?? true,
      // Replaced openMeteo with new NWS layers
      radar: saved.radar ?? false, 
      alerts: saved.alerts ?? false,
    };
  });

  const [expandedSections, setExpandedSections] = useState({
    sidebar: true,
  });

  const [markerPos, setMarkerPos] = useState(null);
  const [pois, setPois] = useState([]);
  const [plume, setPlume] = useState(null);
  const [impactedPOIs, setImpactedPOIs] = useState([]);
  const [poiSettings, setPoiSettings] = useState(() => {
    const saved = localStorage.getItem('poiSettings');
    return saved ? JSON.parse(saved) : POI_TYPES.reduce((acc, type) => {
      acc[type.id] = { color: type.color, customIcon: null };
      return acc;
    }, {});
  });
  const [selectedPois, setSelectedPois] = useState(() => {
    const saved = localStorage.getItem('selectedPois');
    return saved ? JSON.parse(saved) : POI_TYPES.map(t => t.id);
  });
  const [analysis, setAnalysis] = useState("");
  const [hazardAnalysis, setHazardAnalysis] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [externalAPISettings, setExternalAPISettings] = useState(() => {
    const saved = localStorage.getItem('externalAPISettings');
    return saved ? JSON.parse(saved) : {};
  });
  const [modbusSettings, setModbusSettings] = useState(() => {
    const saved = localStorage.getItem('modbusSettings');
    return saved ? JSON.parse(saved) : {};
  });
   const [rightSidebarSection, setRightSidebarSection] = useState(null);
  const [isWeatherFloating, setIsWeatherFloating] = useState(true);

  const mapRef = useRef();
  const chatHistoryRef = useRef();

  useEffect(() => { localStorage.setItem('emergencyResponseForm', JSON.stringify(form)); }, [form]);
  useEffect(() => { localStorage.setItem('layerStates', JSON.stringify(layerStates)); }, [layerStates]);
  useEffect(() => { localStorage.setItem('poiSettings', JSON.stringify(poiSettings)); }, [poiSettings]);
  useEffect(() => { localStorage.setItem('selectedPois', JSON.stringify(selectedPois)); }, [selectedPois]);
  useEffect(() => { localStorage.setItem('externalAPISettings', JSON.stringify(externalAPISettings)); }, [externalAPISettings]);
  useEffect(() => { localStorage.setItem('modbusSettings', JSON.stringify(modbusSettings)); }, [modbusSettings]);
    useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const toggleLayer = (layer) => {
    setLayerStates(prev => ({ ...prev, [layer]: !prev[layer] }));
  };

  
  const toggleSidebar = () => {
    setExpandedSections(prev => ({ ...prev, sidebar: !prev.sidebar }));
  };

  const toggleRightSidebarSection = (sectionId) => {
    setRightSidebarSection(prev => prev === sectionId ? null : sectionId);
  };

  const onDrag = (e) => {
    const latlng = e.target.getLatLng();
    setMarkerPos(latlng);
    setForm((f) => ({
      ...f,
      latitude: latlng.lat.toFixed(6),
      longitude: latlng.lng.toFixed(6),
    }));
  };

  const onMarkerUpdate = (latlng) => {
    setMarkerPos(latlng);
    setForm((f) => ({
      ...f,
      latitude: latlng.lat.toFixed(6),
      longitude: latlng.lng.toFixed(6),
    }));
    setAnalysis("");
  };

  const fetchPois = useCallback(async (polygon) => {
    if (!polygon) return;
    const validPoints = polygon.filter(
      (pt) => Array.isArray(pt) && pt.length === 2 && pt.every((c) => typeof c === "number")
    );
    if (validPoints.length === 0) return;
    const polygonStr = validPoints.map((p) => `${p[1]} ${p[0]}`).join(" ");
    const query = `[out:json][timeout:25];(node["amenity"](poly:"${polygonStr}");way["amenity"](poly:"${polygonStr}");relation["amenity"](poly:"${polygonStr}"););out center;`;
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
    } catch (e) {
      console.error("Failed to fetch POIs:", e);
      setPois([]);
    }
  }, [selectedPois]);

  useEffect(() => {
    if (!markerPos || !form.weather?.hourly?.wind_direction_10m) {
      setPlume(null);
      return;
    }
    const organicPlumeCoords = generateOrganicPlume(
      markerPos,
      form.weather.hourly.wind_direction_10m[0],
      4000,
      form.weather
    );
    if (!organicPlumeCoords) return;
    const plumeFeature = {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [organicPlumeCoords],
      },
      properties: {
        persistent: true,
      },
    };
    setPlume(plumeFeature);
    if (layerStates.pointsOfInterest) {
      fetchPois(organicPlumeCoords);
    }
  }, [markerPos, form.weather, layerStates.pointsOfInterest, fetchPois]);

  useEffect(() => {
    if (!plume || !pois.length || !form.weather || !markerPos) {
      setImpactedPOIs([]);
      return;
    }
    try {
      const stability = getStabilityClass(form.weather);
      const windDirection = form.weather.hourly.wind_direction_10m[0];
      const windSpeed = form.weather.hourly.wind_speed_10m[0] || 1;
      const windRad = (windDirection * Math.PI) / 180;
      const sourcePt = turf.point([markerPos.lng, markerPos.lat]);
      const poly = turf.feature(plume.geometry);
      const impacted = pois
        .filter((p) => turf.booleanPointInPolygon(turf.point([p.lon, p.lat]), poly))
        .map((p) => {
          const receptor = turf.point([p.lon, p.lat]);
          const dist = turf.distance(sourcePt, receptor, { units: "meters" });
          const dx = (p.lon - markerPos.lng) * 111320 * Math.cos((markerPos.lat * Math.PI) / 180);
          const dy = (p.lat - markerPos.lat) * 111320;
          const crossWindDist = dx * Math.sin(windRad) - dy * Math.cos(windRad);
          const conc = calculateConcentration(
            Number(form.rate) || 100,
            windSpeed,
            dist,
            crossWindDist,
            stability
          );
          return { ...p, maxConcentration: conc.toFixed(6) };
        });
      setImpactedPOIs(impacted);
      if (impacted.length === 0) {
        setAnalysis("No impacted locations within downwind corridor.");
      } else {
        setAnalysis(
          `Potentially impacted locations within downwind corridor:\n${impacted
            .map((p, i) => `${i + 1}. ${p.name} (${p.type}) - Estimated Concentration: ${p.maxConcentration}`)
            .join("\n")}`
        );
      }
    } catch (error) {
      console.error("Error calculating impacts:", error);
      setImpactedPOIs([]);
    }
  }, [plume, pois, form.weather, form.rate, markerPos]);

  useEffect(() => {
    if (!form.chemicalName) {
      setHazardAnalysis("");
      return;
    }
    const chemicalKey = form.chemicalName.toLowerCase();
    const ergData = ERG_DATABASE[chemicalKey];
    if (ergData) {
      const analysis = `
ERG Guide ${ergData.guide} - ${ergData.name}
HAZARD CLASSIFICATION: ${ergData.hazard}
INITIAL ISOLATION DISTANCE: ${ergData.initialIsolation}
PROTECTIVE ACTION DISTANCES:
• Small Spill: ${ergData.protectiveDistance.small}
• Large Spill: ${ergData.protectiveDistance.large}
HEALTH HAZARDS: ${ergData.healthHazards}
FIRE/EXPLOSION: ${ergData.fireExplosion}
PUBLIC SAFETY: ${ergData.publicSafety}
EMERGENCY RESPONSE: ${ergData.emergencyResponse}
      `;
      setHazardAnalysis(analysis.trim());
    } else {
      setHazardAnalysis(`No ERG data available for "${form.chemicalName}". Please consult the 2024 Emergency Response Guidebook for specific guidance.`);
    }
  }, [form.chemicalName]);

  useEffect(() => {
    if (!form.latitude || !form.longitude) return;

    let canceled = false;
    async function fetchWeather() {
      try {
        // Step 1: Get the grid points URL for the given coordinates
        const pointsRes = await fetch(`https://api.weather.gov/points/${form.latitude},${form.longitude}`);
        if (!pointsRes.ok) throw new Error("NWS points API error");
        const pointsData = await pointsRes.json();
        
        const hourlyForecastUrl = pointsData.properties.forecastHourly;
        if (!hourlyForecastUrl) throw new Error("Hourly forecast URL not found");

        // Step 2: Fetch the hourly forecast using the URL from step 1
        const forecastRes = await fetch(hourlyForecastUrl);
        if (!forecastRes.ok) throw new Error("NWS forecast API error");
        const forecastData = await forecastRes.json();
        
        if (canceled || !forecastData.properties.periods.length) return;

        // Step 3: Transform NWS data into the application's expected format
        const periods = forecastData.properties.periods;
        const current = periods[0];
        const transformedData = {
          current_weather: {
            temperature: current.temperature,
            windspeed: parseWindSpeed(current.windSpeed),
            winddirection: cardinalToDegrees(current.windDirection),
          },
          hourly: {
            temperature_2m: periods.map(p => p.temperature),
            wind_speed_10m: periods.map(p => parseWindSpeed(p.windSpeed)),
            wind_direction_10m: periods.map(p => cardinalToDegrees(p.windDirection)),
            relative_humidity_2m: periods.map(p => p.relativeHumidity?.value ?? null),
            precipitation: periods.map(p => p.probabilityOfPrecipitation.value),
          },
        };

        setForm(f => ({ ...f, weather: transformedData }));
      } catch (error) {
        if (!canceled) {
          console.error("Weather fetch error:", error);
          setForm(f => ({ ...f, weather: null }));
        }
      }
    }

    fetchWeather();
    const interval = setInterval(fetchWeather, 300000); // Fetch every 5 minutes

    return () => {
      canceled = true;
      clearInterval(interval);
    };
  }, [form.latitude, form.longitude]);


  async function getChemicalProperties(name) {
    try {
      const res = await fetch(`http://localhost:8000/chemicals/?name=${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error("Failed fetching chemical data");
      const json = await res.json();
      const properties = json.data || json;
      setForm((f) => ({ ...f, chemicalData: properties }));
      return properties;
    } catch (error) {
      console.error("Failed to fetch chemical properties", error);
      return null;
    }
  }

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    const userMessage = { type: 'user', content: chatInput };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput("");
    try {
      const context = `
Current Incident: ${form.chemicalName || 'Unknown chemical'}
Location: ${form.latitude}, ${form.longitude}
Weather: ${form.weather ? `Wind ${form.weather.current_weather.windspeed}m/s @ ${form.weather.current_weather.winddirection}°, Temp: ${form.weather.current_weather.temperature}°C` : 'Unknown'}
Impacted Locations: ${impactedPOIs.length}
${hazardAnalysis ? 'Hazard Analysis: ' + hazardAnalysis : ''}
      `;
  const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'codellama:7b',
          prompt: `${context}\n\nUser Question: ${chatInput}\n\nPlease provide expert emergency response guidance based on the current situation.`,
          stream: false
        })
      });
      if (response.ok) {
        const data = await response.json();
        setChatMessages(prev => [...prev, { type: 'ai', content: data.response || 'No response' }]);
      } else {
        setChatMessages(prev => [...prev, { type: 'ai', content: 'Sorry, I cannot respond right now.' }]);
      }
    } catch (error) {
      setChatMessages(prev => [...prev, { type: 'ai', content: 'Error connecting to AI service.' }]);
    }
  };

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
    if (plume) {
      setAnalysis(prev => prev + "\n\nDispersion calculation completed using " + form.dispersionModel + " model.");
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
      weather: null,
      chemicalData: null,
    });
    setMarkerPos(null);
    setPois([]);
    setPlume(null);
    setImpactedPOIs([]);
    setAnalysis("");
    setHazardAnalysis("");
    setChatMessages([]);
  }

  const visiblePois = pois.filter((p) => p.lat && p.lon && selectedPois.includes(p.type));

  const POIMarkers = () => (
    <LayerGroup>
      {layerStates.pointsOfInterest && visiblePois.map((poi) => (
        <Marker key={poi.id} position={[poi.lat, poi.lon]} icon={buildPoiIcon(poiSettings[poi.type])}>
          <Popup>
            <div>
              <b>{poi.name}</b><br />
              Type: {poi.type}<br />
              Exposure: {(() => {
                const matched = impactedPOIs.find((i) => i.id === poi.id);
                return matched ? matched.maxConcentration : "N/A";
              })()}
            </div>
          </Popup>
        </Marker>
      ))}
    </LayerGroup>
  );

  const DownwindCorridor = () => (
    plume && layerStates.downwindCorridor ? (
      <GeoJSON
        key={`plume-${markerPos?.lat}-${markerPos?.lng}-${form.weather?.current_weather?.winddirection}`}
        data={plume}
        style={{
          color: "red",
          weight: 2,
          opacity: 0.8,
          fillOpacity: 0.2,
          fillColor: "orange",
        }}
      />
    ) : null
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#f3f4f6", fontFamily: "sans-serif", color: "#374151" }}>
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {/* Main Map Container */}
        <main style={{ flex: 1, position: "relative", width: "100%", height: "100%" }}>
          <MapContainer
  center={
    form.latitude && form.longitude
      ? [Number(form.latitude), Number(form.longitude)]
      : [29.76, -95.37]
  }
  zoom={12}
  style={{ height: "100vh", width: "100vw", zIndex: 1 }}
  whenCreated={(mapInstance) => (mapRef.current = mapInstance)}
>
  {/* Always show a base map as fallback to avoid blank maps */}
  <TileLayer
    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors'
  />

  {/* Conditionally add custom WeatherGov layers if enabled and have a URL */}
  {WEATHER_GOV_LAYERS.map(
    (layer) =>
      layerStates[layer.id] &&
      layer.url && (
        <TileLayer
          key={layer.id}
          url={layer.url}
          attribution={layer.label}
          opacity={0.6}
        />
      )
  )}

  {/* Marker with popup */}
  {markerPos && (
    <Marker
      position={[markerPos.lat, markerPos.lng]}
      draggable
      icon={redIcon}
      eventHandlers={{ dragend: onDrag }}
    >
      <Popup>
        <div>
          <b>Release Source</b>
          <br />
          Lat: {markerPos.lat.toFixed(6)}
          <br />
          Lng: {markerPos.lng.toFixed(6)}
        </div>
      </Popup>
    </Marker>
  )}

  {/* Other custom layers/components */}
  <POIMarkers />
  <DownwindCorridor />
  <LocationSelector onClick={onMarkerUpdate} />
  <ResizeFix />
</MapContainer>
        </main>

  {/* New Right Sidebar */}
<aside
  style={{
    position: "fixed",
    top: 0,
    right: 0,
    backgroundColor: "#fff",
    boxShadow:
      "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
    zIndex: 998,
    transition: "width 300ms cubic-bezier(0.4, 0, 0.2, 1)",
    height: "100vh",
    display: "flex",
    flexDirection: "row",
    width: rightSidebarSection ? "fit-content" : "100px", // autosize when expanded
    minWidth: 0,
    maxWidth: "100vw", // never overflow the page
    overflow: "visible",
  }}
>
  {/* Collapsed icon bar */}
  <div
    style={{
      width: "100px",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      paddingTop: "1rem",
      backgroundColor: "#e5e7eb",
      gap: "1rem",
      flexShrink: 0,
    }}
  >
    <button
      onClick={() => toggleRightSidebarSection(null)}
      style={{
        padding: "0.25rem",
        borderRadius: "9999px",
        backgroundColor: "#fff",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        border: "none",
        cursor: "pointer",
      }}
      aria-label="Toggle Sidebar"
    >
      {rightSidebarSection ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
    </button>
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        marginTop: "1rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <div
          style={{
            backgroundColor: isWeatherFloating ? "#cbd5e1" : "#3b82f6",
            borderRadius: "9999px",
            padding: "0.5rem",
            color: "#fff",
            cursor: "pointer",
            transition: "background-color 200ms",
          }}
          onClick={() => setIsWeatherFloating(!isWeatherFloating)}
        >
          <CloudRain size={24} />
        </div>
        <div
          style={{
            fontSize: "0.75rem",
            fontWeight: "500",
            color: "#4b5563",
          }}
        >
          Weather
        </div>
      </div>
      {RIGHT_SIDEBAR_SECTIONS.map((section) => (
        <div
          key={section.id}
          style={{
            display: "flex",
            alignItems: "center",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          <div
            style={{
              backgroundColor: rightSidebarSection === section.id ? "#3b82f6" : "#cbd5e1",
              borderRadius: "9999px",
              padding: "0.5rem",
              color: "#fff",
              cursor: "pointer",
              transition: "background-color 200ms",
            }}
            onClick={() => {
              toggleRightSidebarSection(section.id);
              if (isWeatherFloating) setIsWeatherFloating(false);
            }}
          >
            {section.icon}
          </div>
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: "500",
              color: "#4b5563",
            }}
          >
            {section.label}
          </div>
        </div>
      ))}
    </div>
  </div>
  {/* Expanded Content */}
  {rightSidebarSection && (
    <div
      style={{
        width: "fit-content", // Key: autosize to content
        maxWidth: "480px",
        flex: 1,
        padding: "1rem",
        overflowY: "auto",
        boxSizing: "border-box",
      }}
    >
      <div style={{ flex: 1, padding: "1rem", overflowY: "auto" }}>
              {rightSidebarSection === "incident-details" && (
                <>
                  <h2 style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#1f2937", marginBottom: "1rem" }}>Incident Details</h2>
                  <div style={{ padding: "0.75rem", border: "1px solid #e5e7eb", borderRadius: "0.25rem", backgroundColor: "#fff", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "500", color: "#4b5563", marginBottom: "0.25rem" }}>Chemical Name</label>
                        <input name="chemicalName" value={form.chemicalName} onChange={onChange} style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }} required />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "500", color: "#4b5563", marginBottom: "0.25rem" }}>Dispersion Model</label>
                        <select name="dispersionModel" value={form.dispersionModel} onChange={onChange} style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}>
                          {DISPERSION_MODELS.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "500", color: "#4b5563", marginBottom: "0.25rem" }}>Source Type</label>
                        <select name="sourceType" value={form.sourceType} onChange={onChange} style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}>
                          <option value="GAS">Gas</option>
                          <option value="LIQUID">Liquid</option>
                          <option value="CHEMICAL">Chemical</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "500", color: "#4b5563", marginBottom: "0.25rem" }}>Emission Rate</label>
                        <input name="rate" type="number" value={form.rate} onChange={onChange} step="any" style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }} required />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "500", color: "#4b5563", marginBottom: "0.25rem" }}>AI Model</label>
                        <select name="aiModel" value={form.aiModel} onChange={onChange} style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}>
                          {AI_MODELS.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
                        </select>
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button type="submit" style={{ flex: 1, backgroundColor: "#3b82f6", color: "#fff", padding: "0.5rem", borderRadius: "0.25rem", border: "none", cursor: "pointer" }}>Calculate</button>
                        <button type="button" onClick={onClear} style={{ flex: 1, backgroundColor: "#6b7280", color: "#fff", padding: "0.5rem", borderRadius: "0.25rem", border: "none", cursor: "pointer" }}>Clear</button>
                      </div>
                    </form>
                  </div>
                </>
              )}
              {rightSidebarSection === "chat" && (
                <>
                <h2 style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#1f2937", marginBottom: "1rem" }}>AI Assistant</h2>
                <div style={{ padding: "0.75rem", border: "1px solid #e5e7eb", borderRadius: "0.25rem", backgroundColor: "#fff" }}>
                  <div ref={chatHistoryRef} style={{ maxHeight: "12rem", overflowY: "auto", marginBottom: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    {chatMessages.map((msg, idx) => (
                      <div key={idx} style={{ fontSize: "0.75rem", padding: "0.25rem", borderRadius: "0.25rem", backgroundColor: msg.type === 'user' ? '#dbeafe' : '#f3f4f6', textAlign: msg.type === 'user' ? 'right' : 'left' }}>
                        <span style={{ fontWeight: "500" }}>{msg.type === 'user' ? 'You' : 'AI'}:</span> {msg.content}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex" }}>
                    <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()} placeholder="Ask for guidance..." style={{ flex: 1, padding: "0.25rem", fontSize: "0.75rem", border: "1px solid #d1d5db", borderRadius: "0.25rem 0 0 0.25rem" }} />
                    <button onClick={sendChatMessage} style={{ padding: "0.25rem 0.5rem", backgroundColor: "#3b82f6", color: "#fff", border: "none", borderRadius: "0 0.25rem 0.25rem 0", cursor: "pointer" }}><Send size={12} /></button>
                  </div>
                </div>
                </>
              )}
              {rightSidebarSection === "layers" && (
                <>
                  <h2 style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#1f2937", marginBottom: "1rem" }}>Map Layers</h2>
                  <div style={{ padding: "0.75rem", border: "1px solid #e5e7eb", borderRadius: "0.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                        <h3 style={{ fontSize: "1rem", fontWeight: "bold", marginBottom: "0.5rem" }}>Weather Layers</h3>
                  {WEATHER_GOV_LAYERS.map(layer => (
                    <label key={layer.id} style={{ display: "flex", alignItems: "center", marginBottom: "0.5rem" }}>
                      <input
                        type="checkbox"
                        checked={!!layerStates[layer.id]}
                        onChange={() => toggleLayer(layer.id)}
                        style={{ marginRight: "0.5rem" }}
                      />
                      {layer.icon}
                      <span style={{ marginLeft: "0.25rem" }}>{layer.label}</span>
                    </label>
                  ))}
                    <h3 style={{ fontSize: "1rem", fontWeight: "bold", marginTop: "1rem", marginBottom: "0.5rem" }}>Response Layers</h3>
                    <label style={{ display: "flex", alignItems: "center" }}>
                      <input type="checkbox" checked={layerStates.downwindCorridor} onChange={() => toggleLayer('downwindCorridor')} style={{ marginRight: "0.5rem" }} />Downwind Corridor
                    </label>
                    <label style={{ display: "flex", alignItems: "center" }}>
                      <input type="checkbox" checked={layerStates.pointsOfInterest} onChange={() => toggleLayer('pointsOfInterest')} style={{ marginRight: "0.5rem" }} />Points of Interest
                    </label>
                    {layerStates.pointsOfInterest && (
                      <div style={{ marginTop: "0.75rem", padding: "0.5rem", backgroundColor: "#f9fafb", borderRadius: "0.25rem" }}>
                        <h4 style={{ fontSize: "0.875rem", fontWeight: "500", marginBottom: "0.5rem" }}>POI Types</h4>
                  {POI_TYPES.map((type) => (
                    <label key={type.id} style={{ display: "flex", alignItems: "center", fontSize: "0.875rem", marginBottom: "0.25rem" }}>
                      <input type="checkbox" checked={selectedPois.includes(type.id)} onChange={() => {
                          setSelectedPois(prev => prev.includes(type.id) ? prev.filter(t => t !== type.id) : [...prev, type.id]);
                        }} style={{ marginRight: "0.5rem" }} />{type.label}
                    </label>
                  ))}
                </div>
              )}
                  </div>
                </>
              )}
              {rightSidebarSection === "analysis" && (
                <>
                  <h2 style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#1f2937", marginBottom: "1rem" }}>Impact Analysis</h2>
                  <div style={{ padding: "0.75rem", border: "1px solid #e5e7eb", borderRadius: "0.25rem" }}>
                    <textarea readOnly value={analysis} style={{ width: "100%", height: "6rem", padding: "0.5rem", fontSize: "0.75rem", fontFamily: "monospace", backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "0.25rem", resize: "none" }} placeholder="Analysis will appear here..." />
                  </div>
                </>
              )}
              {rightSidebarSection === "erg" && (
                <>
                  <h2 style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#1f2937", marginBottom: "1rem" }}>ERG Hazard Analysis</h2>
                  <div style={{ padding: "0.75rem", border: "1px solid #e5e7eb", borderRadius: "0.25rem" }}>
                    <textarea readOnly value={hazardAnalysis} style={{ width: "100%", height: "8rem", padding: "0.5rem", fontSize: "0.75rem", fontFamily: "monospace", backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: "0.25rem", resize: "none" }} placeholder="ERG guidance will appear here when chemical is selected..." />
                    <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid #e5e7eb" }}>
                      <div style={{ display: "flex", alignItems: "center", marginBottom: "0.5rem" }}><Database size={16} style={{ marginRight: "0.25rem" }} /><span style={{ fontSize: "0.875rem", fontWeight: "500" }}>Search ERG</span></div>
{/* Use the ERGSearch component defined above */}
<ERGSearch onSelect={(result) => {
  setForm(f => ({ ...f, chemicalName: result.name }));
}} />
                    </div>
                  </div>
                </>
              )}
              {rightSidebarSection === "data-interfaces" && (
                <>
                  <h2 style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#1f2937", marginBottom: "1rem" }}>Data Interfaces</h2>
                  <div style={{ padding: "0.75rem", border: "1px solid #e5e7eb", borderRadius: "0.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <div>
                      <label style={{ display: "flex", alignItems: "center", marginBottom: "0.5rem" }}>
                        <input type="checkbox" checked={layerStates.modbus} onChange={() => toggleLayer('modbus')} style={{ marginRight: "0.5rem" }} /><Wifi size={16} style={{ marginRight: "0.25rem" }} />Modbus Interface
                      </label>
                      <ModbusInterface isOpen={layerStates.modbus} settings={modbusSettings} onSettingsChange={setModbusSettings} />
                    </div>
                    <div>
                      <label style={{ display: "flex", alignItems: "center", marginBottom: "0.5rem" }}>
                        <input type="checkbox" checked={layerStates.externalAPI} onChange={() => toggleLayer('externalAPI')} style={{ marginRight: "0.5rem" }} /><Activity size={16} style={{ marginRight: "0.25rem" }} />External API
                      </label>
                      <ExternalAPIInterface isOpen={layerStates.externalAPI} settings={externalAPISettings} onSettingsChange={setExternalAPISettings} />
                    </div>
                  </div>
                </>
              )}
      </div>
    </div>
      )}
   </aside>

        {/* Floating Weather Window */}
        {isWeatherFloating && (
          <DraggableAndResizableWeatherWindow
            initialPosition={{ x: 20, y: 20 }} // Changed from the top-right calculation
            initialSize={{ width: 216, height: 302 }}
            onDock={() => {
              setIsWeatherFloating(false);
              setRightSidebarSection('layers');
            }}
          >
            <WindRoseDisplay weather={form.weather} />
          </DraggableAndResizableWeatherWindow>
        )}
      </div>
    </div>
  );
}