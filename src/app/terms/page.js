import fs from 'fs';
import path from 'path';
import LegalPage from '@/components/LegalPage';

export const metadata = { title: 'Terms of Service — StreamCast Pro' };

export default function TermsPage() {
    const markdown = fs.readFileSync(path.join(process.cwd(), 'docs/legal/published/terms-of-service.md'), 'utf8');
    return <LegalPage title="Terms of Service" markdown={markdown} />;
}
