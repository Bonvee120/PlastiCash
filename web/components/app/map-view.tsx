"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

// Leaflet + OpenStreetMap (TRD). Client only: load with next/dynamic and ssr: false.
// Markers are plain coloured dots (no image files to bundle): green = home, amber = collector.


const dot = (color: string, size = 22) =>
  L.divIcon({
    className: "",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:999px;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(5,46,22,.45)"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

const HOME = dot("#15803D");
const COLLECTOR = dot("#F59E0B", 26);

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);
  return null;
}

function ClickToMove({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (event) => onMove(event.latlng.lat, event.latlng.lng) });
  return null;
}

// Pick a spot: drag the pin or tap the map.
export function PinPicker({ value, onChange }: { value: [number, number]; onChange: (lat: number, lng: number) => void }) {
  return (
    <MapContainer center={value} zoom={15} className="h-64 w-full rounded-xl" scrollWheelZoom={false}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker
        position={value}
        icon={HOME}
        draggable
        eventHandlers={{
          dragend: (event) => {
            const { lat, lng } = (event.target as L.Marker).getLatLng();
            onChange(lat, lng);
          },
        }}
      />
      <ClickToMove onMove={onChange} />
      <Recenter center={value} />
    </MapContainer>
  );
}

// Watch the collector come: home pin and the collector's latest position.
export function LiveMap({ home, collector }: { home: [number, number]; collector: [number, number] | null }) {
  return (
    <MapContainer center={collector ?? home} zoom={14} className="h-64 w-full" scrollWheelZoom={false}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={home} icon={HOME} />
      {collector && <Marker position={collector} icon={COLLECTOR} />}
      {collector && <Recenter center={collector} />}
    </MapContainer>
  );
}
