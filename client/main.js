
const inputObjetivo = document.getElementById('target-url');
const botonEscaneo = document.getElementById('btn-scan');
const panelVista = document.querySelector('#panel-vista .contenido-panel');
const panelTech = document.querySelector('#panel-tech .contenido-panel');
const panelEnlaces = document.querySelector('#panel-enlaces .contenido-panel');
const panelMetricas = document.querySelector('#panel-metricas .contenido-panel');

// Helper seguro: evita crash si lucide no cargó desde CDN
function crearIconos() {
    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    }
}

const coloresMetricas = {
    seo: "#fbbf24",
    imagenes: "#35ff6b",
    links: "#4ea8ff",
    scripts: "#ff5252",
    css: "#b45cff",
    formularios: "#ff9a00"
};
const mapaColores = {
    Frameworks: "#35ff6b",
    Analytics: "#ff9a00",
    SEO: "#4ea8ff",
    Marketing: "#b45cff",
    Otros: "#ffffff"
};
const CANTIDAD_LINKS_POR_TANDA = 10;
const TIEMPO_MINIMO_RADAR = 7500;
let controladorAbort = null;
let escaneoEnCurso = false;
let imagenesTarget = [];
let indiceImagenActual = 0;
const sndClick = new Audio('sonidos/click.mp3');
const sndRadar = new Audio('sonidos/radar.mp3');
const sndExito = new Audio('sonidos/exito.mp3');
const sndError = new Audio('sonidos/error.mp3');
const sndRadarMilitar = new Audio('sonidos/radartactico.wav');
const sndAccion = new Audio('sonidos/accion.wav');
const sndFocus = new Audio('sonidos/focus.wav');
sndRadar.loop = true;
sndRadarMilitar.loop = true;
botonEscaneo.addEventListener('click', () => {
    if (escaneoEnCurso) {
        abortarOperacion();
    } else {
        iniciarOperacion();
    }
});
inputObjetivo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        if (!escaneoEnCurso) {
            iniciarOperacion();
        }
    }
});
inputObjetivo.addEventListener('focusin', () => {
    sndFocus.currentTime = 0;
    sndFocus.play().catch(() => {});
});
function esperar(ms, signal) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, ms);

        if (signal) {
            signal.addEventListener("abort", () => {
                clearTimeout(timer);
                reject(new DOMException("Operación abortada", "AbortError"));
            });
        }
    });
}
function delayAnim(index, base = 180) {
    return `animation-delay:${index * base}ms`;
}
const charSets = {
    numbers: '0123456789'
};
function animateScramble(el, charsKey = 'numbers', duration = 1900) {
    if (!el) return;
    const original = (el.innerText || el.textContent || '').toString();
    if (!original.trim()) return;
    const chars = (charSets[charsKey] || charSets.numbers).split('');
    el.classList.add('scrambling');
    const frames = Math.max(8, Math.round(duration / 16));
    const revealFrame = [];
    for (let i = 0; i < original.length; i++) {
        const base = Math.floor((i / Math.max(1, original.length)) * frames);
        revealFrame[i] = base + Math.floor(Math.random() * (frames - base + 1));
    }
    let frame = 0;
    const tick = () => {
        let out = '';
        for (let i = 0; i < original.length; i++) {
            const ch = original[i];
            if (ch === ' ') {
                out += ' ';
                continue;
            }
            if (frame >= revealFrame[i]) {
                out += ch;
            } else {
                out += chars[Math.floor(Math.random() * chars.length)];
            }
        }
        el.innerText = out;
        frame++;
        if (frame <= frames) {
            requestAnimationFrame(tick);
        } else {
            el.innerText = original;
            el.classList.remove('scrambling');
        }
    };
    requestAnimationFrame(tick);
}
function scrambleDentroDe(contenedor, duration = 900) {
    if (!contenedor) return;
    contenedor.querySelectorAll('span, p, h4').forEach(el => {
        if (el.children.length > 0) return;
        animateScramble(el, 'numbers', duration);
    });
}
function estadoBadge(tipo) {
    const estilos = {
        nuevo: {
            texto: "[ESCANEO NUEVO]",
            color: "#35ff6b",
            icono: "radar"
        },
        cache: {
            texto: "[CACHE]",
            color: "#4ea8ff",
            icono: "database"
        },
        backend: {
            texto: "[ERROR BACKEND]",
            color: "#fbbf24",
            icono: "server-crash"
        },
        url: {
            texto: "[URL INVÁLIDA]",
            color: "#ff5252",
            icono: "triangle-alert"
        }
    };
    const estado = estilos[tipo] || estilos.backend;
    return `
        <div class="estado-badge" style="border-color:${estado.color}; color:${estado.color};">
            <i data-lucide="${estado.icono}"></i>
            <span>${estado.texto}</span>
        </div>
    `;
}
function normalizarUrl(valor) {
    let url = valor.trim();
    if (url === "") {
        return {
            ok: false,
            mensaje: "DEBE INGRESAR UN OBJETIVO"
        };
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
    }
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        if (!hostname.includes(".") && hostname !== "localhost") {
            return {
                ok: false,
                mensaje: "DOMINIO INVÁLIDO. USE ALGO COMO GOOGLE.COM"
            };
        }
        return {
            ok: true,
            url
        };
    } catch {
        return {
            ok: false,
            mensaje: "FORMATO INVÁLIDO. USE ALGO COMO HTTPS://EJEMPLO.COM"
        };
    }
}
function limpiarTexto(texto, max = 60) {
    if (!texto) return "[SIN DATOS]";
    const limpio = String(texto)
        .replace(/\s+/g, " ")
        .trim();
    return limpio.length > max
        ? limpio.substring(0, max) + "..."
        : limpio;
}
function detenerRadarMilitar() {
    sndRadarMilitar.pause();
    sndRadarMilitar.currentTime = 0;
}
function obtenerHref(link, baseUrl) {
    let href = "";
    if (typeof link === "string") {
        href = link;
    } else if (link?.href) {
        href = link.href;
    } else if (link?.url) {
        href = link.url;
    }
    if (!href) return null;
    try {
        return new URL(href, baseUrl).href;
    } catch {
        return null;
    }
}
function mostrarErrorFront(titulo, mensaje) {
    sndError.currentTime = 0;
    sndError.play().catch(() => {});
    inputObjetivo.classList.add("input-error");
    const htmlError = `
        <div class="estado-inicial estado-error-panel">
            <div class="pulso-central error-pulso"></div>
            ${estadoBadge("url")}
            <p class="estado-texto">[ ${titulo} ]</p>
            <span class="estado-subtexto">
                ${mensaje}
            </span>
        </div>
    `;
    panelVista.innerHTML = htmlError;
    panelTech.innerHTML = htmlError;
    panelEnlaces.innerHTML = htmlError;
    panelMetricas.innerHTML = htmlError;
    crearIconos();
    setTimeout(() => {
        inputObjetivo.classList.remove("input-error");
        cargarEstadoInicial();
        crearIconos();
    }, 2500);
}
function mostrarErrorSistema(titulo, mensaje) {
    sndError.currentTime = 0;
    sndError.play().catch(() => {});
    const htmlError = `
        <div class="estado-inicial estado-error-panel">
            <div class="pulso-central error-pulso"></div>
            ${estadoBadge("backend")}
            <p class="estado-texto">[ ${titulo} ]</p>
            <span class="estado-subtexto">
                ${mensaje}
            </span>
        </div>
    `;
    panelVista.innerHTML = htmlError;
    panelTech.innerHTML = htmlError;
    panelEnlaces.innerHTML = htmlError;
    panelMetricas.innerHTML = htmlError;
    crearIconos();
    setTimeout(() => {
        cargarEstadoInicial();
        crearIconos();
    }, 3000);
}
function abortarOperacion() {
    if (!controladorAbort) return;
    controladorAbort.abort();
    detenerRadarMilitar();
    sndError.currentTime = 0;
    sndError.play().catch(() => {});
    mostrarErrorSistema(
        "MISIÓN ABORTADA",
        "EL OPERADOR CANCELÓ EL ESCANEO"
    );
    botonEscaneo.innerHTML = `
        <i data-lucide="play"></i>
        [INICIAR_ESCANEO]
    `;
    botonEscaneo.classList.remove('boton-escaneando');
    botonEscaneo.disabled = false;
    document.querySelectorAll('.panel').forEach(panel => {
        panel.style.opacity = '1';
        panel.classList.remove("panel-bloqueado");
    });
    escaneoEnCurso = false;
    controladorAbort = null;
    crearIconos();
}
function crearEstadoInicial(titulo, subtitulo) {
    return `
        <div class="estado-inicial">
            <div class="pulso-central"></div>
            <p class="estado-texto">[ ${titulo} ]</p>
            <span class="estado-subtexto">${subtitulo}</span>
        </div>
    `;
}
function cargarEstadoInicial() {
    panelVista.innerHTML = crearEstadoInicial("VISOR INACTIVO", "SIN IMAGEN DE TARGET");
    panelTech.innerHTML = crearEstadoInicial("MÓDULOS EN STANDBY", "TECNOLOGÍAS NO DETECTADAS");
    panelEnlaces.innerHTML = crearEstadoInicial("MAPA SIN NODOS", "SIN ENLACES CAPTURADOS");
    panelMetricas.innerHTML = crearEstadoInicial("MÉTRICAS EN ESPERA", "SIN TELEMETRÍA");
}
async function iniciarOperacion() {
    const validacion = normalizarUrl(inputObjetivo.value);
    if (!validacion.ok) {
        mostrarErrorFront("ALERTA DE ENTRADA", validacion.mensaje);
        return;
    }
    const urlIngresada = validacion.url;
    const todosLosPaneles = document.querySelectorAll('.panel');
    controladorAbort = new AbortController();
    escaneoEnCurso = true;
    todosLosPaneles.forEach(panel => {
        panel.style.opacity = '0.55';
        panel.classList.add("panel-bloqueado");
    });
    botonEscaneo.innerHTML = `
        <i data-lucide="square"></i>
        [ABORTAR_ESCANEO]
    `;
    botonEscaneo.classList.add('boton-escaneando');
    botonEscaneo.disabled = false;
    crearIconos();
    sndAccion.currentTime = 0;
    sndRadarMilitar.currentTime = 0;
    sndAccion.play().catch(() => {});
    sndRadarMilitar.play().catch(() => {});
    const mensajeCarga = `
        <div class="loader-tactico">
            <span class="loader-texto">[ ESTABLECIENDO CONEXIÓN CON EL TARGET... ]</span>
            <div class="loader-barra"></div>
        </div>
    `;
    panelVista.innerHTML = mensajeCarga;
    panelTech.innerHTML = mensajeCarga;
    panelEnlaces.innerHTML = mensajeCarga;
    panelMetricas.innerHTML = mensajeCarga
    scrambleDentroDe(panelVista, 1200);
    scrambleDentroDe(panelTech, 1200);
    scrambleDentroDe(panelEnlaces, 1200);
    scrambleDentroDe(panelMetricas, 1200);
    try {
        const inicioAnimacion = Date.now();
        const respuesta = await fetch(
            '/api/escanear',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: urlIngresada
                }),
                signal: controladorAbort.signal
            }
        );
        const paqueteReceptor = await respuesta.json();
        console.log(paqueteReceptor);
        const tiempoTranscurrido = Date.now() - inicioAnimacion;
        if (tiempoTranscurrido < TIEMPO_MINIMO_RADAR) {
            await esperar(
                TIEMPO_MINIMO_RADAR - tiempoTranscurrido,
                controladorAbort.signal
            );
        }
        if (!respuesta.ok) {
            throw new Error(
                paqueteReceptor.mensaje || `Enlace rechazado. Status: ${respuesta.status}`
            );
        }
        if (paqueteReceptor.estado === "ERROR") {
            throw new Error(
                paqueteReceptor.mensaje || "[ERROR]: El backend rechazó la operación."
            );
        }
        const datos = paqueteReceptor.resultado?.analisis;
        if (!datos) {
            throw new Error("[DATOS VACÍOS]: El backend no pudo adjuntar el análisis en el paquete.");
        }
        const vinoDeCache = paqueteReceptor.estado === "CACHE";
        const analisis = {
            titulo: datos.title || "[SIN TÍTULO]",
            descripcion: datos.description || "[SIN DESCRIPCIÓN]",
            url: datos.url || urlIngresada,
            favicon: datos.favicon || "",
            tecnologias: datos.technologies || [],
            imagenes: datos.images || [],
            enlaces: datos.links || [],
            seo: datos.seo || {},
            metricas: datos.metrics || {},
            language: datos.language || "[N/D]"
        };
        imagenesTarget = analisis.imagenes
            .map(img => img?.src || img?.url || img)
            .filter(Boolean);
        detenerRadarMilitar();
        sndExito.currentTime = 0;
        sndExito.play().catch(() => {});
        todosLosPaneles.forEach(panel => {
            panel.style.opacity = '1';
            panel.classList.remove("panel-bloqueado");
        });
        renderPanelVista(analisis, vinoDeCache);
        renderPanelTecnologias(analisis);
        renderPanelEnlaces(analisis);
        renderPanelMetricas(analisis);
        botonEscaneo.innerHTML = `
            <i data-lucide="play"></i>
            [INICIAR_ESCANEO]
        `;
        botonEscaneo.classList.remove('boton-escaneando');
        botonEscaneo.disabled = false;
        escaneoEnCurso = false;
        controladorAbort = null;
        crearIconos();
    } catch (error) {
        escaneoEnCurso = false;
        controladorAbort = null;
        todosLosPaneles.forEach(panel => {
            panel.style.opacity = '1';
            panel.classList.remove("panel-bloqueado");
        });
        if (error.name === "AbortError") {
            console.log("Escaneo cancelado por el usuario.");
            return;
        }
        detenerRadarMilitar();
        sndError.currentTime = 0;
        sndError.play().catch(() => {});
        console.error("[REPORTE DE DAÑOS FATAL]:", error);
        mostrarErrorSistema(
            "FALLO DE ENLACE",
            error.message || "BÚNKER CENTRAL NO RESPONDE"
        );
        botonEscaneo.innerHTML = `
            <i data-lucide="play"></i>
            [INICIAR_ESCANEO]
        `;
        botonEscaneo.classList.remove('boton-escaneando');
        botonEscaneo.disabled = false;
        crearIconos();
    }
}
function renderPanelVista(analisis, vinoDeCache) {
    const titulo = limpiarTexto(analisis.titulo, 60);
    const descripcion = limpiarTexto(analisis.descripcion, 160);
    const imagenPrincipal = imagenesTarget[0] || analisis.favicon || "";
    const origen = vinoDeCache ? estadoBadge("cache") : estadoBadge("nuevo");
    panelVista.innerHTML = `
        <div class="preview-target reveal-item" style="${delayAnim(0)}">
            <img
                id="img-target-visor"
                src="${imagenPrincipal}"
                class="miniatura-target"
                onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22600%22 height=%22200%22><rect width=%22100%25%22 height=%22100%25%22 fill=%22black%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22red%22 font-size=%2220%22 text-anchor=%22middle%22>[SIN IMAGEN]</text></svg>';">

            <span class="contador-img-preview" id="contador-preview">
                1 / ${imagenesTarget.length} IMG
            </span>
        </div>
        <div class="reveal-item" style="${delayAnim(1)}">
            ${origen}
        </div>
        <p class="reveal-item" style="${delayAnim(2)}">> TÍTULO</p>
        <p class="reveal-item" style="${delayAnim(3)}">${titulo}</p>
        <p class="reveal-item" style="${delayAnim(4)}">> DESCRIPCIÓN</p>
        <p class="reveal-item" style="${delayAnim(5)}">${descripcion}</p>
        <p class="reveal-item" style="${delayAnim(6)}">> URL</p>
        <p class="reveal-item" style="${delayAnim(7)}">${analisis.url}</p>
    `;
    crearIconos();
    const imgTarget = document.getElementById('img-target-visor');
    const previewTarget = document.querySelector('.preview-target');
    if (previewTarget) {
        let bloqueoScroll = false;
        let inicioY = 0;
        previewTarget.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (bloqueoScroll || imagenesTarget.length <= 1) return;
            bloqueoScroll = true;
            if (e.deltaY > 0) {
                cambiarImagenPreview("siguiente");
            } else {
                cambiarImagenPreview("anterior");
            }
            setTimeout(() => {
                bloqueoScroll = false;
            }, 180);
        });
        previewTarget.addEventListener('touchstart', (e) => {
            inicioY = e.touches[0].clientY;
        });
        previewTarget.addEventListener('touchend', (e) => {
            const finY = e.changedTouches[0].clientY;
            const diferencia = inicioY - finY;
            if (Math.abs(diferencia) < 35) return;
            if (diferencia > 0) {
                cambiarImagenPreview("siguiente");
            } else {
                cambiarImagenPreview("anterior");
            }
        });
    }
    if (imgTarget) {
        imgTarget.addEventListener('click', () => {
            mostrarImagenActual();
            const visorTactico = document.getElementById('visor-tactico');
            if (visorTactico) {
                visorTactico.classList.add('visibilidad-activa');
            }
        });
    }
}
function renderPanelTecnologias(analisis) {
    const resumenTech = clasificarTecnologias(analisis.tecnologias);
    const resumenHTML = `
        <h4 class="titulo-resumen reveal-item" style="${delayAnim(0)}">>> RESUMEN DE CATEGORÍAS</h4>
        ${filaResumen("FRAMEWORKS", resumenTech.Frameworks || 0, mapaColores.Frameworks, "cpu", 1)}
        ${filaResumen("ANALYTICS", resumenTech.Analytics || 0, mapaColores.Analytics, "chart-column", 2)}
        ${filaResumen("SEO", resumenTech.SEO || 0, mapaColores.SEO, "search", 3)}
        ${filaResumen("MARKETING", resumenTech.Marketing || 0, mapaColores.Marketing, "megaphone", 4)}
        ${filaResumen("OTROS", resumenTech.Otros || 0, mapaColores.Otros, "boxes", 5)}
        <hr class="reveal-item" style="${delayAnim(6)}; border:0; border-top:1px solid #dc2626; margin:10px 0;">
        <h4 class="titulo-resumen reveal-item" style="${delayAnim(7)}">>> TECNOLOGÍAS DETECTADAS</h4>
        <div id="tipeo-tech" class="reveal-item" style="${delayAnim(8)}"></div>
    `;
    panelTech.innerHTML = resumenHTML;
    crearIconos();
    const listaHTML = analisis.tecnologias.map(tech => {
        const cat = obtenerCategoria(tech);
        const color = mapaColores[cat] || "#fff";
        return `
            <div class="tech-item"
                 style="
                    border-left:3px solid ${color};
                    display:flex;
                    justify-content:space-between;
                    padding:4px 8px;
                    margin-bottom:5px;
                    background:rgba(255,255,255,0.03);">

                <span>${String(tech).toUpperCase()}</span>

                <span style="color:${color}; font-size:0.7rem;">
                    ${cat.toUpperCase()}
                </span>
            </div>
        `;
    }).join("");
    setTimeout(() => {
        const tipeoTech = document.getElementById('tipeo-tech');
        if (!tipeoTech) return;
        if (typeof Typed !== 'undefined') {
            new Typed('#tipeo-tech', {
                strings: [listaHTML || '<span style="color:var(--color-alerta)">[SIN TECNOLOGÍAS DETECTADAS]</span>'],
                typeSpeed: 20,
                showCursor: true,
                cursorChar: '█',
                contentType: 'html'
            });
        } else {
            tipeoTech.innerHTML = listaHTML || '<span style="color:var(--color-alerta)">[SIN TECNOLOGÍAS DETECTADAS]</span>';
        }
    }, 1200);
}
function clasificarTecnologias(tecnologias) {
    const categorias = {
        Frameworks: 0,
        Analytics: 0,
        SEO: 0,
        Marketing: 0,
        Otros: 0
    };
    tecnologias.forEach(tech => {
        const categoria = obtenerCategoria(tech);
        categorias[categoria]++;
    });

    return categorias;
}
function obtenerCategoria(tech) {
    const t = String(tech).toLowerCase();
    if (["react", "vue", "angular", "jquery", "node.js", "next.js", "wordpress"].includes(t)) {
        return "Frameworks";
    }
    if (["google analytics", "facebook pixel"].includes(t)) {
        return "Analytics";
    }
    if (["json-ld", "open graph"].includes(t)) {
        return "SEO";
    }
    if (["hubspot"].includes(t)) {
        return "Marketing";
    }
    return "Otros";
}
function filaResumen(nombre, valor, color, icono, delay = 0) {
    const ancho = Math.min(valor * 25, 100);
    return `
        <div class="fila-tech reveal-item" style="${delayAnim(delay)}">
            <div class="tech-info">
                <i data-lucide="${icono}" class="icono-tech"></i>
                <span class="tech-nombre">${nombre}</span>
            </div>
            <div class="tech-barra">
                <div class="tech-barra-fill"
                     style="
                        width:${ancho}%;
                        background:${color};
                        box-shadow:0 0 8px ${color};">
                </div>
            </div>
            <span class="tech-numero" style="color:${color}">
                ${String(valor).padStart(2, "0")}
            </span>
        </div>
    `;
}
function renderPanelEnlaces(analisis) {
    const enlacesNormalizados = analisis.enlaces
        .map(link => obtenerHref(link, analisis.url))
        .filter(Boolean);
    let cantidadMostrada = 0;
    panelEnlaces.innerHTML = `
        <p class="reveal-item" style="${delayAnim(0)}; color:var(--color-alerta)">
            > ENLACES DETECTADOS: ${enlacesNormalizados.length}
        </p>
        <div id="lista-enlaces"></div>
        <div id="estado-carga-links"
             class="reveal-item"
             style="${delayAnim(1)};
                color:var(--color-terminal);
                font-size:.75rem;
                margin-top:10px;">
            [SCROLL PARA CARGAR MÁS]
        </div>
    `;
    function cargarMasLinks() {
        if (cantidadMostrada >= enlacesNormalizados.length) return;
        const contenedor = document.getElementById("lista-enlaces");
        const estado = document.getElementById("estado-carga-links");
        if (!contenedor || !estado) return;
        const tanda = enlacesNormalizados.slice(
            cantidadMostrada,
            cantidadMostrada + CANTIDAD_LINKS_POR_TANDA
        );
        tanda.forEach((href, index) => {
            const texto = href.length > 65
                ? href.substring(0, 65) + "..."
                : href;
            contenedor.insertAdjacentHTML("beforeend", `
                <a
                    class="links reveal-item"
                    style="${delayAnim(index + 2, 90)}"
                    href="${href}"
                    target="_blank"
                    rel="noopener noreferrer"
                    title="${href}">
                    &gt; ${texto}
                </a>
            `);
        });
        cantidadMostrada += tanda.length;
        estado.textContent =
            cantidadMostrada >= enlacesNormalizados.length
                ? "[FIN DEL MAPA DE ENLACES]"
                : `[MOSTRANDO ${cantidadMostrada}/${enlacesNormalizados.length}]`;
        if (
            cantidadMostrada < enlacesNormalizados.length &&
            panelEnlaces.scrollHeight <= panelEnlaces.clientHeight
        ) {
            cargarMasLinks();
        }
    }
    cargarMasLinks();
    panelEnlaces.onscroll = () => {
        const llegoAlFinal =
            panelEnlaces.scrollTop +
            panelEnlaces.clientHeight >=
            panelEnlaces.scrollHeight - 100;
        if (llegoAlFinal) {
            cargarMasLinks();
        }
    };
}
function renderPanelMetricas(analisis) {
    const metricas = analisis.metricas || {};
    const seo = analisis.seo || {};
    const scoreSEO = seo.score ?? 0;
    panelMetricas.innerHTML = `
        <h4 class="titulo-resumen reveal-item" style="${delayAnim(0)}">>> ESTADO DEL TARGET</h4>
        ${filaMetrica("SEO SCORE", scoreSEO, 100, coloresMetricas.seo, "activity", 1)}
        ${filaMetrica("IMÁGENES", metricas.totalImages ?? 0, 200, coloresMetricas.imagenes, "image", 2)}
        ${filaMetrica("LINKS", metricas.totalLinks ?? 0, 400, coloresMetricas.links, "link", 3)}
        ${filaMetrica("SCRIPTS", metricas.totalScripts ?? 0, 200, coloresMetricas.scripts, "code", 4)}
        ${filaMetrica("CSS", metricas.totalStylesheets ?? 0, 50, coloresMetricas.css, "paintbrush", 5)}
        ${filaMetrica("FORMULARIOS", metricas.forms ?? 0, 20, coloresMetricas.formularios, "file-input", 6)}
        <hr class="reveal-item" style="${delayAnim(7)}; border:0; border-top:1px solid #dc2626; margin:12px 0;">
        <p class="reveal-item" style="${delayAnim(8)}">> IDIOMA: <b>${analisis.language}</b></p>
    `;
    crearIconos();
}
function filaMetrica(nombre, valor, maximo, color, icono, delay = 0) {
    const ancho = Math.min((valor / maximo) * 100, 100);
    return `
        <div class="fila-metrica reveal-item" style="${delayAnim(delay)}">
            <div class="metrica-info">
                <i data-lucide="${icono}" class="icono-tech"></i>
                <span>${nombre}</span>
            </div>
            <div class="metrica-barra">
                <div class="metrica-fill"
                    style="
                        width:${ancho}%;
                        background:${color};
                        box-shadow:0 0 8px ${color};">
                </div>
            </div>
            <span class="metrica-numero" style="color:${color}">
                ${valor}
            </span>
        </div>
    `;
}
const botonesToggle = document.querySelectorAll('.btn-toggle-expand');
botonesToggle.forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = btn.closest('.panel');
        if (!panel) return;
        const isExpanding = !panel.classList.contains('expandido');
        if (isExpanding) {
            panel.classList.add('expandido');
            document.querySelectorAll('.panel').forEach(p => {
                if (p !== panel) {
                    p.classList.add('dimmed');
                }
            });
            btn.innerHTML = `<i data-lucide="x"></i>`;
        } else {
            panel.classList.remove('expandido');
            document.querySelectorAll('.panel').forEach(p => {
                p.classList.remove('dimmed');
            });
            btn.innerHTML = `<i data-lucide="maximize-2"></i>`;
        }
        crearIconos();
    });
});
function cambiarImagenPreview(direccion) {
    if (imagenesTarget.length <= 1) return;
    if (direccion === "siguiente") {
        indiceImagenActual++;
        if (indiceImagenActual >= imagenesTarget.length) {
            indiceImagenActual = 0;
        }
    }
    if (direccion === "anterior") {
        indiceImagenActual--;
        if (indiceImagenActual < 0) {
            indiceImagenActual = imagenesTarget.length - 1;
        }
    }
    mostrarImagenPreview();
}
function mostrarImagenPreview() {
    const imgPreview = document.getElementById('img-target-visor');
    const contadorPreview = document.getElementById('contador-preview');
    if (!imgPreview || !imagenesTarget.length) return;
    imgPreview.src = imagenesTarget[indiceImagenActual];
    if (contadorPreview) {
        contadorPreview.textContent = `${indiceImagenActual + 1} / ${imagenesTarget.length} IMG`;
    }
}
function mostrarImagenActual() {
    if (!imagenesTarget.length) return;
    const img = document.getElementById('imagen-ampliada');
    const contador = document.getElementById('contador-imagen');
    const btnAnt = document.getElementById('btn-anterior');
    const btnSig = document.getElementById('btn-siguiente');
    if (!img || !contador || !btnAnt || !btnSig) return;
    img.src = imagenesTarget[indiceImagenActual];
    contador.textContent = `[${indiceImagenActual + 1} / ${imagenesTarget.length}]`;
    if (imagenesTarget.length <= 1) {
        btnAnt.style.display = 'none';
        btnSig.style.display = 'none';
    } else {
        btnAnt.style.display = 'block';
        btnSig.style.display = 'block';
    }
}
const visor = document.getElementById('visor-tactico');
if (visor) {
    visor.addEventListener('click', function () {
        this.classList.remove('visibilidad-activa');
    });
}
const btnSiguiente = document.getElementById('btn-siguiente');
const btnAnterior = document.getElementById('btn-anterior');
if (btnSiguiente) {
    btnSiguiente.addEventListener('click', (e) => {
        e.stopPropagation();

        indiceImagenActual++;

        if (indiceImagenActual >= imagenesTarget.length) {
            indiceImagenActual = 0;
        }

        mostrarImagenActual();
    });
}
if (btnAnterior) {
    btnAnterior.addEventListener('click', (e) => {
        e.stopPropagation();

        indiceImagenActual--;

        if (indiceImagenActual < 0) {
            indiceImagenActual = imagenesTarget.length - 1;
        }

        mostrarImagenActual();
    });
}

cargarEstadoInicial();
crearIconos();
