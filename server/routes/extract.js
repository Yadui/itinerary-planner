import { Router } from 'express';
import { aiChat } from '../services/ai.js';

const router = Router();

/**
 * POST /api/extract/activities
 * Body: { text: string, cities: string[] }
 * Uses Claude to extract activity/place recommendations from user-provided text
 * (Instagram captions, reel descriptions, travel blog snippets, etc.)
 */
router.post('/activities', async (req, res) => {
  const { text, cities } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text content is required' });
  }

  try {
    const cityContext = cities?.length
      ? `The user is visiting these cities: ${cities.join(', ')}.`
      : '';

    const { text: content } = await aiChat({
      prompt: `Extract specific place names, restaurants, cafes, attractions, and activities mentioned in this text. ${cityContext}

For each place found, return:
- name: the place name
- city: which city it's in (infer from context or match to the user's cities)
- category: one of "restaurant", "cafe", "bar", "attraction", "museum", "park", "shopping", "nightlife", "activity"
- description: brief 1-line description based on context
- source: "instagram"

Return ONLY a JSON array. If no places are found, return an empty array [].

<text>
${text}
</text>

Respond with only the JSON array, no other text.`,
    });
    // Extract JSON from response
    let activities;
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      activities = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      activities = [];
    }

    res.json({ activities });
  } catch (err) {
    console.error('Extract error:', err.message);
    res.status(500).json({ error: 'Failed to extract activities' });
  }
});

/**
 * POST /api/extract/instagram-url
 * Body: { url: string, cities: string[] }
 * Tries to fetch Instagram reel page and extract text content
 */
router.post('/instagram-url', async (req, res) => {
  const { url, cities } = req.body;

  if (!url || !url.includes('instagram.com')) {
    return res.status(400).json({ error: 'Valid Instagram URL required' });
  }

  try {
    let extractedText = '';

    // Normalize URL: extract post/reel ID and build embed URL
    const idMatch = url.match(/instagram\.com\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/);
    const postId = idMatch?.[1];

    // Method 1: Fetch /embed/captioned/ endpoint (most reliable — returns HTML with caption text)
    if (postId) {
      try {
        const embedUrl = `https://www.instagram.com/p/${postId}/embed/captioned/`;
        const embedRes = await fetch(embedUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
        });
        const embedHtml = await embedRes.text();

        // Extract caption from the Caption div
        const captionMatch = embedHtml.match(/class="Caption"[^>]*>([\s\S]*?)<div class="CaptionComments"/);
        if (captionMatch) {
          // Strip HTML tags, keep text
          const captionText = captionMatch[1]
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<a[^>]*>([^<]*)<\/a>/gi, '$1')
            .replace(/<[^>]+>/g, '')
            .trim();
          if (captionText) extractedText += captionText + '\n\n';
        }

        // Also grab username
        const userMatch = embedHtml.match(/class="CaptionUsername"[^>]*>([^<]+)</);
        if (userMatch) extractedText += `By: ${userMatch[1].trim()}\n\n`;
      } catch (e) {
        console.warn('Embed fetch failed:', e.message);
      }
    }

    // Method 2: Fallback — fetch the main page for meta tags
    if (!extractedText.trim()) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
        });
        const html = await response.text();

        const patterns = [
          /<meta\s+property="og:description"\s+content="([^"]*?)"/i,
          /<meta\s+name="description"\s+content="([^"]*?)"/i,
          /<meta\s+property="og:title"\s+content="([^"]*?)"/i,
        ];
        for (const pattern of patterns) {
          const match = html.match(pattern);
          if (match?.[1] && match[1].length > 10) {
            extractedText += match[1] + '\n\n';
          }
        }
      } catch (e) {
        console.warn('HTML fetch failed:', e.message);
      }
    }

    // Decode HTML entities and escape sequences
    extractedText = extractedText
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&#x27;/g, "'")
      .replace(/\\n/g, '\n').replace(/\\u0040/g, '@').replace(/\\u[\da-fA-F]{4}/g, (m) => {
        try { return JSON.parse(`"${m}"`); } catch { return m; }
      });

    console.log(`Instagram extract: URL=${url}, text length=${extractedText.trim().length}`);

    if (!extractedText.trim()) {
      return res.json({
        activities: [],
        extractedText: '',
        message: 'Could not extract content from this URL. Instagram may be blocking access. Try pasting the caption text directly.',
      });
    }

    // Now use Claude to extract activities from the text
    const cityContext = cities?.length
      ? `The user is visiting these cities: ${cities.join(', ')}.`
      : '';

    const { text: content } = await aiChat({
      prompt: `Extract specific place names, restaurants, cafes, attractions, and activities from this Instagram content. ${cityContext}

For each place found, return:
- name: the place name
- city: which city it's in
- category: one of "restaurant", "cafe", "bar", "attraction", "museum", "park", "shopping", "nightlife", "activity"
- description: brief 1-line description
- source: "instagram"

Return ONLY a JSON array. If no places are found, return [].

<text>
${extractedText}
</text>

Respond with only the JSON array.`,
    });
    let activities;
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      activities = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      activities = [];
    }

    res.json({ activities, extractedText });
  } catch (err) {
    console.error('Instagram extract error:', err.message);
    res.status(500).json({ error: 'Failed to extract from URL' });
  }
});

export default router;
