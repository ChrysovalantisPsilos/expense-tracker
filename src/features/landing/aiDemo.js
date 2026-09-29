// Pure, deterministic sample data and timing for the landing page's AI
// helpers illustration (TypeItMock). No clocks, no randomness, no network:
// the lines, amounts and dates are fixed, and each animation is a list of
// frames held for `ms` each, so the loop's length and its resting frame are
// unit-tested (test/landingAiDemo.test.js). The typed lines and the words are
// in the landing namespace (demo.ai.*); the mock shows them by `id`.
import { toMinor } from '../../shared/lib/currency.js'
import { DEMO_CURRENCY } from './landingDemo.js'

// The day the sample lines are typed on ("yesterday" is the 29th).
export const DEMO_TODAY = '2026-09-30'

// What "Type it" fills in for each sample line. `category` is a demo
// category id (landing demo.categories.*).
export const TYPE_IT_EXAMPLES = [
  {
    id: 'coffee', kind: 'expense', amountMinor: toMinor(3.6, DEMO_CURRENCY), category: 'foodDining',
    categoryName: 'Food & Dining', date: '2026-09-29', paidFrom: 'bank',
  },
  {
    id: 'salary', kind: 'income', amountMinor: toMinor(2450, DEMO_CURRENCY), category: 'salary',
    categoryName: 'Salary', date: DEMO_TODAY,
  },
]

// The Add form's fields in the mock, top to bottom. An income has no
// "Paid from", so its row stays empty (the card keeps its height).
export const FORM_FIELDS = ['amount', 'category', 'date', 'description', 'paidFrom']
export const fieldsFor = (example) =>
  (example.kind === 'expense' ? FORM_FIELDS : FORM_FIELDS.filter((f) => f !== 'paidFrom'))

// ms: the pause before typing, each typed character, the beat before "Fill",
// "Filling in…", each field landing, and the filled form held before the next.
export const TYPE_IT_TIMING = { start: 600, char: 70, send: 450, filling: 1100, field: 380, hold: 2600 }

// One sample line's frames: { example, typed, stage, filled, ms }, where
// `typed` is how many characters of the line show, `stage` is 'typing' |
// 'filling' | 'filled' and `filled` how many of the example's fields are in.
function exampleFrames(example, index, lineLength, timing) {
  const frames = [{ example: index, typed: 0, stage: 'typing', filled: 0, ms: timing.start }]
  for (let n = 1; n <= lineLength; n++) {
    frames.push({ example: index, typed: n, stage: 'typing', filled: 0, ms: n === lineLength ? timing.send : timing.char })
  }
  frames.push({ example: index, typed: lineLength, stage: 'filling', filled: 0, ms: timing.filling })
  const count = fieldsFor(example).length
  for (let n = 1; n <= count; n++) {
    frames.push({ example: index, typed: lineLength, stage: 'filled', filled: n, ms: n === count ? timing.hold : timing.field })
  }
  return frames
}

// Every frame of the loop, one sample line after the other. `lineLengths[i]`
// is the length of TYPE_IT_EXAMPLES[i]'s line in the visitor's language.
export function typeItFrames(lineLengths, timing = TYPE_IT_TIMING) {
  return TYPE_IT_EXAMPLES.flatMap((ex, i) => exampleFrames(ex, i, lineLengths[i] ?? 0, timing))
}

// The frame shown without motion (reduced motion): the first line, typed in
// full, with every field filled.
export const restFrameIndex = (frames) =>
  frames.findLastIndex((f) => f.example === 0 && f.stage === 'filled')

// The whole loop in ms.
export const loopMs = (frames) => frames.reduce((sum, f) => sum + f.ms, 0)
