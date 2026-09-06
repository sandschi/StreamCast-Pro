import Link from 'next/link';
import Image from 'next/image';
import { marked } from 'marked';
import { pressStart2P } from '@/lib/fonts';

const ARCADE = `${pressStart2P.style.fontFamily}, var(--font-geist-sans), system-ui, sans-serif`;

// Server Component: no client interactivity needed for static legal text, so
// the markdown is parsed straight to HTML at request time and rendered via
// dangerouslySetInnerHTML - safe here because the source is first-party
// content in the repo (docs/legal/published/*.md), never user input.
export default function LegalPage({ title, markdown }) {
    const html = marked.parse(markdown);

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-body)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 24px', borderBottom: '1px solid var(--border-strong)' }}>
                <Image src="/logo.svg" alt="" width={18} height={18} />
                <span style={{ fontFamily: ARCADE, fontSize: 15, color: 'var(--accent)' }}>STREAMCAST</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-faint)' }}>PRO</span>
                <span style={{ flex: 1 }} />
                <Link href="/" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-faint)', textDecoration: 'none' }}>
                    &larr; Back home
                </Link>
            </div>

            <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 80px' }}>
                <h1 style={{ fontFamily: 'var(--font-sans)', fontSize: 28, fontWeight: 800, color: 'var(--text-heading)', margin: '0 0 28px' }}>{title}</h1>
                <div className="legal-content" dangerouslySetInnerHTML={{ __html: html }} />
            </div>

            <style>{`
                .legal-content h2 {
                    font-family: var(--font-sans);
                    font-size: 19px;
                    font-weight: 700;
                    color: var(--text-heading);
                    margin: 40px 0 14px;
                    padding-top: 24px;
                    border-top: 1px solid var(--border-strong);
                }
                .legal-content h2:first-child { margin-top: 0; padding-top: 0; border-top: none; }
                .legal-content p { font-family: var(--font-sans); font-size: 14.5px; line-height: 1.7; color: var(--text-body); margin: 0 0 14px; }
                .legal-content ul { margin: 0 0 14px; padding-left: 22px; }
                .legal-content li { font-family: var(--font-sans); font-size: 14.5px; line-height: 1.7; color: var(--text-body); margin-bottom: 6px; }
                .legal-content strong { color: var(--text-heading); font-weight: 700; }
                .legal-content a { color: var(--accent-hover); }
                .legal-content code { font-family: var(--font-mono); font-size: 0.9em; background: var(--surface-inset); padding: 1px 5px; border-radius: 4px; }
                .legal-content hr { border: none; border-top: 1px solid var(--border-strong); margin: 0; display: none; }
                .legal-content blockquote {
                    margin: 0 0 18px;
                    padding: 12px 16px;
                    background: var(--accent-tint);
                    border-left: 3px solid var(--accent);
                    border-radius: 0 8px 8px 0;
                }
                .legal-content blockquote p { color: var(--text-muted); font-size: 13.5px; margin: 0; }
                .legal-content table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 0 0 18px;
                    font-family: var(--font-sans);
                    font-size: 13px;
                    display: block;
                    overflow-x: auto;
                }
                .legal-content th, .legal-content td {
                    text-align: left;
                    padding: 8px 10px;
                    border: 1px solid var(--border-strong);
                    color: var(--text-body);
                    vertical-align: top;
                }
                .legal-content th { background: var(--surface-inset); color: var(--text-heading); font-weight: 700; white-space: nowrap; }
            `}</style>
        </div>
    );
}
