import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Same dove mark + navy (slate-900) used by HeroSection.tsx on the homepage.
export default async function Image() {
  const doveBuffer = await readFile(join(process.cwd(), 'public', 'teder-dove.png'));
  const doveSrc = `data:image/png;base64,${doveBuffer.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
        }}
      >
        <img src={doveSrc} width={420} height={420} alt="" />
      </div>
    ),
    { ...size },
  );
}
