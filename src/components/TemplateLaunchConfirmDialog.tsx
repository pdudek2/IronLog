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
      title="Zastąpić aktywną sesję?"
      message="Uruchomienie szablonu zastąpi ćwiczenia i serie w obecnej sesji."
      confirmLabel="Uruchom szablon"
      cancelLabel="Zostaw obecną"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
