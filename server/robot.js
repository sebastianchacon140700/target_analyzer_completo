const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

/**
 * Motor principal de análisis web usando Puppeteer y Cheerio.
 * @param {string} url - URL del sitio a analizar
 */
async function analizarSitio(url) {
    const navegador = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    try {
        const pagina = await navegador.newPage();

        await pagina.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        await pagina.setViewport({ width: 1920, height: 1080 });

        try {
            await pagina.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 20000
            });
        } catch (e) {
            console.warn(`[ROBOT WARN] Carga parcial para ${url}: ${e.message}`);
        }

        const html = await pagina.content();
        const $ = cheerio.load(html);

        // Identidad básica
        const title = $('title').text().trim() || 'Sin título';
        const description = $('meta[name="description"]').attr('content') || 
                            $('meta[property="og:description"]').attr('content') || 
                            'Sin descripción';

        // Favicon
        let favicon = $('link[rel*="icon"]').attr('href') || '';
        if (favicon && !favicon.startsWith('http')) {
            try {
                favicon = new URL(favicon, url).href;
            } catch {
                favicon = '';
            }
        }

        // Idioma
        const language = $('html').attr('lang') || 'No detectado';

        // Extracción de Imágenes
        const images = [];
        $('img').each((_, el) => {
            let src = $(el).attr('src') || $(el).attr('data-src');
            if (src) {
                try {
                    src = new URL(src, url).href;
                    if (!images.includes(src)) {
                        images.push(src);
                    }
                } catch {}
            }
        });

        // Extracción de Enlaces
        const links = [];
        $('a').each((_, el) => {
            let href = $(el).attr('href');
            if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
                try {
                    href = new URL(href, url).href;
                    if (!links.includes(href)) {
                        links.push(href);
                    }
                } catch {}
            }
        });

        // Conteo de Elementos
        const totalScripts = $('script').length;
        const totalStylesheets = $('link[rel="stylesheet"]').length;
        const totalForms = $('form').length;

        // Detección de Tecnologías básica
        const technologies = [];
        const htmlLower = html.toLowerCase();

        if (htmlLower.includes('react')) technologies.push('React');
        if (htmlLower.includes('vue')) technologies.push('Vue');
        if (htmlLower.includes('angular')) technologies.push('Angular');
        if (htmlLower.includes('jquery')) technologies.push('jQuery');
        if (htmlLower.includes('wordpress') || htmlLower.includes('wp-content')) technologies.push('WordPress');
        if (htmlLower.includes('next.js') || htmlLower.includes('_next')) technologies.push('Next.js');
        if (htmlLower.includes('google-analytics') || htmlLower.includes('gtag') || htmlLower.includes('ga.js')) technologies.push('Google Analytics');
        if (htmlLower.includes('fbevents.js') || htmlLower.includes('fbq(')) technologies.push('Facebook Pixel');
        if (htmlLower.includes('og:') || htmlLower.includes('twitter:')) technologies.push('Open Graph');
        if (htmlLower.includes('application/ld+json')) technologies.push('JSON-LD');

        if (technologies.length === 0) {
            technologies.push('HTML5', 'CSS3');
        }

        // Cálculo de Score SEO aproximado
        let scoreSEO = 50;
        if (title && title !== 'Sin título') scoreSEO += 15;
        if (description && description !== 'Sin descripción') scoreSEO += 15;
        if (favicon) scoreSEO += 10;
        if ($('h1').length > 0) scoreSEO += 10;
        scoreSEO = Math.min(scoreSEO, 100);

        return {
            title,
            description,
            url,
            favicon,
            language,
            technologies,
            images,
            links,
            seo: {
                score: scoreSEO,
                hasH1: $('h1').length > 0,
                hasMetaDesc: description !== 'Sin descripción'
            },
            metrics: {
                totalImages: images.length,
                totalLinks: links.length,
                totalScripts,
                totalStylesheets,
                forms: totalForms
            }
        };

    } catch (error) {
        console.error(`[ERROR ROBOT] Error analizando ${url}:`, error.message);
        throw error;
    } finally {
        await navegador.close();
    }
}

module.exports = {
    analizarSitio
};
