import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconShadowUrl from 'leaflet/dist/images/marker-shadow.png';

// Fix default marker icon for react-leaflet
let DefaultIcon = L.icon({
  iconUrl,
  shadowUrl: iconShadowUrl,
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

function App() {
  const [locations, setLocations] = useState([]);
  const center = [51.505, -0.09];

  useEffect(() => {
    fetch('/api/locations')
      .then((res) => res.json())
      .then((data) => setLocations(data))
      .catch((err) => console.error('Error fetching locations:', err));
  }, []);

  return (
    <div className="app-container" style={{ display: 'flex', height: '100vh', margin: 0 }}>
      {/* Sidebar */}
      <div
        className="sidebar"
        style={{
          width: '300px',
          padding: '20px',
          backgroundColor: '#f0f0f0',
          overflowY: 'auto',
          boxSizing: 'border-box',
        }}
      >
        <h1>CHAD Chemical Dispersion</h1>
        <p>Sidebar content goes here — controls, input forms, chemical info, etc.</p>
        {/* You can add forms or controls here */}
      </div>

      {/* Map container */}
      <div className="map-container" style={{ flexGrow: 1, height: '100vh' }}>
        <MapContainer center={center} zoom={3} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {locations.map((loc) => (
            <Marker key={loc.id} position={[loc.latitude, loc.longitude]}>
              <Popup>{loc.name}</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

export default App;
