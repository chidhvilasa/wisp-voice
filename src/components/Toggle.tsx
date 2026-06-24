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
      className="relative inline-flex h-[22px] w-10 shrink-0 items-center rounded-[11px]"
      style={{ backgroundColor: checked ? '#7C5CFC' : '#3F3F46', transition: 'all 150ms ease' }}
    >
      <span
        className="block h-[18px] w-[18px] rounded-full bg-white"
        style={{
          transform: checked ? 'translateX(18px)' : 'translateX(2px)',
          transition: 'all 150ms ease',
        }}
      />
    </button>
  )
}
