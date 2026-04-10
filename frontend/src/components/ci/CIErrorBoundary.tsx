import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class CIErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Log to console in dev; could send to error tracking in prod
    console.error('[CIErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          padding: '40px 24px',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <div style={{ fontSize: 40, marginBottom: 20 }}>⚠️</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12, marginTop: 0 }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 15, color: '#6b7280', marginBottom: 24, maxWidth: 400, lineHeight: 1.6 }}>
            The competitive intelligence module encountered an unexpected error.
            Try refreshing the page.
          </p>
          {this.state.error && (
            <details style={{
              marginBottom: 24, maxWidth: 500, textAlign: 'left',
              fontSize: 12, color: '#9ca3af',
            }}>
              <summary style={{ cursor: 'pointer', marginBottom: 8 }}>Error details</summary>
              <pre style={{ overflow: 'auto', padding: '8px 12px', background: '#f3f4f6', borderRadius: 6 }}>
                {this.state.error.message}
              </pre>
            </details>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#6366f1',
              border: 'none',
              borderRadius: 8,
              padding: '10px 28px',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Refresh Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
