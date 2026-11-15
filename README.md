# BTC Alertas

Panel de señales y gestión del riesgo para BTC. Es un único archivo HTML: se abre en el navegador, lee datos públicos de Bybit cada minuto y avisa con sonido, notificación y parpadeo de la pestaña cuando una estrategia validada da señal. No ejecuta órdenes ni necesita contraseñas.

## Uso

1. Abre `btc-alertas.html` en Chrome (doble clic).
2. Pon tu capital, tu moneda y el riesgo por operación (1 % por defecto).
3. Pulsa **Activar alertas** y acepta las notificaciones. Deja la pestaña abierta: si la cierras, no hay alertas.
4. Cuando salte una señal, el panel te da la entrada, el stop, el TP1, el tamaño en BTC y el apalancamiento necesario. Lo ejecutas tú en Quantfury.
5. Una vez al mes, pulsa **Revalidar ahora**. Si la estrategia principal deja de ser positiva fuera de muestra, deja de operarla.

## Reglas de gestión

- Tamaño calculado por la distancia al stop: si salta, pierdes exactamente el % elegido.
- TP1: cierras el 50 % y el stop pasa a la entrada. El resto sigue con un stop dinámico a 3×ATR del máximo (o mínimo) alcanzado.
- Una operación a la vez. Tras 2 pérdidas seguidas, 24 h de pausa.
- Sin entradas desde 4 h antes hasta 2 h después de un dato macro de impacto alto (lista editable en el panel).
- Las señales caducan si el precio ya tocó el stop o el TP1, y el panel avisa si el precio se ha alejado más de 0,3R de la entrada.

## Cómo se eligieron las estrategias

Datos de futuros perpetuos BTCUSDT desde el 1 de enero de 2022 hasta el 8 de noviembre de 2026, en Binance y en Bybit. Coste supuesto: 0,02 % por lado (Quantfury no cobra comisión; queda el diferencial y el deslizamiento). Si el stop y el objetivo caen en la misma vela, se cuenta el stop.

Se probaron 4 tipos de setup en 1h y 4h con varias combinaciones de parámetros. Para cada uno, el primer 70 % del histórico sirve de ajuste y el último 30 % de validación. Solo pasan los que son positivos en los dos tramos, en los dos exchanges, y no dependen de un parámetro exacto.

| Estrategia | Marco | Resultado | Estado |
|---|---|---|---|
| Retroceso en tendencia (EMA20, RSI < 45, tendencia 4h) | 1h | Bybit: 526 ops, 45 % de acierto, +0,12R por operación, caída máxima 15,6 %, peor racha 7 pérdidas. Binance: +0,11R. Validación: +0,11R | **Principal** |
| Barrido de liquidez (mínimo/máximo de 48 velas) | 4h | Bybit: 204 ops, 36 %, +0,10R. Binance: +0,17R, pero −0,18R en 2026 | Secundaria, confianza baja |
| Ruptura de compresión de volatilidad | 1h | Llega al TP1 (0,5R) ~70 % de las veces, pero en Bybit la validación da ≈ 0R | Solo informativa |
| Retroceso Fibonacci 50–61,8 % de un impulso ≥4 ATR, a favor de tendencia (estrategia F) | 1h | Bybit: 76 ops, 58 % de acierto, +0,12R. Binance: 77 ops, +0,15R. Pocas operaciones | Secundaria, confianza baja |
| Entrada del curso en onda 2 (0,5/0,618, stop en inicio de onda 1, objetivos 1:1 y 1,618) | 1h / 4h | −0,10R (1h) y −0,31R (4h) a favor de tendencia; en contra de tendencia (B→C de un zigzag) +0,07 a +0,09R | Descartada como alerta automática |
| Fibonacci genérico (cualquier retroceso) | 1h / 4h | ≈ 0R | Descartada |
| Barrido de liquidez | 1h | ≈ 0R en el mejor caso; negativo en cuanto el coste sube a 0,05 % por lado | Descartada |
| Ruptura Donchian | 1h / 4h | Depende demasiado de los parámetros | Descartada |

Rendimiento anual de la principal arriesgando un 1 % por operación (Bybit): 2022 −7 %, 2023 +13 %, 2024 +39 %, 2025 +8 %, 2026 +14 %.

**Ninguna estrategia probada da un 70 % de acierto de forma robusta.** La ventaja es pequeña y real: alrededor de +0,1R de media por operación, con rachas de 6–7 pérdidas seguidas que hay que aguantar.

Con objetivos fijos y sin stop dinámico, la principal acierta un 38 % a 2R y un 30 % a 3R. El esquema 60 % de acierto con 1:2–1:3 no apareció en ningún setup probado.

## Elliott y Fibonacci

Tarjeta **Elliott + Fibonacci**: eliges temporalidad (15m, 1h, 4h, diario) y pulsas **Analizar ondas**. El panel dibuja el recuento principal y deja elegir alternativos.

