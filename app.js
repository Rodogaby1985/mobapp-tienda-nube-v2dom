// app.js V2.6 DOMICILIO (con Static Files)
// app.js - Versión final con almacenamiento de sesiones en Redis
'use strict';

const config = require('./src/config');
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
// --- LÍNEA CORREGIDA (de nuevo) ---
// Usamos la desestructuración, que es la forma correcta para las versiones modernas de connect-redis.
const { RedisStore } = require("connect-redis"); 
const { createClient } = require("redis");
const logger = require('./src/utils/logger');
const authRoutes = require('./src/routes/authRoutes');
const shippingRoutes = require('./src/routes/shippingRoutes');
const { loadAllSheetDataIntoCache } = require('./src/services/googleSheetsService');

const app = express();

// --- CONFIGURACIÓN PARA PROXY ---
app.set('trust proxy', 1);

// --- CONFIGURACIÓN DE REDIS ---
const redisClient = createClient({ url: config.redisUrl });
redisClient.connect().catch(err => logger.error('No se pudo conectar a Redis:', err));

// Ahora 'new RedisStore' funcionará porque la clase se importó correctamente.
const redisStore = new RedisStore({
  client: redisClient,
  prefix: "dom-session:",
});

// Middlewares estándar
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// --- CONFIGURACIÓN DE SESIÓN CON REDIS ---
app.use(
  session({
    store: redisStore,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: true,
      httpOnly: true,
      sameSite: 'none'
    }
  })
);

// Middleware para exponer la modalidad de la app
app.use((req, _res, next) => {
  req.modality = config.modality;
  next();
});

// Rutas de la aplicación
app.use('/', authRoutes);
app.use('/api', shippingRoutes);

// Ruta de Health Check
app.get('/health', (_req, res) => {
  res.status(200).send('OK');
});

// Manejador de errores global
app.use((err, _req, res, _next) => {
  logger.error(`Unhandled error: ${err.stack || err}`);
  res.status(500).send('Ocurrió un error interno en el servidor.');
});

// Función de arranque del servidor
async function startServer() {
  try {
    logger.info('Iniciando carga de la caché de Google Sheets...');
    await loadAllSheetDataIntoCache();
    logger.info('¡Éxito! La caché de Google Sheets ha sido cargada.');

    app.listen(config.port, config.host, () => {
      logger.info(`Servidor LISTO Y ESCUCHANDO en http://${config.host}:${config.port}`);
      logger.info(`MODALIDAD: ${config.modality.toUpperCase()}`);
      logger.info(`PUBLIC_API_URL: ${config.publicApiUrl || 'NO DEFINIDA'}`);
    });

  } catch (error) {
    logger.error('FATAL: No se pudo cargar la caché inicial de Google Sheets. El servidor no se iniciará.');
    logger.error(error);
    process.exit(1);
  }
}
// Endpoint para probar sesión con Redis
app.get('/session-test', (req, res) => {
  if (!req.session.views) {
    req.session.views = 1;
  } else {
    req.session.views++;
  }
  res.send(`Has visitado esta página ${req.session.views} veces (almacenado en Redis).`);
});

app.use(
  session({
    store: redisStore,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,         // Solo HTTPS
      httpOnly: true,       // No accesible desde JS
      sameSite: 'none'      // Requerido si tu frontend está en otro dominio
    }
  })
);


startServer();

module.exports = app;

