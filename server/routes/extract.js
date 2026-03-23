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
    // Try fetching the page to get og:description / meta content
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
    });
    const html = await response.text();

    // Extract meta description and title
    const descMatch = html.match(/<meta\s+(?:property="og:description"|name="description")\s+content="([^"]*?)"/i);
    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]*?)"/i);
    const captionMatch = html.match(/"caption":\s*\{[^}]*"text":\s*"([^"]*?)"/);

    const extractedText = [
      titleMatch?.[1] || '',
      descMatch?.[1] || '',
      captionMatch?.[1] || '',
    ].filter(Boolean).join('\n\n');

    if (!extractedText.trim()) {
      return res.json({
        activities: [],
        extractedText: '',
        message: 'Could not extract content from this URL. Try pasting the caption text directly.',
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
