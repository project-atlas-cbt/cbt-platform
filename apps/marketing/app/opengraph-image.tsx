import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { site } from '@/lib/site';

export const alt = `${site.name}: computer-based exams for Nigerian secondary schools`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// The link preview WhatsApp and Facebook show: the exercise-book page.
export default async function OpengraphImage() {
  const png = await readFile(
    join(process.cwd(), 'public/brand/examkeep-horizontal-colour-1024.png'),
  );
  const logo = `data:image/png;base64,${png.toString('base64')}`;
  const lines = Array.from({ length: 13 }, (_, i) => i);
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        background: '#ffffff',
      }}
    >
      {lines.map((i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 48 + i * 48,
            height: 2,
            background: '#d5e1f4',
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 120,
          width: 3,
          background: '#d9534f',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', padding: '86px 90px 0 160px' }}>
        {/* The horizontal full-colour lockup from the brand pack (USAGE.md). */}
        <img src={logo} alt="" width={325} height={60} />
        <div
          style={{
            marginTop: 56,
            fontSize: 64,
            lineHeight: 1.12,
            fontWeight: 700,
            color: '#14161b',
            maxWidth: 940,
          }}
        >
          School exams on computers. Every answer kept, even when the network drops.
        </div>
        <div style={{ marginTop: 36, fontSize: 30, color: '#383b40' }}>
          CBT for Nigerian secondary schools
        </div>
      </div>
    </div>,
    size,
  );
}
