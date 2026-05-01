import { CYAN, FONT_MONO } from '../../renderer/display/styles'

type Props = {
  payload?: unknown
}

export function UnavailableView(_props: Props) {
  return (
    <div style={{ padding: 24, color: CYAN, fontFamily: FONT_MONO, fontSize: 12, opacity: 0.6 }}>
      この機能は利用できません
    </div>
  )
}
