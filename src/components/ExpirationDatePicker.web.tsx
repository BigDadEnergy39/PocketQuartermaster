interface Props {
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
}

// Format a Date as a local YYYY-MM-DD string (never via toISOString, which
// would shift the day in timezones behind UTC).
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Web expiration date picker — a native HTML <input type="date">. On web the
// app renders through react-dom, so a raw DOM element works here.
export default function ExpirationDatePicker({ value, onChange, minimumDate }: Props) {
  return (
    <input
      type="date"
      value={toLocalDateStr(value)}
      min={minimumDate ? toLocalDateStr(minimumDate) : undefined}
      onChange={(e) => {
        const [y, m, d] = e.target.value.split('-').map(Number);
        if (y && m && d) onChange(new Date(y, m - 1, d)); // construct as local date
      }}
      style={{
        padding: 14,
        fontSize: 16,
        borderRadius: 10,
        border: '1px solid #e0d8cc',
        background: '#f5f0e8',
        color: '#1a1a1a',
        fontFamily: 'inherit',
      }}
    />
  );
}
