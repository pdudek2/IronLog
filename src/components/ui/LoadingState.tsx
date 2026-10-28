import BrandMark from '../BrandMark'

interface LoadingStateProps {
  message?: string
  fullScreen?: boolean
}

function LoadingPanel({ message }: { message: string }) {
  return (
    <div className="w-full max-w-sm px-6 py-8 text-center">
      <div className="puls-loader mx-auto" aria-hidden="true">
        <BrandMark />
      </div>
      <p className="sr-only" role="status">{message}</p>
    </div>
  )
}

export default function LoadingState({
  message = 'Loading...',
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
