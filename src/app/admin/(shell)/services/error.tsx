'use client';
export default function ServiceError({ reset }: { reset: () => void }) { return <section className="cc-panel sv-empty"><h2>Services could not be loaded</h2><p className="sv-muted">Please retry. If this continues, check the database connection and Services migration.</p><button className="cc-btn" onClick={reset}>Try again</button></section>; }
