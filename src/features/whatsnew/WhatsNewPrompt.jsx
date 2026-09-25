import { useEffect, useState } from 'react'
import { claimPromptSlot, releasePromptSlot, whenPromptSlotFree } from '../../shared/lib/promptGate.js'
import { updateProfile } from '../../shared/lib/profile.js'
import { RELEASES } from './releases.js'
import { createSeenTracker, pickRelease } from './whatsNewMath.js'
import WhatsNewStory from './WhatsNewStory.jsx'

// A moment after the app has loaded, so the first screen settles first.
const DELAY_MS = 1500

// What this account has seen: profiles.whats_new_seen (0087), plus what this
// session marked, so a failed write can't show the story twice in a session.
const seen = createSeenTracker({
  save: (userId, id) => updateProfile(userId, { whats_new_seen: id }),
})

// The once-per-release "What's new" story (whatsNewMath.js decides which, if
// any), once per account. App mounts it only once the profile has loaded,
// outside the legal gate, the setup wizard and the app tour; it takes turns
// with the passkey and notification prompts through the prompt slot, so they
// never stack. It's remembered as seen when it opens, so closing the app
// mid-story doesn't bring it back.
export default function WhatsNewPrompt({ profile }) {
  const [release, setRelease] = useState(null)
  const { id: userId, whats_new_seen: profileSeen, onboarded_at: onboardedAt } = profile

  useEffect(() => {
    let active = true
    let t
    seen.load(userId, profileSeen).then((seenId) => {
      if (!active) return
      const { show, markSeen } = pickRelease(RELEASES, { seenId, onboardedAt })
      if (!show) {
        if (markSeen) seen.mark(userId, markSeen)
        return
      }
      t = setTimeout(() => {
        whenPromptSlotFree(() => {
          if (!active) return
          claimPromptSlot()
          seen.mark(userId, markSeen)
          setRelease(show)
        })
      }, DELAY_MS)
    })
    return () => { active = false; clearTimeout(t) }
  }, [userId, profileSeen, onboardedAt])

  // Closing it frees the prompt slot; so does unmounting while open (the
  // app tour started, signed out).
  useEffect(() => (release ? releasePromptSlot : undefined), [release])

  return <WhatsNewStory release={release} onClose={() => setRelease(null)} />
}