- Pivotes con zigzag por ATR (varias sensibilidades); se prueban impulsos comunes, diagonales contractivas y expansivas, zigzags, flats (regular, running, expandido) y triángulos.
- Reglas y ratios del Módulo 3 del curso: onda 2 al 50–78,6 %, onda 3 ≈ 1,618 de la 1, onda 4 al 23,6–50 %, onda 5 de 0,618 a 1,618 de la 1; ratios propios de diagonales, flats y triángulos; tiempo y volumen.
- Descarta los recuentos que rompen una regla dura y los que el precio ya invalidó.
- Para el recuento elegido muestra: estado, checklist ✓/✗, operativa del curso (zona de entrada, stop, objetivos), tamaño según tu riesgo, objetivos Fibonacci y nivel de invalidación.

Úsalo para planificar y para contrastar lo que dicen tus analistas, no como señal: la operativa del curso aplicada de forma automática no mostró ventaja en el histórico.

## Verificador de analistas

Apuntas cada operación que publique un analista (fecha, lado, entrada, stop, objetivo). El panel descarga las velas de 15m desde ese momento y marca si tocó primero el stop o el objetivo. Resume el acierto y la R media por analista, y lo compara con lo que promete un 60 % a 1:2–1:3 (+0,8R a +1,4R por operación). Con 30–50 operaciones apuntadas ya se ve si se cumple. Copia de seguridad en JSON.

## Modo sencillo

Por defecto el panel muestra solo lo esencial: qué hacer ahora (compra/vende con % de acierto histórico, explicación, entrada, stop, objetivo, cantidad), tu riesgo, las ondas de Elliott y las ballenas. **Ver todo** muestra el detalle.

Cada señal indica si Elliott en la misma temporalidad coincide o va en contra. Si el precio anula el recuento de Elliott que estás viendo, el panel avisa y recalcula.

## Empresas y gobiernos

Tarjeta 🏛️: compras y ventas de BTC declaradas por las 10 empresas con más BTC (Strategy, Metaplanet, Twenty One, Strive, MARA…) y por 13 gobiernos (Estados Unidos, China, Reino Unido, Bután, El Salvador, Corea del Norte, Emiratos…), con fecha, cantidad, valor, saldo y enlace a la fuente oficial. Datos de CoinGecko; se actualiza cada 12 h. No incluye ETF ni carteras sin identificar, y algunos gobiernos no publican cada movimiento.

## Ballenas (Hyperliquid)

Las 40 cuentas con más beneficio histórico y más de 5 M$ en Hyperliquid. Muestra sus posiciones abiertas en BTC (lado, tamaño, entrada, apalancamiento, liquidación) y, comparando cada 5 minutos, quién abre, aumenta, reduce o cierra. Es un solo exchange y no está validado como estrategia: es contexto.

## Lectura continua de ondas

Tarjeta 🌊: cuenta las ondas en semanal, diario, 4h, 1h y 15 min a la vez, con la notación de grados de Frost y Prechter (Ciclo I-V, Primario ①-⑤, Intermedio (1)-(5), Menor 1-5, Minuto i-v). Dice en qué onda está cada grado, si va a favor del grado mayor o es una corrección dentro de él, y el nivel más cercano que cambiaría la lectura. Se actualiza cada minuto.

Patrones que reconoce: impulso (onda 1, 3 o 5 extendida, quinta truncada), diagonales contractivas y expansivas (de inicio y final), zigzag, flat regular, running y expandido, triángulos contractivo, running, de barrera y expansivo, y correcciones complejas: doble y triple zigzag y combinaciones W-X-Y y W-X-Y-X-Z, también en formación (X en curso o Y a medias).

Reglas que descartan un recuento: la 2 no supera el inicio de la 1; la 3 nunca es la más corta; la 4 no entra en la 1 (salvo diagonal); en diagonal la 4 no supera el final de la 2; la B de un zigzag no supera el inicio de A; la X no supera el inicio de W; máximo 3 grupos; el triángulo solo como último grupo; la E de un triángulo contractivo no supera la C; el precio no ha roto ya la invalidación.

Guías que puntúan: proporciones de Fibonacci del curso, alternancia 2–4, igualdad 1–5 con la 3 extendida, zona de la 4 de grado menor, canal 2–4 (Prechter), Y = W en complejas, duración, volumen y estructura interna de cada onda (5 en motrices, 3 en correctivas). A igual encaje gana el recuento más sencillo. Cada recuento da un nivel de confirmación y otro de invalidación.

Pruebas: `node tests/elliott.test.js` genera 14 patrones de libro y 5 casos que rompen reglas; el contador reconoce los 14 en primera posición y respeta las 5 reglas.

## Estructura anidada (grado mayor + ondas internas)

