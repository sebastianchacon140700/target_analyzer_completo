const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');

puppeteer.use(StealthPlugin());

// Pausa entre reintentos
function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Motor principal de análisis web usando Puppeteer y Cheerio.
 * @param {string} url - URL del sitio a analizar
 */
async function analizarSitio(url) {
    const navegador = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-dev-shm-usage'
        ],
        defaultViewport: { width: 1920, height: 1080 },
        timeout: 60000
    });

    try {
        const pagina = await navegador.newPage();

        // Suprimir recursos pesados para cargar más rápido
        await pagina.setRequestInterception(true);
        pagina.on('request', (req) => {
            const tipo = req.resourceType();
            if (['media', 'font'].includes(tipo)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await pagina.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
        );

        await pagina.setViewport({ width: 1920, height: 1080 });

        // Ocultar propiedad webdriver manualmente (refuerzo del stealth)
        await pagina.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        try {
            await pagina.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 25000
            });
        } catch (e) {
            console.warn(`[ROBOT WARN] Carga parcial para ${url}: ${e.message}`);
        }

        // Espera extra para que JS del sitio se ejecute tras la carga
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Obtener HTML con timeout seguro
        let html = '';
        try {
            html = await Promise.race([
                pagina.content(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('content() timeout')), 10000)
                )
            ]);
        } catch (e) {
            console.warn(`[ROBOT WARN] content() tardó demasiado, usando HTML parcial`);
            html = await pagina.evaluate(() => document.documentElement.outerHTML).catch(() => '');
        }

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
        if (htmlLower.includes('bigcommerce')) technologies.push('BigCommerce');
        if (htmlLower.includes('shopify')) technologies.push('Shopify');

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

/**
 * Wrapper con reintentos automáticos.
 * Reintenta hasta 3 veces con 3 segundos de pausa entre cada intento.
 * @param {string} url - URL del sitio a analizar
 * @param {number} intentos - Cantidad máxima de intentos (default: 3)
 * @param {number} demora - Milisegundos entre reintentos (default: 3000)
 */
async function analizarSitioConReintentos(url, intentos = 3, demora = 3000) {
    for (let i = 1; i <= intentos; i++) {
        try {
            console.log(`[ROBOT] Intento ${i}/${intentos} → ${url}`);
            const resultado = await analizarSitio(url);
            if (i > 1) {
                console.log(`[ROBOT] ✅ Éxito en el intento ${i}/${intentos}`);
            }
            return resultado;
        } catch (error) {
            console.warn(`[ROBOT WARN] Intento ${i}/${intentos} falló: ${error.message}`);
            if (i < intentos) {
                console.log(`[ROBOT] ⏳ Esperando ${demora / 1000}s antes del intento ${i + 1}...`);
                await esperar(demora);
            } else {
                console.error(`[ROBOT] ❌ Todos los intentos fallaron para: ${url}`);
                throw error;
            }
        }
    }
}

module.exports = {
    analizarSitio: analizarSitioConReintentos
};

