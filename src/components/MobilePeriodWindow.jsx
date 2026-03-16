import { useState, useRef } from 'react';

/**
 * The 6 non-overlapping period windows shown on mobile.
 * Each window is an array of exactly 2 period IDs.
 */
export const PERIOD_WINDOWS = [
  ['M1', 'M2'],
  ['M3', 'M4'],
  ['M5', 'M6'],
  ['T1', 'T2'],
  ['T3', 'T4'],
  ['T5', 'T6'],
];

const WINDOW_LABELS = ['M1 – M2', 'M3 – M4', 'M5 – M6', 'T1 – T2', 'T3 – T4', 'T5 – T6'];

/**
 * Wraps the schedule grid on mobile, exposing only 2 periods at a time.
 * Supports prev/next navigation and horizontal swipe gestures.
 *
 * Props:
 *   visiblePeriods  – current [p1, p2] pair (controlled from outside)
 *   windowIndex     – current window index 0–5 (controlled)
 *   onWindowChange  – (newIndex) => void
 *   children        – the rendered <table> element
 */
export default function MobilePeriodWindow({ windowIndex, onWindowChange, children }) {
  const touchStartX = useRef(null);
  const MIN_SWIPE = 50; // px threshold

  function prev() {
    onWindowChange(Math.max(0, windowIndex - 1));
  }
  function next() {
    onWindowChange(Math.min(PERIOD_WINDOWS.length - 1, windowIndex + 1));
  }

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const delta = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) >= MIN_SWIPE) {
      if (delta > 0) next();
      else prev();
    }
    touchStartX.current = null;
  }

  const canPrev = windowIndex > 0;
  const canNext = windowIndex < PERIOD_WINDOWS.length - 1;

  // Dot indicators style
  const dotBase = {
    width: 6, height: 6, borderRadius: '50%',
    transition: 'background 0.2s, transform 0.2s',
  };

  return (
    <div>
      {/* Period navigator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 0 10px',
        gap: 8,
      }}>
        <button
          onClick={prev}
          disabled={!canPrev}
          aria-label="Previous periods"
          style={{
            width: 36, height: 36,
            background: canPrev ? 'var(--bg-card)' : 'transparent',
            border: `1px solid ${canPrev ? 'var(--border-color)' : 'transparent'}`,
            borderRadius: 8,
            color: canPrev ? 'var(--text-primary)' : 'var(--text-muted)',
            cursor: canPrev ? 'pointer' : 'default',
            fontSize: '1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
            flexShrink: 0,
          }}
        >‹</button>

        {/* Center: label + dot indicators */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)',
            letterSpacing: '0.02em',
          }}>
            {WINDOW_LABELS[windowIndex]}
          </span>
          <div style={{ display: 'flex', gap: 5 }}>
            {PERIOD_WINDOWS.map((_, i) => (
              <button
                key={i}
                onClick={() => onWindowChange(i)}
                aria-label={`Go to ${WINDOW_LABELS[i]}`}
                style={{
                  ...dotBase,
                  background: i === windowIndex ? 'var(--text-accent)' : 'var(--border-color)',
                  transform: i === windowIndex ? 'scale(1.3)' : 'scale(1)',
                  border: 'none', cursor: 'pointer', padding: 0,
                }}
              />
            ))}
          </div>
        </div>

        <button
          onClick={next}
          disabled={!canNext}
          aria-label="Next periods"
          style={{
            width: 36, height: 36,
            background: canNext ? 'var(--bg-card)' : 'transparent',
            border: `1px solid ${canNext ? 'var(--border-color)' : 'transparent'}`,
            borderRadius: 8,
            color: canNext ? 'var(--text-primary)' : 'var(--text-muted)',
            cursor: canNext ? 'pointer' : 'default',
            fontSize: '1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
            flexShrink: 0,
          }}
        >›</button>
      </div>

      {/* Swipeable content area */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)' }}
      >
        {children}
      </div>
    </div>
  );
}
