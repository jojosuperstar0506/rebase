import { useState } from 'react';
import { useApp } from '../../context/AppContext';

export default function CICollapsible({ title, children, defaultOpen = false }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const { colors: C } = useApp();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ borderBottom: `1px solid ${C.bd}`, marginBottom: 0 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          width: '100%', padding: '16px 0', background: 'none', border: 'none',
          cursor: 'pointer', color: C.tx, fontSize: 16, fontWeight: 600,
          textAlign: 'left',
        }}
      >
        {title}
        <span style={{
          color: C.t3, fontSize: 14, flexShrink: 0, marginLeft: 8,
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s',
          display: 'inline-block',
        }}>
          ▼
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 0 20px', color: C.t2, fontSize: 14, lineHeight: 1.8 }}>
          {children}
        </div>
      )}
    </div>
  );
}
