'use client'
import { LocateFixedIcon } from 'lucide-react'

type Props = { onLocate: (lat: number, lng: number) => void }

export function LocateMeButton({ onLocate }: Props) {
  function handleClick() {
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      pos => onLocate(pos.coords.latitude, pos.coords.longitude),
      () => {},
    )
  }
  return (
    <button
      onClick={handleClick}
      aria-label="Locate me"
      className="flex h-9 w-9 items-center justify-center rounded-full border bg-background/95 shadow-lg backdrop-blur-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <LocateFixedIcon className="h-4 w-4" />
    </button>
  )
}
