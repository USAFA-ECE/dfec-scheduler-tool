import { useState } from 'react';
import { useApp } from '../data/store';
import { hashPassword } from '../utils/crypto';

export default function ChangePassword({ facultyId, isForced, onComplete, onSkip }) {
    const { dispatch } = useApp();
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        if (newPassword.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        setSaving(true);
        try {
            const hash = await hashPassword(newPassword);
            dispatch({ type: 'UPDATE_FACULTY', payload: { id: facultyId, passwordHash: hash } });
            setSuccess(true);
            setTimeout(onComplete, 900);
        } catch {
            setError('Failed to save password. Please try again.');
            setSaving(false);
        }
    }

    return (
        <div style={styles.overlay}>
            <div style={styles.modal}>
                <div style={styles.header}>
                    <span style={styles.icon}>🔑</span>
                    <h2 style={styles.title}>
                        {isForced ? 'Set Your Password' : 'Change Password'}
                    </h2>
                </div>

                {isForced && (
                    <div style={styles.notice}>
                        You're signed in with the shared default password. Set a personal password to secure your account.
                    </div>
                )}

                {success ? (
                    <div style={styles.successBox}>
                        <span style={{ fontSize: '1.4rem' }}>✓</span>
                        <span>Password saved successfully!</span>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} style={styles.form}>
                        <div style={styles.fieldGroup}>
                            <label style={styles.label}>New Password</label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={e => { setNewPassword(e.target.value); setError(''); }}
                                placeholder="At least 8 characters"
                                style={styles.input}
                                autoFocus
                                autoComplete="new-password"
                            />
                        </div>
                        <div style={styles.fieldGroup}>
                            <label style={styles.label}>Confirm Password</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                                placeholder="Re-enter new password"
                                style={styles.input}
                                autoComplete="new-password"
                            />
                        </div>

                        {error && (
                            <div style={styles.errorBox}>
                                <span>⚠</span> {error}
                            </div>
                        )}

                        <div style={styles.actions}>
                            <button
                                type="submit"
                                disabled={saving || !newPassword || !confirmPassword}
                                style={{
                                    ...styles.primaryBtn,
                                    ...(saving || !newPassword || !confirmPassword ? styles.btnDisabled : {}),
                                }}
                            >
                                {saving ? 'Saving…' : 'Save Password'}
                            </button>
                            <button
                                type="button"
                                onClick={onSkip}
                                style={styles.skipBtn}
                            >
                                {isForced ? 'Maybe Later' : 'Cancel'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

const styles = {
    overlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
        padding: '1rem',
    },
    modal: {
        width: '100%',
        maxWidth: 420,
        background: 'var(--bg-card, #1a2138)',
        border: '1px solid rgba(138,141,143,0.2)',
        borderRadius: 16,
        padding: '2rem',
        boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginBottom: '1.1rem',
    },
    icon: {
        fontSize: '1.4rem',
        lineHeight: 1,
    },
    title: {
        margin: 0,
        fontSize: '1.2rem',
        fontWeight: 700,
        color: 'var(--text-primary, #f0f1f2)',
    },
    notice: {
        padding: '0.65rem 0.9rem',
        background: 'rgba(234,179,8,0.1)',
        border: '1px solid rgba(234,179,8,0.3)',
        borderRadius: 8,
        color: '#fde68a',
        fontSize: '0.85rem',
        marginBottom: '1.25rem',
        lineHeight: 1.5,
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
    },
    fieldGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
    },
    label: {
        fontSize: '0.75rem',
        fontWeight: 600,
        color: 'var(--text-secondary, #d4d6d9)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
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
        boxSizing: 'border-box',
        fontFamily: 'inherit',
    },
    errorBox: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.6rem 0.85rem',
        background: 'rgba(239,68,68,0.12)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 8,
        color: '#fca5a5',
        fontSize: '0.85rem',
    },
    successBox: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '1rem',
        background: 'rgba(34,197,94,0.12)',
        border: '1px solid rgba(34,197,94,0.3)',
        borderRadius: 10,
        color: '#4ade80',
        fontSize: '1rem',
        fontWeight: 600,
        marginTop: '0.25rem',
    },
    actions: {
        display: 'flex',
        gap: '0.75rem',
        marginTop: '0.25rem',
    },
    primaryBtn: {
        flex: 1,
        padding: '0.75rem',
        borderRadius: 10,
        border: 'none',
        background: 'var(--navy-500, #1a56c4)',
        color: '#fff',
        fontSize: '0.95rem',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        boxShadow: '0 2px 12px rgba(26,86,196,0.3)',
    },
    btnDisabled: {
        background: 'rgba(26,86,196,0.4)',
        cursor: 'not-allowed',
        boxShadow: 'none',
    },
    skipBtn: {
        padding: '0.75rem 1rem',
        borderRadius: 10,
        border: '1px solid rgba(138,141,143,0.25)',
        background: 'transparent',
        color: 'var(--text-secondary, #d4d6d9)',
        fontSize: '0.9rem',
        cursor: 'pointer',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
    },
};
