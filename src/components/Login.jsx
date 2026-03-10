import { useState } from 'react';
import { useApp } from '../data/store';

const PASSWORDS = { instructor: 'dfec3141', admin: 'dfec3141admin' };

export default function Login({ onLogin }) {
    const { state } = useApp();
    const { faculty } = state;
    const [selectedId, setSelectedId] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [shaking, setShaking] = useState(false);

    function handleSubmit(e) {
        e.preventDefault();
        if (!selectedId) {
            setError('Please select your name.');
            triggerShake();
            return;
        }
        const member = faculty.find(f => f.id === selectedId);
        const role = member?.role ?? 'instructor';
        const expected = PASSWORDS[role] ?? PASSWORDS.instructor;
        if (password !== expected) {
            setError('Incorrect password. Please try again.');
            setPassword('');
            triggerShake();
            return;
        }
        onLogin(selectedId);
    }

    function triggerShake() {
        setShaking(true);
        setTimeout(() => setShaking(false), 500);
    }

    return (
        <div style={styles.page}>
            {/* Background grid decoration */}
            <div style={styles.gridOverlay} />

            <div style={{ ...styles.card, ...(shaking ? styles.shake : {}) }}>
                {/* Logo */}
                <div style={styles.logoWrap}>
                    <img
                        src="/dfec_logo.png"
                        alt="DFEC Logo"
                        style={styles.logo}
                        onError={e => { e.target.style.display = 'none'; }}
                    />
                </div>

                {/* Title */}
                <div style={styles.titleBlock}>
                    <h1 style={styles.title}>DFEC Scheduler</h1>
                    <p style={styles.subtitle}>Faculty Teaching Schedule Optimizer</p>
                </div>

                {/* Divider */}
                <div style={styles.divider} />

                {/* Form */}
                <form onSubmit={handleSubmit} style={styles.form}>
                    <div style={styles.fieldGroup}>
                        <label style={styles.label}>Faculty Name</label>
                        <div style={styles.selectWrap}>
                            <select
                                value={selectedId}
                                onChange={e => { setSelectedId(e.target.value); setError(''); }}
                                style={styles.select}
                                autoFocus
                            >
                                <option value="">— Select your name —</option>
                                {faculty.map(f => (
                                    <option key={f.id} value={f.id}>
                                        {f.rank} {f.name}
                                    </option>
                                ))}
                            </select>
                            <span style={styles.selectArrow}>▾</span>
                        </div>
                    </div>

                    <div style={styles.fieldGroup}>
                        <label style={styles.label}>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => { setPassword(e.target.value); setError(''); }}
                            placeholder="Enter password"
                            style={styles.input}
                            autoComplete="current-password"
                        />
                    </div>

                    {error && (
                        <div style={styles.errorBox}>
                            <span style={styles.errorIcon}>⚠</span> {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        style={{
                            ...styles.submitBtn,
                            ...(selectedId && password ? styles.submitBtnActive : {}),
                        }}
                    >
                        Sign In
                    </button>
                </form>

                <p style={styles.footer}>
                    USAFA Department of Electrical &amp; Computer Engineering
                </p>
            </div>

            <style>{keyframeCSS}</style>
        </div>
    );
}

const keyframeCSS = `
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(24px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0)   scale(1); }
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-8px); }
  40%       { transform: translateX(8px); }
  60%       { transform: translateX(-6px); }
  80%       { transform: translateX(6px); }
}
@keyframes gridPulse {
  0%, 100% { opacity: 0.03; }
  50%       { opacity: 0.06; }
}
`;

const styles = {
    page: {
        minHeight: '100vh',
        background: 'var(--bg-primary, #0a0e1a)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        position: 'relative',
        overflow: 'hidden',
    },
    gridOverlay: {
        position: 'absolute',
        inset: 0,
        backgroundImage: `
            linear-gradient(rgba(26,86,196,0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(26,86,196,0.07) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
        animation: 'gridPulse 6s ease-in-out infinite',
        pointerEvents: 'none',
    },
    card: {
        position: 'relative',
        width: '100%',
        maxWidth: 420,
        background: 'var(--bg-card, #1a2138)',
        border: '1px solid rgba(138,141,143,0.18)',
        borderRadius: 20,
        padding: '2.5rem 2rem 2rem',
        boxShadow: '0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(26,86,196,0.12)',
        animation: 'fadeSlideIn 0.45s cubic-bezier(0.22,1,0.36,1) both',
        backdropFilter: 'blur(12px)',
    },
    shake: {
        animation: 'shake 0.5s cubic-bezier(0.36,0.07,0.19,0.97) both',
    },
    logoWrap: {
        display: 'flex',
        justifyContent: 'center',
        marginBottom: '1.25rem',
    },
    logo: {
        height: 88,
        width: 'auto',
        objectFit: 'contain',
        filter: 'drop-shadow(0 4px 16px rgba(26,86,196,0.4))',
    },
    titleBlock: {
        textAlign: 'center',
        marginBottom: '1.5rem',
    },
    title: {
        margin: 0,
        fontSize: '1.65rem',
        fontWeight: 700,
        color: 'var(--text-primary, #f0f1f2)',
        letterSpacing: '-0.02em',
        lineHeight: 1.2,
    },
    subtitle: {
        margin: '0.35rem 0 0',
        fontSize: '0.82rem',
        color: 'var(--text-tertiary, #6b6e70)',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
    },
    divider: {
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(138,141,143,0.25), transparent)',
        marginBottom: '1.75rem',
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1.1rem',
    },
    fieldGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.45rem',
    },
    label: {
        fontSize: '0.78rem',
        fontWeight: 600,
        color: 'var(--text-secondary, #d4d6d9)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
    },
    selectWrap: {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
    },
    select: {
        width: '100%',
        padding: '0.7rem 2.4rem 0.7rem 0.9rem',
        background: 'var(--bg-input, #0d1424)',
        border: '1px solid rgba(138,141,143,0.22)',
        borderRadius: 10,
        color: 'var(--text-primary, #f0f1f2)',
        fontSize: '0.95rem',
        cursor: 'pointer',
        appearance: 'none',
        WebkitAppearance: 'none',
        outline: 'none',
        transition: 'border-color 0.18s',
    },
    selectArrow: {
        position: 'absolute',
        right: '0.85rem',
        color: 'var(--text-tertiary, #6b6e70)',
        fontSize: '0.85rem',
        pointerEvents: 'none',
    },
    input: {
        width: '100%',
        padding: '0.7rem 0.9rem',
        background: 'var(--bg-input, #0d1424)',
        border: '1px solid rgba(138,141,143,0.22)',
        borderRadius: 10,
        color: 'var(--text-primary, #f0f1f2)',
        fontSize: '0.95rem',
        outline: 'none',
        transition: 'border-color 0.18s',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
    },
    errorBox: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.65rem 0.9rem',
        background: 'rgba(239,68,68,0.12)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 8,
        color: '#fca5a5',
        fontSize: '0.85rem',
    },
    errorIcon: {
        fontSize: '1rem',
        lineHeight: 1,
    },
    submitBtn: {
        marginTop: '0.4rem',
        padding: '0.8rem',
        borderRadius: 10,
        border: 'none',
        background: 'var(--navy-600, #003da5)',
        color: '#fff',
        fontSize: '0.95rem',
        fontWeight: 600,
        cursor: 'pointer',
        letterSpacing: '0.03em',
        transition: 'background 0.18s, transform 0.12s, box-shadow 0.18s',
        boxShadow: '0 2px 12px rgba(26,86,196,0.25)',
        fontFamily: 'inherit',
    },
    submitBtnActive: {
        background: 'var(--navy-500, #1a56c4)',
        boxShadow: '0 4px 20px rgba(26,86,196,0.4)',
    },
    footer: {
        marginTop: '1.75rem',
        textAlign: 'center',
        fontSize: '0.72rem',
        color: 'var(--text-tertiary, #6b6e70)',
        letterSpacing: '0.02em',
        lineHeight: 1.5,
    },
};
