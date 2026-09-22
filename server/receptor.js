const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
const joi = require('joi');
const { obtenerCache, guardarCache } = require('./services/cacheService');
const { analizarSitio } = require('./robot');

const app = express();
const PUERTO = process.env.PORT || 3000;
const LIMITE_ESCANEOS = 100;
let totalEscaneos = 0;

/* Middleware */
app.use(helmet({
    contentSecurityPolicy: false // Permitir ejecución flexible de assets locales y CDNs en el frontend
}));
app.use(express.json());
app.use(cors());
app.use(morgan('dev'));

// Servir archivos estáticos del cliente
app.use(express.static(path.join(__dirname, '../client')));

/* Esquema de validación Joi */
const esquemaEscaneo = joi.object({
    url: joi.string().uri().required()
});

/* Rate Limiter para protección táctica */
const limitadorEscaneos = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 15,
    message: {
        estado: 'ERROR',
        mensaje: '[ALERTA TÁCTICA]: Demasiadas peticiones consecutivas. Espere 60 segundos antes de reintentar.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

/* Ruta Principal de Escaneo */
app.post('/api/escanear', limitadorEscaneos, async (req, res) => {
    try {
        if (totalEscaneos >= LIMITE_ESCANEOS) {
            return res.status(403).json({
                estado: 'ERROR',
                mensaje: '[LÍMITE ALCANZADO]: No se permiten más escaneos.'
            });
        }

        const { error } = esquemaEscaneo.validate(req.body);
        if (error) {
            return res.status(400).json({
                estado: 'ERROR',
                mensaje: '[URL INVÁLIDA]: Ingrese una dirección web válida con http:// o https://'
            });
        }

        const urlRecibida = req.body.url;
        console.log(`[BÚNKER CENTRAL] Objetivo recibido: ${urlRecibida}`);

        // Verificar Caché
        const resultadoCache = obtenerCache(urlRecibida);
        if (resultadoCache) {
            console.log(`[CACHE] Retornando análisis desde caché para: ${urlRecibida}`);
            return res.json({
                estado: 'CACHE',
                resultado: resultadoCache,
                totalEscaneos,
                limite: LIMITE_ESCANEOS
            });
        }

        // Ejecutar Análisis Real con Puppeteer
        console.log(`[ROBOT] Iniciando escaneo en vivo de: ${urlRecibida}`);
        const analisis = await analizarSitio(urlRecibida);

        const resultadoFinal = {
            analisis
        };

        // Guardar en Caché e incrementar contador
        guardarCache(urlRecibida, resultadoFinal);
        totalEscaneos++;

        res.json({
            estado: 'EXITO',
            mensaje: '[ANÁLISIS COMPLETO]',
            objetivo: urlRecibida,
            resultado: resultadoFinal,
            totalEscaneos,
            limite: LIMITE_ESCANEOS
        });

    } catch (err) {
        console.error('[ERROR BACKEND]', err);
        res.status(500).json({
            estado: 'ERROR',
            mensaje: `[ERROR DEL SERVIDOR]: ${err.message || 'Fallo interno en el escaneo'}`
        });
    }
});

/* Fallback para el Frontend */
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

/* Arranque */
app.listen(PUERTO, () => {
    console.log(`=================================================`);
    console.log(`[BÚNKER CENTRAL]: Servidor iniciado en puerto ${PUERTO}`);
    console.log(`[FRONTEND]: http://localhost:${PUERTO}`);
    console.log(`=================================================`);
});
