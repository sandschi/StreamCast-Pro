import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        const filePath = path.join(process.cwd(), 'CHANGELOG.md');
        const content = fs.readFileSync(filePath, 'utf-8');
        return NextResponse.json({ content });
    } catch (error) {
        console.error('Error reading CHANGELOG.md:', error);
        return NextResponse.json({ error: 'Changelog unavailable' }, { status: 500 });
    }
}
