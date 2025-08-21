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

function LocationSelector({ onLocationSelect }) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng);
    },
  });
  return null;
}

const sourceTypeOptions = {
  GAS: { label: 'Gas', rateLabel: 'Source Release Concentration (ppm)' },
  LIQUID: { label: 'Liquid', rateLabel: 'Source Release Volume (liters/sec)' },
  CHEMICAL: { label: 'Chemical', rateLabel: 'Source Release Mass (kg/sec)' },
};

function App() {
  const [formData, setFormData] = useState({
    chemicalName: '',
    model: 'GAUSSIAN',
    latitude: '',
    longitude: '',
    sourceReleaseType: 'GAS',
    sourceReleaseRate: '',
    citySearch: '',
    weather: null,
  });
  const [markerPosition, setMarkerPosition] = useState(null);
  const [plume, setPlume] = useState(null);
  const [receptors, setReceptors] = useState([]); // Downwind receptors info from backend
  const mapRef = useRef();

  const onLocationSelect = (latlng) => {
    setMarkerPosition(latlng);
    setFormData((prev) => ({
      ...prev,
      latitude: latlng.lat.toFixed(6),
      longitude: latlng.lng.toFixed(6),
      weather: null,
    }));
  };

  const fetchWeather = async (lat, lon) => {
    try {
      const pointsUrl = `https://api.weather.gov/points/${lat},${lon}`;
      const pointsRes = await fetch(pointsUrl);
      if (!pointsRes.ok) throw new Error('Error fetching gridpoint info');
      const pointsData = await pointsRes.json();

      const obsUrl = pointsData.properties.observationStations;
      const obsResList = await fetch(obsUrl);
      if (!obsResList.ok) throw new Error('Error fetching observation stations');
      const obsListData = await obsResList.json();

      if (!obsListData.features || obsListData.features.length === 0)
        throw new Error('No observation stations found');

      const stationId = obsListData.features[0].id;

      const obsUrlLatest = `${stationId}/observations/latest`;
      const obsRes = await fetch(obsUrlLatest);
      if (!obsRes.ok) throw new Error('Error fetching latest observations');
      const obsData = await obsRes.json();

      const properties = obsData.properties;
      setFormData((prev) => ({
        ...prev,
        weather: {
          temperature: properties.temperature?.value,
          windSpeed: properties.windSpeed?.value,
          windDirection: properties.windDirection?.value,
          humidity: properties.relativeHumidity?.value,
          textDescription: properties.textDescription,
        },
      }));
    } catch (err) {
      console.error('Error fetching weather:', err);
      alert('Weather data not available for the selected location');
    }
  };

  const handleCitySearch = async () => {
    if (!formData.citySearch) return;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        formData.citySearch
      )}`;
      const res = await fetch(url);
      const results = await res.json();

      if (results.length === 0) {
        alert('Location not found');
        return;
      }

      const place = results[0];
      const lat = parseFloat(place.lat);
      const lon = parseFloat(place.lon);

      if (mapRef.current) {
        mapRef.current.setView([lat, lon], 13);
      }
      onLocationSelect({ lat, lng: lon });
    } catch (err) {
      console.error('Error searching location:', err);
    }
  };

  useEffect(() => {
    if (formData.latitude && formData.longitude) {
      fetchWeather(formData.latitude, formData.longitude);
    } else {
      setFormData((prev) => ({ ...prev, weather: null }));
    }
  }, [formData.latitude, formData.longitude]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleClear = () => {
    setFormData({
      chemicalName: '',
      model: 'GAUSSIAN',
      latitude: '',
      longitude: '',
      sourceReleaseType: 'GAS',
      sourceReleaseRate: '',
      citySearch: '',
      weather: null,
    });
    setMarkerPosition(null);
    setPlume(null);
    setReceptors([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      chemicalName: formData.chemicalName,
      model: formData.model,
      latitude: parseFloat(formData.latitude),
      longitude: parseFloat(formData.longitude),
      sourceReleaseType: formData.sourceReleaseType,
      sourceReleaseRate: parseFloat(formData.sourceReleaseRate),
      incidentType: "GAS", // consider adjusting or extend based on sourceReleaseType
      // Optionally add weather data etc.
    };

    try {
      const response = await fetch('/api/dispersion/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      const data = await response.json();

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
    } catch (err) {
      alert('Failed to run model: ' + err.message);
    }
  };

  const currentRateLabel = sourceTypeOptions[formData.sourceReleaseType]?.rateLabel || 'Source Release Rate';

  return (
    <div className="app-container" style={{ display: 'flex', height: '100vh', margin: 0 }}>
      <div
        className="sidebar"
        style={{
          width: '360px',
          padding: '20px',
          backgroundColor: '#f0f0f0',
          overflowY: 'auto',
          boxSizing: 'border-box',
        }}
      >
        <h2>CHAD Chemical Hazard Analysis Dispersion<br />by Ty Fairchild</h2>

        <label>
          Search location (city, state, ZIP):
          <input
            name="citySearch"
            type="text"
            value={formData.citySearch}
            onChange={handleChange}
            placeholder="Enter city, state or ZIP"
          />
        </label>
        <button onClick={() => { if (formData.citySearch) handleCitySearch(); }} style={{ marginLeft: 10 }}>
          Search
        </button>

        <hr />

        <form onSubmit={handleSubmit}>
          <label>
            Chemical Name:
            <input name="chemicalName" value={formData.chemicalName} onChange={handleChange} required />
          </label>
          <br />

          <label>
            Model:
            <select name="model" value={formData.model} onChange={handleChange}>
              <option value="GAUSSIAN">Gaussian</option>
            </select>
          </label>
          <br />

          <label>
            Source Release Type:
            <select name="sourceReleaseType" value={formData.sourceReleaseType} onChange={handleChange}>
              {Object.entries(sourceTypeOptions).map(([key, val]) => (
                <option key={key} value={key}>
                  {val.label}
                </option>
              ))}
            </select>
          </label>
          <br />

          <label>
            {currentRateLabel}:
            <input
              name="sourceReleaseRate"
              type="number"
              value={formData.sourceReleaseRate}
              onChange={handleChange}
              required
              step="any"
            />
          </label>
          <br />

          <label>
            Latitude:
            <input name="latitude" type="number" value={formData.latitude} readOnly />
          </label>
          <br />

          <label>
            Longitude:
            <input name="longitude" type="number" value={formData.longitude} readOnly />
          </label>
          <br />

          {formData.weather && (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                backgroundColor: '#e7f3fe',
                borderRadius: 4,
              }}
            >
              <h4>Current Weather</h4>
              <p>
                Temperature:{' '}
                {formData.weather.temperature != null
                  ? formData.weather.temperature.toFixed(1) + ' °C'
                  : 'N/A'}
              </p>
              <p>
                Humidity:{' '}
                {formData.weather.humidity != null ? formData.weather.humidity + ' %' : 'N/A'}
              </p>
              <p>
                Wind:{' '}
                {formData.weather.windSpeed != null
                  ? formData.weather.windSpeed.toFixed(1) + ' m/s'
                  : 'N/A'}{' '}
                at {formData.weather.windDirection || 'N/A'}°
              </p>
              <p>Description: {formData.weather.textDescription || 'N/A'}</p>
            </div>
          )}

          <br />
          <button type="submit">Run Model</button>{' '}
          <button type="button" onClick={handleClear}>
            Clear
          </button>
        </form>

        {receptors.length > 0 && (
          <>
            <hr />
            <h3>Downwind Receptors & Exposure Levels</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #ccc', padding: '4px' }}>Receptor</th>
                  <th style={{ border: '1px solid #ccc', padding: '4px' }}>Distance (m)</th>
                  <th style={{ border: '1px solid #ccc', padding: '4px' }}>Exposure Level</th>
                </tr>
              </thead>
              <tbody>
                {receptors.map((rec, idx) => (
                  <tr key={idx}>
                    <td style={{ border: '1px solid #ccc', padding: '4px' }}>{rec.name}</td>
                    <td style={{ border: '1px solid #ccc', padding: '4px' }}>{rec.distance}</td>
                    <td style={{ border: '1px solid #ccc', padding: '4px' }}>{rec.exposureLevel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <p style={{ marginTop: 20, fontSize: 12, color: '#888' }}>
          Click the map to select a location.
        </p>
      </div>

      <div className="map-container" style={{ flexGrow: 1, height: '100vh' }}>
        <MapContainer
          center={[39.8283, -98.5795]}
          zoom={4}
          style={{ height: '100%', width: '100%' }}
          whenCreated={(mapInstance) => {
            mapRef.current = mapInstance;
          }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LocationSelector onLocationSelect={onLocationSelect} />
          {markerPosition && <Marker position={markerPosition} />}
          {plume && <GeoJSON data={plume} />}
        </MapContainer>
      </div>
    </div>
  );
}

export default App;
