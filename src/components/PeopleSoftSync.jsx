import { useState, useRef } from 'react';
import { useApp } from '../data/store';

// ── Constants ─────────────────────────────────────────────────────────────────

const QUERY_BASE =
    'https://csprd.afacademy.af.edu/psc/csprd_2/EMPLOYEE/SA/q/' +
    '?ICAction=ICQryNameURL=PUBLIC.AFA_AA_ADV_PLNR_CRSE_CT_BY_TRM';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [-1, 0, 1, 2].map(n => CURRENT_YEAR + n);

function toTermCode(season, year) {
    return `22${year % 10}${season === 'fall' ? '8' : '1'}`;
}

function sisUrl(term) {
    // PeopleSoft query prompt fields — pre-fills the form if the server honours
    // the ICQryPromptField params (behaviour varies by PS version/config).
    return (
        `${QUERY_BASE}` +
        `&ICQryPromptField0=${term}` +   // Term (STRM)
        `&ICQryPromptField1=ECE` +        // Subject
        `&ICQryPromptField2=` +           // Catalog (all)
        `&ICQryPromptField3=USAFA` +      // Institution
        `&ICQryPromptField4=`             // Class Year (all)
    );
}

// ── CSV parser (mirrors server/services/peoplesoft.mjs) ───────────────────────
// Columns: "Term","Course ID","Subject","Catalog","Count: # Cadets Pre-Enrolled"

