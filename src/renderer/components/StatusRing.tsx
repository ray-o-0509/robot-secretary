export function StatusRing({ isConnected }: { isConnected: boolean }) {
  return (
    <div style={{
      position: 'absolute',
      top: 8,
      right: 8,
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: isConnected ? '#44ff88' : '#ff4444',
      boxShadow: isConnected ? '0 0 6px #44ff88' : '0 0 6px #ff4444',
    }} />
  )
}
