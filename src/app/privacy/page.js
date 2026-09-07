import fs from 'fs';
import path from 'path';
import LegalPage from '@/components/LegalPage';

export const metadata = { title: 'Privacy Policy — StreamCast Pro' };

export default function PrivacyPage() {
    const markdown = fs.readFileSync(path.join(process.cwd(), 'docs/legal/published/privacy-policy.md'), 'utf8');
    return <LegalPage title="Privacy Policy" markdown={markdown} />;
}
