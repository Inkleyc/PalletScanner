import { Component } from "react";

export class AppErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("PalletFlip dashboard render failure", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="fatal-error" role="alert">
        <section className="fatal-error-card">
          <p className="eyebrow">Dashboard recovery</p>
          <h1>PalletFlip could not finish loading</h1>
          <p>Your inventory was not changed. Reload the dashboard to retry the last read.</p>
          {import.meta.env.DEV ? <pre>{this.state.error.message}</pre> : null}
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            Reload dashboard
          </button>
        </section>
      </main>
    );
  }
}
