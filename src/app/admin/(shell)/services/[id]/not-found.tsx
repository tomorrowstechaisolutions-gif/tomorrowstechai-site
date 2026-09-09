import Link from 'next/link';
export default function MissingService() { return <section className="cc-panel sv-empty"><h2>Service not found</h2><p className="sv-muted">The service link is invalid or the record is unavailable.</p><Link href="/admin/services" className="cc-btn">Back to Services</Link></section>; }