En el gráfico de Elliott, cada temporalidad se lee dentro de la superior: 5m dentro de 30m, 15m dentro de 1h, 30m y 1h dentro de 4h, 2h y 4h dentro del diario, 12h y diario dentro del semanal. Las ondas del grado mayor (cian, entre paréntesis) se trasladan a la temporalidad que estás viendo, y cada una se subdivide en sus ondas internas (gris): 5 (i-ii-iii-iv-v) si es motriz y 3 (a-b-c) si es correctiva, empezando y terminando exactamente en los extremos de la onda mayor. Así, al bajar de temporalidad ves por dentro el mismo ABC, no otra estructura. Los niveles (confirmación, invalidación y 2 objetivos) son los del grado mayor; Fibonacci, zona y stop solo aparecen en «Ver todo».

## Fiabilidad medida (10-nov-2026)

Prueba sin mirar al futuro con datos de Bybit: en cada vela se toma el recuento principal y se comprueba si el precio llega antes al primer objetivo o a la invalidación. «Azar» es lo que acertaría una dirección cualquiera con las mismas distancias.

| Temporalidad | Casos | Acierto | Azar | Resultado |
|---|---|---|---|---|
| 4h (16 meses) | 156 | 44 % | 48 % | sin ventaja (algo peor) |
| 1h (8 meses) | 293 | 50 % | 48 % | sin ventaja |

- La etiqueta de encaje (alta/media/baja) no mejora el acierto: «alta» acierta lo mismo que el azar.
- El recuento principal se mantiene igual en el 71–72 % de las actualizaciones; cambia con frecuencia.
- Conclusión: el contador lee bien la estructura según las reglas, pero no predice la dirección. El panel muestra ahora el acierto medido y la estabilidad del recuento en lugar de una fiabilidad subjetiva. La única señal con ventaja medida sigue siendo la alerta principal (retroceso en tendencia, 1h, +0,12R/op).

## Bibliografía de referencia

- A. J. Frost y R. Prechter, *Elliott Wave Principle: Key to Market Behavior* — el texto de referencia: reglas, guías, grados, canales y Fibonacci.
- Glenn Neely, *Mastering Elliott Wave* (NEoWave) — método más objetivo y estricto, con reglas de tiempo y de similitud.
- Robert Miner, *Elliott Wave Trading: Principles and Practice* — aplicación práctica con tiempo y Fibonacci.
- Jeffrey Kennedy, *Trader's Classroom Collection* — ejemplos prácticos para aprender a contar.
- Constance Brown, *Fibonacci Analysis* — confluencias de Fibonacci.
- John J. Murphy, *Technical Analysis of the Financial Markets* — base general de análisis técnico.

## Limitaciones

- Resultados pasados. El mercado cambia: por eso existe el botón de revalidar.
- Los datos de posicionamiento (funding, ratio largo/corto, open interest) se muestran como contexto. No entran en las reglas porque Bybit solo guarda unos meses de historial y no se pudieron validar.
- El precio de Bybit puede diferir unos dólares del de Quantfury.
- Las notificaciones dependen de que el navegador esté abierto y la pestaña no se cierre.

## Archivos

- `btc-alertas.html` — el panel listo para usar (generado).
- `panel.src.html` — interfaz del panel.
- `elliott.js` — zigzag, recuentos de Elliott, Fibonacci y la estrategia F.
- `engine.js` — indicadores, setups, gestión de la operación y backtest (sin dependencias; funciona en navegador y en Node).
- `build.py` — une los tres anteriores en `btc-alertas.html`.

No es asesoramiento financiero.

## Wyckoff (nuevo)

Módulo `wyckoff.js` (se integra en el HTML con `build.py`). Lee el volumen **en BTC** (no en dólares), el rango de cada vela y dónde cierra.

- **Eventos de acumulación:** SC (clímax de venta), AR (rebote automático), ST (test secundario), Spring, Test, SOS (señal de fuerza), LPS (último soporte).
- **Eventos de distribución:** BC, AR, ST, UTAD, SOW y LPSY.
- **Rupturas:** marca cuándo un rango falla.
- **Fases A–E** con lo que se espera a continuación y un plan de entrada (spring/test, LPS, UTAD/LPSY).
- **Esfuerzo frente a resultado:** absorción, falta de demanda y falta de oferta en la última vela, y quién domina el volumen en las últimas 20 velas.
- **Dónde aparece:**
  - Tarjeta 🧱 con Diario, 4h y 1h.
  - Puntos y rango en el gráfico de Elliott (casilla «Wyckoff»).
  - Una línea en la señal de compra/venta que dice si Wyckoff va a favor o en contra.
  - Avisos en 📡 cuando aparece un evento nuevo.
- **Tests:** `node tests/wyckoff.test.js` comprueba la acumulación completa, la distribución en espejo, el markdown sin clímax y un rango roto.
- **Aviso:** es una lectura automática y sirve como contexto. No es una estrategia medida con backtest.
