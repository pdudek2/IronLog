interface LoadingStateProps {
  message?: string
  fullScreen?: boolean
}

function LoadingPanel({ message }: { message: string }) {
  return (
    <div className="w-full max-w-sm px-6 py-8 text-center">
      <div className="puls-loader mx-auto mb-3" aria-hidden="true">
        <span>IL</span>
      </div>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>{message}</p>
    </div>
  )
}

export default function LoadingState({
  message = 'Ładowanie...',
  fullScreen = true,
}: LoadingStateProps) {
  if (!fullScreen) return <LoadingPanel message={message} />

  return (
    <div className="page-shell flex items-center justify-center">
      <div className="page-container flex justify-center">
        <LoadingPanel message={message} />
      </div>
    </div>
  )
}
