// Appearance preference maths (pure). The preference is 'light' | 'dark' |
// 'system'; 'system' follows the device (prefers-color-scheme) live.

// The colour mode a preference shows, given whether the device is dark.
export const resolveMode = (pref, systemDark) =>
  (pref === 'system' ? (systemDark ? 'dark' : 'light') : pref)

// The preference after the quick light/dark toggle. It flips what's showing,
// but landing on what the device shows means "follow the device" again: one
// tap pins the opposite theme, a second tap undoes it instead of leaving the
// app pinned to a theme that only happens to match the device today.
export function toggledPref(showingDark, systemDark) {
  const next = showingDark ? 'light' : 'dark'
  return (next === 'dark') === systemDark ? 'system' : next
}
