import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

export interface ScrapedPage {
  title: string;
  textContent: string;
  url: string;
}

export async function scrapeUrl(url: string): Promise<ScrapedPage> {
  // Validate URL and restrict to http/https
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('URL must use http or https protocol.');
  }

  let html: string;
  try {
    const response = await axios.get<string>(url, {
      timeout: 20_000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; GlassFortress/1.0; legal-evidence-archiver)',
        Accept: 'text/html,application/xhtml+xml',
      },
      maxContentLength: 5 * 1024 * 1024, // 5 MB cap
      responseType: 'text',
    });
    html = response.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      throw new Error(
        status
          ? `URL returned HTTP ${status}. The page may require authentication or may not exist.`
          : `Could not reach the URL: ${err.message}`,
      );
    }
    throw err;
  }

  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article?.textContent?.trim()) {
    throw new Error(
      'Could not extract readable content from this URL. ' +
        'The page may require JavaScript, login, or contain no article text.',
    );
  }

  return {
    title: article.title ?? '',
    textContent: article.textContent.trim(),
    url,
  };
}
