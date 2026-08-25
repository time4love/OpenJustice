import axios from 'axios';
import { extractArticle } from '../lib/archiveText';

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

  // Strip tracking parameters (utm_*, fbclid, etc.) — some servers reject URLs with these
  const cleanUrl = new URL(url);
  for (const key of [...cleanUrl.searchParams.keys()]) {
    if (/^utm_|^fbclid|^gclid|^mc_/.test(key)) cleanUrl.searchParams.delete(key);
  }
  const fetchUrl = cleanUrl.toString();

  let html: string;
  try {
    const response = await axios.get<string>(fetchUrl, {
      timeout: 20_000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'sec-ch-ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'upgrade-insecure-requests': '1',
      },
      maxContentLength: 5 * 1024 * 1024, // 5 MB cap
      responseType: 'text',
    });
    html = response.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const isPdf = /\.pdf$/i.test(parsedUrl.pathname);
      if (status === 403 || status === 401) {
        throw new Error(
          isPdf
            ? `The server blocked this PDF (HTTP ${status}). Download the file manually and upload it using the file upload option instead.`
            : `The server blocked this request (HTTP ${status}). This site requires a real browser session. Open the page in your browser, take a screenshot or save it as PDF, then upload the file instead.`,
        );
      }
      throw new Error(
        status
          ? `URL returned HTTP ${status}. The page may require authentication or may not exist.`
          : `Could not reach the URL: ${err.message}`,
      );
    }
    throw err;
  }

  // Extraction is NOT done here. This module used to run its own
  // JSDOM + Readability pass and return `article.textContent`, which is a
  // different string from the one the archive path stores as
  // UrlSnapshot.fullText — so the same URL produced different text, and
  // therefore a different evidence identity, depending on whether it arrived
  // through the website or through MCP. One extractor, in one place.
  const article = extractArticle(html, fetchUrl);

  if (!article.text.trim()) {
    throw new Error(
      'Could not extract readable content from this URL. ' +
        'The page may require JavaScript, login, or contain no article text.',
    );
  }

  return {
    title: article.title,
    textContent: article.text,
    url: fetchUrl,
  };
}
