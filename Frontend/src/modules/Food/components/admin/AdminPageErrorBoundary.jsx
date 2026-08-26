import { Component } from "react";

/**
 * Catches a render-time crash in one admin page.
 *
 * Without this, React unmounts the entire tree on an uncaught error: the
 * sidebar, the navbar and every other page go with it, leaving a blank white
 * screen that only a full reload recovers from. That is what one page throwing
 * `FirebaseError: auth/invalid-api-key` did -- opening Live Tracking killed the
 * whole panel, and every page visited afterwards rendered empty, which reads
 * like the server is down rather than like one page is broken.
 *
 * Keyed on the pathname by its parent, so navigating away from a broken page
 * remounts the boundary and clears the error. Without that key the boundary
 * would latch: once tripped it would keep showing the fallback even after the
 * user picked a different, working page.
 */
export default class AdminPageErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        // Kept as console.error rather than a logger: this is the one place the
        // stack is still intact, and the admin panel has no error reporting
        // sink of its own.
        // eslint-disable-next-line no-console
        console.error("[admin] page crashed:", error, info?.componentStack);
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        return (
            <div className="px-4 pb-10 lg:px-6 pt-4">
                <div className="rounded-3xl border border-red-200 bg-white p-6 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-red-500">
                        Page error
                    </p>
                    <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
                        This page failed to load
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm text-neutral-600">
                        The rest of the admin panel is unaffected — pick another
                        item from the sidebar, or reload to try this one again.
                    </p>
                    <p className="mt-4 rounded-xl bg-neutral-100 px-4 py-3 font-mono text-xs text-neutral-700">
                        {String(error?.message || error)}
                    </p>
                    <button
                        type="button"
                        onClick={() => this.setState({ error: null })}
                        className="mt-4 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
                    >
                        Try again
                    </button>
                </div>
            </div>
        );
    }
}
