import ConfirmDialog from './ConfirmDialog'

interface TemplateLaunchConfirmDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function TemplateLaunchConfirmDialog({
  open,
  onConfirm,
  onCancel,
}: TemplateLaunchConfirmDialogProps) {
  if (!open) return null

  return (
    <ConfirmDialog
      title="Replace active session?"
      message="Starting this template will replace the exercises and sets in your current session."
      confirmLabel="Start template"
      cancelLabel="Keep current session"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
