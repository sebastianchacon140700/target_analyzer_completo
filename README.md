# Tactical Target Analyzer - Full Stack Web Telemetry

Sistema de análisis y telemetría de sitios web con interfaz táctica en tiempo real, impulsado por Node.js, Express, Puppeteer y Cheerio.

## Estructura del Proyecto Unificado

```
frontend_target_analyzer/
├── client/                 # Interfaz gráfica táctica (HTML, CSS, JS, Audios)
│   ├── index.html
│   ├── style.css
│   ├── main.js
│   └── sonidos/
├── server/                 # Backend API & Motor de Scraping
│   ├── services/
│   │   └── cacheService.js # Gestión de caché en memoria (node-cache)
│   ├── robot.js            # Motor de scraping real con Puppeteer y Cheerio
│   └── receptor.js         # Servidor Express con Helmet, RateLimit, CORS, Joi y Caché
├── package.json            # Dependencias globales unificadas
└── README.md
```

## Requisitos
- Node.js (v18+)

## Instalación
```bash
npm install
```

## Ejecución
```bash
npm start
```

Abre en tu navegador: `http://localhost:3000`
