interface ToggleProps {
  checked: boolean
  onChange: (value: boolean) => void
  label?: string
}

export default function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150"
      style={{ backgroundColor: checked ? '#7C5CFC' : '#3F3F46' }}
    >
      <span
        className={`block h-5 w-5 rounded-full bg-white transition-transform duration-150 ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
