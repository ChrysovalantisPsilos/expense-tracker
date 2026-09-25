import { useEffect, useState } from 'react'
import { claimPromptSlot, releasePromptSlot, whenPromptSlotFree } from '../../shared/lib/promptGate.js'
import { RELEASES } from './releases.js'
import { pickRelease, readSeen, writeSeen } from './whatsNewMath.js'
import WhatsNewStory from './WhatsNewStory.jsx'

// A moment after the app has loaded, so the first screen settles first.
const DELAY_MS = 1500

// The once-per-release "What's new" story (whatsNewMath.js decides which, if
// any). App mounts it only once the profile has loaded, outside the legal
// gate, the setup wizard and the app tour; it takes turns with the passkey
// and notification prompts through the prompt slot, so they never stack.
// It's remembered as seen when it opens, so closing the app mid-story
// doesn't bring it back.
export default function WhatsNewPrompt({ onboardedAt }) {
  const [release, setRelease] = useState(null)

  useEffect(() => {
    const { show, markSeen } = pickRelease(RELEASES, { seenId: readSeen(), onboardedAt })
    if (!show) {
      if (markSeen) writeSeen(markSeen)
      return
    }
    let active = true
    const t = setTimeout(() => {
      whenPromptSlotFree(() => {
        if (!active) return
        claimPromptSlot()
        writeSeen(markSeen)
        setRelease(show)
      })
    }, DELAY_MS)
    return () => { active = false; clearTimeout(t) }
  }, [onboardedAt])

  // Closing it frees the prompt slot; so does unmounting while open (the
  // app tour started, signed out).
  useEffect(() => (release ? releasePromptSlot : undefined), [release])

  return <WhatsNewStory release={release} onClose={() => setRelease(null)} />
}
