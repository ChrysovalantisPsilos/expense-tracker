import { useToken } from '@chakra-ui/react'

const SERIES = ['chart.1', 'chart.2', 'chart.3', 'chart.4', 'chart.5', 'chart.6', 'chart.7', 'chart.8']

// Theme colours for Recharts. Recharts draws SVG from plain colour strings, so
// each semantic token is resolved to its CSS variable — those follow the
// colour mode by themselves, with no re-render on toggle.
export function useChartTheme() {
  const [surface, border, muted, text, positive, ...series] = useToken('colors', [
    'bg.surface', 'border.default', 'text.muted', 'text.primary', 'status.positive', ...SERIES,
  ])
  const shadow = useToken('shadows', 'soft')
  return {
    series,
    positive,
    surface,
    grid: border,
    tick: { fill: muted },
    tooltip: {
      contentStyle: {
        background: surface, border: `1px solid ${border}`, borderRadius: 12,
        boxShadow: shadow,
      },
      labelStyle: { color: text, fontWeight: 600 },
      itemStyle: { color: text },
      cursor: { fill: border, opacity: 0.4 },
    },
    // Legend labels in muted text (Recharts defaults each label to its series
    // colour, which is unreadable for the pale and dark sand series).
    legendFormatter: (value) => <span style={{ color: muted }}>{value}</span>,
  }
}
