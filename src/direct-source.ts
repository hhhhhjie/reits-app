import { TextDecoder } from '@kayahr/text-encoding/no-encodings';
import '@kayahr/text-encoding/encodings/gb18030';
import { createMarketSource } from '../shared/source';

export async function fetchNativeText(url: string, encoding = 'gb18030'): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Referer: 'https://gu.qq.com/' },
    });
    if (!response.ok) throw new Error(`行情源响应异常（${response.status}）`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 2_000_000) throw new Error('行情响应超出大小限制');
    return new TextDecoder(encoding).decode(new Uint8Array(bytes));
  } finally {
    clearTimeout(timeout);
  }
}

export const directSource = createMarketSource(fetchNativeText);
