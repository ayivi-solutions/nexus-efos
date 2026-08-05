"use client";

import { useState } from "react";

// Real browser geolocation — navigator.geolocation is a native web API,
// no external service or hardware SDK required. Used for asset
// registration location and on-the-spot verification capture.
export function useGeolocation() {
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  function capture() {
    if (!navigator.geolocation) { setError("Geolocation is not available in this browser."); return; }
    setCapturing(true); setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); setCapturing(false); },
      (err) => { setError(err.code === err.PERMISSION_DENIED ? "Location access was denied." : "Could not determine location."); setCapturing(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return { coords, error, capturing, capture };
}
