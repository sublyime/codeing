import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, GeoJSON, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconShadowUrl from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl,
  shadowUrl: iconShadowUrl,
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

function LocationSelector({ onLocation }) {
  useMapEvents({
    click(e) {
      onLocation(e.latlng);
    },
  });
  return null;
}

const sourceTypeOptions = {
  GAS: { label: 'Gas', rateLabel: 'Source Concentration (ppm)' },
  LIQUID: { label: 'Liquid', rateLabel: 'Source Volume (liters/sec)' },
  CHEMICAL: { label: 'Chemical', rateLabel: 'Source Mass (kg/sec)' },
};

const modelOptions = [
  { value: 'GAUSSIAN', label: 'Gaussian' },
  { value: 'ALOHA', label: 'ALOHA' },
];

function App() {
  const [formData, setFormData] = useState({
    chemicalName: '',
    model: 'GAUSSIAN',
    latitude: '',
    longitude: '',
    sourceType: 'GAS',
    sourceRate: '',
    citySearch: '',
    weather: null,
  });
  const [markerPos, setMarkerPos] = useState(null);
  const [plume, setPlume] = useState(null);
  const [receptors, setReceptors] = useState([]);
  const [placesOfConcern, setPlacesOfConcern] = useState([]);
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [layers, setLayers] = useState({
    plume: true,
    receptors: true,
  });

  const mapRef = useRef();

  useEffect(() => {
    console.log('Plume updated:', plume);
  }, [plume]);

  const onLocation = (latlng) => {
    setMarkerPos(latlng);
    setFormData(prev => ({
      ...prev,
      latitude: latlng.lat.toFixed(6),
      longitude: latlng.lng.toFixed(6),
      weather: null,
    }));
  };

  const fetchWeather = async (lat, lon) => {
    try {
      const pointUrl = `https://api.weather.gov/points/${lat},${lon}`;
      const pointResponse = await fetch(pointUrl);
      if (!pointResponse.ok) throw new Error('Error fetching point info');
      const pointData = await pointResponse.json();

      const stationsUrl = pointData.properties.observationStations;
      const stationsResponse = await fetch(stationsUrl);
      if (!stationsResponse.ok) throw new Error('Error fetching stations');
      const stationsData = await stationsResponse.json();

      if (!stationsData.features || stationsData.features.length === 0) throw new Error('No stations found');

      const stationId = stationsData.features[0].id;
      const obsUrl = `${stationId}/observations/latest`;

      const obsResponse = await fetch(obsUrl);
      if (!obsResponse.ok) throw new Error('Error fetching latest observation');
      const obsData = await obsResponse.json();

      const props = obsData.properties;
      setFormData(prev => ({
        ...prev,
        weather: {
          temperature: props.temperature?.value,
          windSpeed: props.windSpeed?.value,
          windDirection: props.windDirection?.value,
          humidity: props.relativeHumidity?.value,
          textDescription: props.textDescription,
        },
      }));
    } catch (error) {
      console.error('Weather fetch error:', error);
      alert('Weather data unavailable');
    }
  };

  useEffect(() => {
    if (formData.latitude && formData.longitude) {
      fetchWeather(formData.latitude, formData.longitude);
    } else {
      setFormData(prev => ({ ...prev, weather: null }));
    }
  }, [formData.latitude, formData.longitude]);

  const fetchPlacesOfConcern = async (polygonGeoJson) => {
    if (!polygonGeoJson) return;

    console.log('Fetching places for polygon:', polygonGeoJson);

    const coords = polygonGeoJson.geometry?.coordinates?.[0];
    if (!coords || coords.length < 3) {
      console.warn('Invalid polygon coordinates');
      return;
    }

    const lons = coords.map(c => c[0]);
    const lats = coords.map(c => c[1]);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    console.log('Bounding Box:', minLat, minLon, maxLat, maxLon);

    const query = `
      [out:json][timeout:25];
      (
        node["amenity"](${minLat},${minLon},${maxLat},${maxLon});
        way["amenity"](${minLat},${minLon},${maxLat},${maxLon});
        relation["amenity"](${minLat},${minLon},${maxLat},${maxLon});
      );
      out center;
    `;

    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: query,
      });

      if (!response.ok) {
        console.error('Overpass API error:', response.statusText);
        setPlacesOfConcern([]);
        return;
      }

      const data = await response.json();
      const places = data.elements.map(e => ({
        name: e.tags?.name || 'Unnamed',
        type: e.tags?.amenity || 'Unknown',
        lat: e.lat || e.center?.lat,
        lon: e.lon || e.center?.lon,
      }));

      console.log('Places retrieved:', places);
      setPlacesOfConcern(places);
    } catch (error) {
      console.error('Error fetching places of concern:', error);
      setPlacesOfConcern([]);
    }
  };

  useEffect(() => {
    if (plume) {
      fetchPlacesOfConcern(plume);
    } else {
      setPlacesOfConcern([]);
    }
  }, [plume]);

  const calculatePlumeArea = (plumeGeoJson) => {
    const coords = plumeGeoJson?.geometry?.coordinates?.[0];
    if (!coords || coords.length < 3) return null;
    let area = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      area += coords[i][0] * coords[i + 1][1] - coords[i + 1][0] * coords[i][1];
    }
    return Math.abs(area) / 2;
  };

  const onInputChange = e => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleClear = () => {
    setFormData({
      chemicalName: '',
      model: 'GAUSSIAN',
      latitude: '',
      longitude: '',
      sourceType: 'GAS',
      sourceRate: '',
      citySearch: '',
      weather: null,
    });
    setMarkerPos(null);
    setPlume(null);
    setReceptors([]);
    setPlacesOfConcern([]);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!formData.chemicalName || !formData.latitude || !formData.longitude || !formData.sourceRate) {
      alert("Please fill in all required fields.");
      return;
    }
    const payload = {
      chemicalName: formData.chemicalName,
      model: formData.model,
      latitude: parseFloat(formData.latitude),
      longitude: parseFloat(formData.longitude),
      sourceType: formData.sourceType,
      sourceRate: parseFloat(formData.sourceRate),
      incidentType: "GAS",
    };
    try {
      const resp = await fetch('/api/dispersion/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error(`Server error: ${resp.statusText}`);
      const data = await resp.json();
      if (data.geoJsonPlume) {
        setPlume(JSON.parse(data.geoJsonPlume));
      } else {
        setPlume(null);
      }
      if (data.receptors) {
        setReceptors(data.receptors);
      } else {
        setReceptors([]);
      }
    } catch (ex) {
      alert(`Error: ${ex.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ width: 360, padding: 20, background: '#f0f0f0', overflowY: 'auto' }}>
        <h2>CHAD Hazard Analysis by Ty Fairchild</h2>

        <div>
          <label>
            Chemical Name*:
            <input name="chemicalName" value={formData.chemicalName} onChange={onInputChange} required />
          </label>
        </div>
        <div>
          <label>
            Model:
            <select name="model" value={formData.model} onChange={onInputChange}>
              {modelOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>
        <div>
          <label>
            Source Type:
            <select name="sourceType" value={formData.sourceType} onChange={onInputChange}>
              {Object.entries(sourceTypeOptions).map(([key, opt]) => (
                <option key={key} value={key}>{opt.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <label>
            {sourceTypeOptions[formData.sourceType].rateLabel}*:
            <input name="sourceRate" type="number" step="any" value={formData.sourceRate} onChange={onInputChange} required />
          </label>
        </div>
        <div>
          <label>
            Latitude:
            <input readOnly name="latitude" value={formData.latitude} />
          </label>
        </div>
        <div>
          <label>
            Longitude:
            <input readOnly name="longitude" value={formData.longitude} />
          </label>
        </div>
        <button onClick={handleSubmit}>Run Model</button>
        <button onClick={handleClear} style={{ marginLeft: 10 }}>Clear</button>

        {formData.weather && (
          <div style={{ marginTop: 10, padding: 10, background: '#e7f3fe' }}>
            <strong>Weather:</strong>
            <p>Temperature: {formData.weather.temperature ? formData.weather.temperature.toFixed(1) + ' °C' : 'N/A'}</p>
            <p>Humidity: {formData.weather.humidity ? formData.weather.humidity + ' %' : 'N/A'}</p>
            <p>Wind: {formData.weather.windSpeed ? formData.weather.windSpeed.toFixed(1) + ' m/s' : 'N/A'} at {formData.weather.windDirection || 'N/A'}°</p>
            <p>Condition: {formData.weather.textDescription || 'N/A'}</p>
          </div>
        )}
      </div>

      <div style={{ flexGrow: 1, position: 'relative' }}>
        <MapContainer center={[29.76, -95.37]} zoom={10} style={{ height: '100vh' }} whenCreated={map => { mapRef.current = map; }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
          <LocationSelector onLocation={onLocation} />
          {markerPos && layers.receptors && <Marker position={markerPos} />}
          {plume && layers.plume && <GeoJSON data={plume} />}
        </MapContainer>

        {showAnalysis && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            maxHeight: '40vh', overflowY: 'auto', background: 'white',
            padding: 20, borderTop: '2px solid #ccc', zIndex: 1000,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Analysis</h3>
              <button onClick={() => setShowAnalysis(false)}>Hide</button>
            </div>

            {plume ? (
              <>
                <div><strong>Plume Hazard Summary:</strong> {plume.hazardSummary ? JSON.stringify(plume.hazardSummary) : 'N/A'}</div>
                <div><strong>Plume Area (approx):</strong> {calculatePlumeArea(plume) ? calculatePlumeArea(plume).toFixed(5) + ' degrees²' : 'N/A'}</div>

                {receptors.length > 0 && (
                  <>
                    <h4>Receptors</h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr><th>Name</th><th>Distance</th><th>Exposure Level</th></tr></thead>
                      <tbody>
                        {receptors.map((r, i) => (
                          <tr key={i}>
                            <td>{r.name}</td>
                            <td>{r.distance}</td>
                            <td>{r.exposureLevel}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                {placesOfConcern.length > 0 ? (
                  <>
                    <h4>Places of Concern</h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr><th>Name</th><th>Type</th><th>Coordinates</th></tr></thead>
                      <tbody>
                        {placesOfConcern.map((p, i) => (
                          <tr key={i}>
                            <td>{p.name}</td>
                            <td>{p.type}</td>
                            <td>{p.lat ? p.lat.toFixed(5) : '?'} , {p.lon ? p.lon.toFixed(5) : '?'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <div>No places of concern found within the plume.</div>
                )}

              </>
            ) : (
              <div>No plume data available.</div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}

export default App;

function calculatePlumeArea(plumeGeoJson) {
  const coords = plumeGeoJson?.geometry?.coordinates?.[0];
  if (!coords || coords.length < 3) return null;
  let area = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    area += coords[i][0] * coords[i + 1][1] - coords[i + 1][0] * coords[i][1];
  }
  return Math.abs(area) / 2;
}
