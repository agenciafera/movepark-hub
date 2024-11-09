'use client'

import { ParkingSpot } from '@/types/parking'
import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

interface ParkingMapProps {
  spots: ParkingSpot[]
  selectedSpot: ParkingSpot | null
  onSpotSelect: (spot: ParkingSpot) => void
}

export function ParkingMap({ spots, selectedSpot, onSpotSelect }: ParkingMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markers = useRef<mapboxgl.Marker[]>([])

  useEffect(() => {
    if (!mapContainer.current) return

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [2.3522, 48.8566], // Paris coordinates
      zoom: 13
    })

    return () => {
      map.current?.remove()
    }
  }, [])

  useEffect(() => {
    if (!map.current) return

    // Clear existing markers
    markers.current.forEach(marker => marker.remove())
    markers.current = []

    // Add new markers
    spots.forEach(spot => {
      const el = document.createElement('div')
      el.className = 'marker'
      el.innerHTML = `<div class="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center">${spot.price}€</div>`

      const marker = new mapboxgl.Marker(el)
        .setLngLat([spot.coordinates.lng, spot.coordinates.lat])
        .addTo(map.current!)

      marker.getElement().addEventListener('click', () => {
        onSpotSelect(spot)
      })

      markers.current.push(marker)
    })
  }, [spots, onSpotSelect])

  useEffect(() => {
    if (!map.current || !selectedSpot) return

    map.current.flyTo({
      center: [selectedSpot.coordinates.lng, selectedSpot.coordinates.lat],
      zoom: 15
    })
  }, [selectedSpot])

  return (
    <div ref={mapContainer} className="w-full h-full rounded-lg" />
  )
} 