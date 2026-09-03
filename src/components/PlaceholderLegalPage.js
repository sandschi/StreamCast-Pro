import Link from 'next/link';

export default function PlaceholderLegalPage({ title }) {
    return (
        <div style={{ background: 'var(--bg-app)', color: 'var(--text-body)', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
            <h1 style={{ fontFamily: 'var(--font-sans)', fontSize: 22, fontWeight: 800, color: 'var(--text-heading)' }}>{title}</h1>
            <p style={{ maxWidth: 420, color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6 }}>
                We&rsquo;re still writing this page. Check back soon — in the meantime, reach out at{' '}
                <a href="mailto:support@sandschi.xyz" style={{ color: 'var(--primary-400)' }}>support@sandschi.xyz</a> with any questions.
            </p>
            <Link href="/" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>&larr; Back home</Link>
        </div>
    );
}
