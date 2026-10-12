"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

// Leaflet needs the browser (window), so the maps load on the client only. Never import ./map-view
// statically from here, not even a constant: that pulls Leaflet into the server render.
export const ENUGU: [number, number] = [6.4584, 7.5464];

const loading = () => <Skeleton className="h-64 w-full rounded-xl" />;

export const PinPicker = dynamic(() => import("./map-view").then((m) => m.PinPicker), { ssr: false, loading });
export const LiveMap = dynamic(() => import("./map-view").then((m) => m.LiveMap), { ssr: false, loading });
