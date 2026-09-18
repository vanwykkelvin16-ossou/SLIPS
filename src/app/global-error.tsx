'use client';

/**
 * Last-resort boundary: replaces the whole document when the root layout itself
 * fails, so it cannot rely on any shared component or stylesheet.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-ZA">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F7F9F7',
          color: '#1F2A24',
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <main>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Something went badly wrong</h1>
          <p style={{ marginTop: '12px', color: '#4A5C52', maxWidth: '28rem' }}>
            Your documents are safe. Reload the page to carry on — if this keeps happening, please let us know.
          </p>
          {error.digest ? (
            <p style={{ marginTop: '8px', fontSize: '0.8125rem', color: '#8A9A91' }}>Reference: {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '24px',
              height: '48px',
              padding: '0 24px',
              borderRadius: '12px',
              border: 'none',
              background: '#208A4D',
              color: '#FFFFFF',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload Slipsy
          </button>
        </main>
      </body>
    </html>
  );
}
