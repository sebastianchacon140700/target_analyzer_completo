const NodeCache = require("node-cache");

// Caché con TTL de 600 segundos (10 minutos)
const cache = new NodeCache({
    stdTTL: 600
});

/**
 * Obtiene el resultado guardado para una URL dada.
 */
function obtenerCache(url) {
    return cache.get(url);
}

/**
 * Guarda el resultado del análisis asociándolo a la URL.
 */
function guardarCache(url, resultado) {
    cache.set(url, resultado);
}

module.exports = {
    obtenerCache,
    guardarCache
};