function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const rows = [];
    for (const line of lines.slice(1)) {
        const trimmed = line.trim().replace(/^"|"$/g, '');
        const cols = trimmed.split('","');
        if (cols.length < 5) continue;
        const catalog = cols[3].trim();
        const enrollment = parseInt(cols[4].trim(), 10);
        if (catalog && !isNaN(enrollment)) rows.push({ catalog, enrollment });
    }
    return rows;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PeopleSoftSync() {
    const { state, dispatch } = useApp();

    const [season, setSeason] = useState('fall');
    const [year, setYear] = useState(CURRENT_YEAR);
    const [dragging, setDragging] = useState(false);
    const [result, setResult] = useState(null);   // { updated, zeroed, term } | null
    const [error, setError] = useState('');
    const fileInputRef = useRef(null);

    const term = toTermCode(season, year);
    const seasonLabel = season === 'fall' ? 'Fall' : 'Spring';

    // ── CSV processing ───────────────────────────────────────────────────────

    function applyRows(rows, sourceTerm) {
        if (rows.length === 0) {
            setError('No data rows found. Make sure you dropped the correct CSV file.');
            return;
        }
        const lookup = new Map(rows.map(r => [r.catalog.toUpperCase(), r.enrollment]));
        let updated = 0;
        let zeroed = 0;
        for (const course of state.courses) {
            const key = (course.number ?? '').toUpperCase();
            if (lookup.has(key)) {
                dispatch({ type: 'UPDATE_COURSE', payload: { id: course.id, enrollment: lookup.get(key) } });
                updated++;
            } else {
                dispatch({ type: 'UPDATE_COURSE', payload: { id: course.id, enrollment: 0 } });
                zeroed++;
            }
        }
        setResult({ updated, zeroed, term: sourceTerm });
        setError('');
    }

    function handleFile(file) {
        if (!file) return;
        if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
            setError('Please drop a CSV file exported from SIS.');
            return;
        }
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const rows = parseCsv(e.target.result);
                // Detect term from the first data row if available
                const firstLine = e.target.result.trim().split(/\r?\n/)[1] ?? '';
                const detectedTerm = firstLine.replace(/^"|"$/, '').split('","')[0] ?? term;
                applyRows(rows, detectedTerm);
            } catch {
                setError('Failed to parse CSV. Check the file format.');
            }
        };
        reader.readAsText(file);
    }

    // ── Drag & drop handlers ─────────────────────────────────────────────────

    function onDragOver(e) { e.preventDefault(); setDragging(true); }
    function onDragLeave() { setDragging(false); }
    function onDrop(e) {
        e.preventDefault();
        setDragging(false);
        setResult(null);
        setError('');
        handleFile(e.dataTransfer.files[0]);
    }
    function onFileChange(e) {
        setResult(null);
        setError('');
        handleFile(e.target.files[0]);
        e.target.value = '';
    }

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="card mb-2">
            <div className="card-header">
                <h3 className="card-title">SIS Enrollment Import</h3>
                <span style={styles.badge}>AFA_AA_ADV_PLNR_CRSE_CT_BY_TRM</span>
            </div>

            <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* ── Step 1 — Term + SIS link ─────────────────────────── */}
                <div>
                    <div style={styles.stepLabel}>① Select term and open SIS</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                        <select value={season} onChange={e => { setSeason(e.target.value); setResult(null); }} style={styles.select}>
                            <option value="fall">Fall</option>
                            <option value="spring">Spring</option>
                        </select>
                        <select value={year} onChange={e => { setYear(Number(e.target.value)); setResult(null); }} style={styles.select}>
                            {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <span style={styles.termCode}>Term {term}</span>
                        <a
                            href={sisUrl(term)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={styles.sisLink}
                        >
                            Open SIS query ↗
                        </a>
                    </div>
                    <div style={styles.hint}>
                        In SIS: confirm Term&nbsp;=&nbsp;<strong>{term}</strong>, Subject&nbsp;=&nbsp;<strong>ECE</strong>,
                        Institution&nbsp;=&nbsp;<strong>USAFA</strong> → View Results → <strong>CSV Text File</strong>
                    </div>
                </div>

                {/* ── Step 2 — Drop zone ───────────────────────────────── */}
                <div>
                    <div style={styles.stepLabel}>② Drop the downloaded CSV here</div>
                    <div
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            ...styles.dropZone,
                            ...(dragging ? styles.dropZoneActive : {}),
                            ...(result ? styles.dropZoneDone : {}),
                        }}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,text/csv"
                            style={{ display: 'none' }}
                            onChange={onFileChange}
                        />
                        {result ? (
                            <span style={{ color: '#4ade80', fontSize: '0.85rem' }}>
                                ✓ {seasonLabel} {year} imported — drop another file to re-import
                            </span>
                        ) : (
                            <span style={{ color: dragging ? '#60a5fa' : 'var(--text-muted)', fontSize: '0.85rem' }}>
                                {dragging ? 'Release to import' : 'Drop CSV here or click to browse'}
                            </span>
                        )}
                    </div>
                </div>

                {/* ── Error ───────────────────────────────────────────── */}
                {error && (
                    <div style={styles.errorBox}>{error}</div>
                )}

                {/* ── Success summary ──────────────────────────────────── */}
                {result && (
                    <div style={styles.successBox}>
                        <strong>Import complete</strong> — Term {result.term}:
                        {' '}{result.updated} course{result.updated !== 1 ? 's' : ''} updated,
                        {' '}{result.zeroed} set to 0 (not in SIS this term).
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
    badge: {
        fontSize: '0.68rem',
        fontWeight: 600,
        fontFamily: 'monospace',
        letterSpacing: '0.03em',
        padding: '2px 8px',
        borderRadius: 4,
        background: 'rgba(100,116,139,0.15)',
        color: 'var(--text-muted)',
    },
    stepLabel: {
        fontSize: '0.78rem',
        fontWeight: 700,
        color: 'var(--text-primary)',
        letterSpacing: '0.01em',
    },
    select: {
        padding: '5px 10px',
        fontSize: '0.83rem',
        borderRadius: 6,
        border: '1px solid var(--border-color)',
        background: 'var(--bg-elevated)',
        color: 'var(--text-primary)',
        cursor: 'pointer',
    },
    termCode: {
        fontSize: '0.78rem',
        fontFamily: 'monospace',
        color: 'var(--text-muted)',
        whiteSpace: 'nowrap',
    },
    sisLink: {
        fontSize: '0.82rem',
        fontWeight: 600,
        color: '#60a5fa',
        textDecoration: 'none',
        padding: '5px 12px',
        borderRadius: 6,
        border: '1px solid rgba(96,165,250,0.35)',
        whiteSpace: 'nowrap',
    },
    hint: {
        marginTop: 8,
        fontSize: '0.78rem',
        color: 'var(--text-muted)',
        lineHeight: 1.6,
    },
    dropZone: {
        marginTop: 8,
        border: '2px dashed var(--border-color)',
        borderRadius: 8,
        padding: '28px 20px',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
        background: 'transparent',
    },
    dropZoneActive: {
        borderColor: '#60a5fa',
        background: 'rgba(96,165,250,0.06)',
    },
    dropZoneDone: {
        borderColor: 'rgba(34,197,94,0.4)',
        background: 'rgba(34,197,94,0.05)',
    },
    successBox: {
        fontSize: '0.82rem',
        borderRadius: 6,
        padding: '10px 14px',
        background: 'rgba(34,197,94,0.08)',
        border: '1px solid rgba(34,197,94,0.2)',
        color: '#4ade80',
    },
    errorBox: {
        fontSize: '0.82rem',
        borderRadius: 6,
        padding: '10px 14px',
        background: 'rgba(239,68,68,0.08)',
        border: '1px solid rgba(239,68,68,0.2)',
        color: '#f87171',
    },
};
