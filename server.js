global.File = class File {};

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();

app.use(express.json());
app.use(express.static('public'));

async function fetchArticleText(url) {
  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
    });
    const $ = cheerio.load(data);
    let content = '';
    const selectors = [
      '.article-content', '.story-content', '.details-content', '.lead-text',
      '.full-content', '.post-content', '.entry-content', '.article-body',
      '.story-body', '.content-body', '.main-content', '.detail-content',
      'article .content', 'article p', '.content p'
    ];
    for (const sel of selectors) {
      const el = $(sel);
      if (el.length) {
        content = el.text().trim();
        if (content.length > 100) break;
      }
    }
    if (!content || content.length < 100) {
      content = $('p').text().trim();
    }
    content = content.replace(/\s+/g, ' ').trim();
    return content.length > 5000 ? content.slice(0, 5000) + '…' : content;
  } catch (err) {
    console.warn(`Error fetching ${url}: ${err.message}`);
    return 'Error fetching content';
  }
}

app.post('/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
    });
    const $ = cheerio.load(data);

    const articles = [];
    const seenLinks = new Set();

    const containers = [
      '.story-card', '.card', 'article', '.article-card', '.news-item',
      '.story', '.featured-item', '.item', '.post', '.entry'
    ];
    for (const container of containers) {
      $(container).each((i, el) => {
        if (articles.length >= 100) return false;
        const titleEl = $(el).find('h2, h3, .headline, .title, a');
        let title = titleEl.text().trim();
        let link = titleEl.attr('href') || $(el).find('a').attr('href');
        if (title && link) {
          if (link.startsWith('/')) {
            const base = new URL(url);
            link = `${base.protocol}//${base.host}${link}`;
          } else if (!link.startsWith('http')) {
            link = new URL(link, url).href;
          }
          if (!seenLinks.has(link)) {
            seenLinks.add(link);
            articles.push({ title, link, innerText: '' });
          }
        }
      });
    }

    if (articles.length < 100) {
      $('a').each((i, el) => {
        if (articles.length >= 100) return false;
        const text = $(el).text().trim();
        if (text.length > 20 && text.split(' ').length > 3) {
          let link = $(el).attr('href');
          if (link && !link.startsWith('http')) {
            link = new URL(link, url).href;
          }
          if (link && !seenLinks.has(link)) {
            seenLinks.add(link);
            articles.push({ title: text, link, innerText: '' });
          }
        }
      });
    }

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      article.innerText = await fetchArticleText(article.link);
      article.scrapedTime = new Date().toLocaleString();
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    res.json({ success: true, articles });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to scrape the URL', details: error.message });
  }
});

// Simple test route
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

module.exports = app;