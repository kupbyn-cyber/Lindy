// Biểu tượng nét mảnh 1.7px, khung 24px, màu theo chữ (design README). Thiếu thì dùng Lucide cùng nét.
import type { ReactElement } from 'react'

export type IconName =
  | 'home'
  | 'receipt'
  | 'calendar'
  | 'user'
  | 'more'
  | 'plus'
  | 'check'
  | 'chevron-right'
  | 'chevron-left'
  | 'search'
  | 'wallet'
  | 'alert'
  | 'x'
  | 'camera'

const DOTS: ReactElement[] = [6, 12, 18].map((x) => (
  <circle key={x} cx={x} cy={12} r={1.6} fill="currentColor" stroke="none" />
))

const ICONS: Record<IconName, ReactElement[]> = {
  home: [<path key="a" d="M4 10.5 12 4l8 6.5V20h-5v-5.5H9V20H4z" />],
  receipt: [
    <path key="a" d="M6.5 3.5h11v17l-2.75-1.8-2.75 1.8-2.75-1.8-2.75 1.8z" />,
    <path key="b" d="M9.5 8.5h5M9.5 12h5" />,
  ],
  calendar: [
    <rect key="a" x={4} y={5.5} width={16} height={14.5} rx={2} />,
    <path key="b" d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />,
  ],
  user: [
    <circle key="a" cx={12} cy={8.5} r={3.8} />,
    <path key="b" d="M4.5 20c1.3-3.7 4.1-5.6 7.5-5.6s6.2 1.9 7.5 5.6" />,
  ],
  more: DOTS,
  plus: [<path key="a" d="M12 5v14M5 12h14" />],
  check: [<path key="a" d="M5 12.5l4.5 4.5L19 7.5" />],
  'chevron-right': [<path key="a" d="M9 5l7 7-7 7" />],
  'chevron-left': [<path key="a" d="M15 5l-7 7 7 7" />],
  search: [<circle key="a" cx={11} cy={11} r={6.5} />, <path key="b" d="M16 16l4.5 4.5" />],
  wallet: [
    <rect key="a" x={3.5} y={6} width={17} height={13} rx={2} />,
    <path key="b" d="M3.5 9.5h17M15.5 14h2" />,
  ],
  alert: [<circle key="a" cx={12} cy={12} r={8.5} />, <path key="b" d="M12 7.5v5.5M12 16.2v.3" />],
  x: [<path key="a" d="M6 6l12 12M18 6 6 18" />],
  camera: [
    <path key="a" d="M4 8.5h3.2l1.6-2.5h6.4l1.6 2.5H20v10.5H4z" />,
    <circle key="b" cx={12} cy={13.5} r={3.3} />,
  ],
}

export function Icon(props: {
  name: IconName
  size?: number
  strokeWidth?: number
  title?: string
  className?: string
}) {
  const size = props.size ?? 24
  const labelled = !!props.title
  return (
    <svg
      className={['lo-icon', props.className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={props.strokeWidth ?? 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? props.title : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
    >
      {ICONS[props.name]}
    </svg>
  )
}
