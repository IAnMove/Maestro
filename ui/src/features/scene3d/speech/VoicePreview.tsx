import { useEffect, useRef } from 'react'

export function VoicePreview({ url, label, disabled }: { url: string; label: string; disabled: boolean }) {
  const ref = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    const audio = ref.current
    if (disabled) audio?.pause()
    return () => audio?.pause()
  }, [url, disabled])
  return <audio ref={ref} controls src={url} preload="metadata" className="w-full min-w-0" aria-label={label} />
}
