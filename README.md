# River Paradise — Sistema de Mesas

---

## Requisitos

Solo necesitas **Node.js** instalado. Ya lo tienes (v24.16.0).

---

## Instalación (solo la primera vez)

Doble clic en **`instalar.bat`**

Esperar hasta que diga "Instalacion completada". El instalador prepara también la interfaz de producción.

---

## Usar el sistema cada día

La primera vez, hacer clic derecho en **`configurar_servidor.bat`** y elegir
**Ejecutar como administrador**. El sistema arrancará automáticamente con Windows,
se reiniciará si el proceso falla y estará disponible en http://localhost:8080.
`iniciar.bat` queda disponible para un inicio manual.

## Usar desde otra computadora o tablet

1. En la computadora principal, hacer clic derecho sobre `configurar_red.bat` y
   elegir **Ejecutar como administrador**. Esto se hace una sola vez.
2. Mantener encendidos el servidor y el router de la red local.
3. Abrir `http://192.168.0.18:8080`.
4. Abrir esa dirección en la otra computadora o tablet.

Los dispositivos deben poder comunicarse dentro de la misma red. Si un punto de
acceso tiene activado aislamiento de clientes, el administrador de la red deberá
desactivarlo. Solo se habilita el puerto 8080 en la red privada; no se publica el sistema en Internet.

## Restaurante y cafetería

El selector **Local** cambia entre Restaurante y Cafetería. Cada local tiene 12
mesas, ventas, caja chica y cierre independientes. La carta, las cuentas y el
inventario son compartidos. En **Reportes** se puede elegir un local o el reporte
**Consolidado**, que suma ambos sin mezclar el efectivo físico de sus cajas.

---

## Dónde están los datos

Los datos se guardan en:

  backend\river_paradise.sqlite

Ese archivo SQLite contiene las ventas, cierres, cuentas, inventario, usuarios y sesiones.
La carta editable está en `menu.json`. El sistema genera copias lógicas diarias y
después de cada cierre; también permite exportar y restaurar copias desde Seguridad.
Las actualizaciones del programa nunca deben reemplazar esos archivos operativos.

---

## Flujo de trabajo diario

1. Abrir http://localhost:8080; el servidor ya inicia automáticamente con Windows
2. Mesas  → abrir mesa → agregar ítems → cobrar → confirmar pago
3. Ventas → ver resumen del día, exportar Excel si necesitas
4. Cierre de caja → al final del día, ingresar fondo inicial → Cerrar caja

Los cierres quedan en el historial para consultar cuando quieras.

Al cobrar, selecciona **Efectivo**, **Tarjeta** o **Transferencia**. El cierre
separa cada forma de pago y el total físico en caja incluye únicamente el fondo
inicial y los cobros realizados en efectivo.

Si el cliente decide seguir consumiendo, pulsa **Cancelar cobro y continuar pedido**.
La mesa vuelve a estar ocupada sin perder productos ni registrar la venta.

La opción **Cancelar pedido** se usa únicamente para pedidos creados por error o
cancelados por completo. Solicita confirmación, libera la mesa y elimina el pedido
sin registrar una venta ni descontar inventario.

## Control de inventario

En la pestaña **Inventario**, registra como entrada cada nueva entrega de bebidas
o vinos. El sistema muestra cuántas unidades ingresaron, cuántas se vendieron y
cuántas quedan. Al confirmar el pago de una mesa, las unidades vendidas se
descuentan automáticamente. Si no existe stock suficiente, el pago no se confirma
y el sistema informa qué producto falta.

Si existe una diferencia por conteo, merma o un registro equivocado, usar
**Corregir stock**. Se escribe una cantidad positiva para sumar o negativa para
restar y un motivo obligatorio. El ajuste queda visible en el historial y nunca
puede dejar las existencias en negativo.

## Caja chica y comprobantes

La pestaña **Caja chica** permite registrar ingresos y egresos de efectivo con su
concepto. Estos movimientos se incluyen en el cierre y en su archivo Excel. En los
pagos con tarjeta o transferencia se puede escribir opcionalmente el número del
comprobante; no es necesario guardar una fotografía.

---

## Exportar a Excel

- Ventas del día: pestaña Ventas → botón "Exportar Excel"
- Cierre completo: pestaña Cierre → botón "⬇ Excel" en cada cierre del historial

Cada Excel del cierre incluye seis hojas: resumen financiero, detalle de ventas,
top productos, movimientos de caja chica, cobros de cuentas pendientes e
**Inventario al cierre**. Esta última conserva las existencias compartidas exactas
del momento del cierre, aunque el archivo se descargue días después.

Los archivos Excel descargados se entregan con sus hojas protegidas para consulta:
permiten observar y usar los filtros, pero bloquean la edición, eliminación e
inserción de datos. Esta protección evita cambios accidentales; como cualquier
protección de Excel, no sustituye un PDF cuando se necesita un documento final
que no esté pensado para manipularse.

## Reportes generales

La pestaña **Reportes** permite consultar hoy, la semana actual, el mes actual o
cualquier rango de fechas. El reporte consolida ventas, formas de pago,
productos, caja chica y cobros de cuentas, y puede exportarse a un archivo Excel
de seis hojas.

## Cuentas de huéspedes y propietarios

Al cobrar una mesa se puede seleccionar **Cargar a cuenta** e identificar una
habitación, propietario u otra persona autorizada. La mesa se libera y el
inventario se descuenta, pero no ingresa dinero a caja. La pestaña **Cuentas**
permite acumular consumos, registrar pagos totales o parciales y convertir un
saldo en consumo interno dejando registrado el motivo. Los cobros posteriores
se incluyen en el cierre y los reportes según su forma de pago.
Al cargar un consumo a una habitación no se imprime como cobrado. La cuenta queda
abierta para nuevos pedidos, incluso en días posteriores. El comprobante de cierre
se imprime en dos copias únicamente cuando el saldo se paga por completo.

Al abrir una cuenta pendiente se puede usar **Agregar consumo** para seleccionar
nuevos productos sin registrar un pago. El consumo se suma a la estadía, conserva
el detalle de productos y descuenta inventario. **Descargar estado de cuenta**
genera un Excel protegido para recepción con huésped, habitación, consumos,
pagos y saldo. Cada cuenta tiene identificadores de estadía y reserva preparados
para conectarse posteriormente con un sistema hotelero.

El botón **Descargar todas las pendientes** genera para recepción un Excel general
con todos los huéspedes que mantienen saldo, un resumen por habitación y una hoja
adicional con el detalle de todos los productos consumidos.

---

## Modificar el menú

En el sistema, abrir la pestaña **Carta**. Cambiar el nombre, la descripción o el
precio de cualquier producto y pulsar **Guardar**. Los cambios se aplican a los
nuevos pedidos; las ventas y pedidos ya registrados conservan sus datos originales.

En la parte superior de **Carta** también se pueden crear productos. Al marcar
**Controlar stock**, el producto aparece automáticamente en **Inventario**, donde
se registra la primera entrada y las entregas posteriores.

## Impresión de comandas y comprobantes

Las comandas enviadas a cocina salen en **una sola copia**. Los comprobantes
impresos automáticamente al cobrar o cerrar una mesa salen en **dos copias
consecutivas**, al igual que las reimpresiones enviadas desde Ventas. En la vista
previa del navegador, la cantidad se elige manualmente en el diálogo de impresión.

Al realizar el cierre diario de caja también se imprimen dos copias de un resumen
térmico. Contiene únicamente fecha, hora, número de ventas, fondo inicial, totales
por forma de pago, cuentas, caja chica y total en caja. Puede reimprimirse desde el
historial de cierres.

- En una mesa ocupada, usar **Imprimir comanda de cocina** para imprimir el pedido
  actual en papel térmico (recomendado: 80 mm) o en una impresora normal.
- **Enviar comanda a cocina** manda el pedido desde cualquier teléfono o tablet al
  servidor y la computadora principal lo imprime directamente en la impresora USB
  `SAT 22TUS`. El móvil no necesita tener instalada la impresora. La computadora,
  el sistema y la impresora deben permanecer encendidos. Si cambia la red, abre en
  el móvil la nueva dirección `Network` mostrada por el frontend; la configuración
  de la impresora USB no cambia.
- En **Ventas**, usar **Imprimir respaldo** para entregar al cliente un comprobante
  del consumo y forma de pago. Se puede imprimir en papel o guardar como PDF.
- Al confirmar un pago o una carga a cuenta, el comprobante se abre automáticamente
  para imprimir. Incluye cantidad, producto, precio unitario, subtotal y total,
  además de los datos para factura o la indicación **Consumidor final**.
- Durante el cobro se puede marcar **El cliente solicita factura** y registrar
  nombre o razón social, RUC/cédula y ciudad. La información queda almacenada con
  la venta. En **Ventas**, el botón **Descargar solicitudes de factura** genera el
  Excel diario para la contadora con los datos del cliente, fecha y consumo.

El comprobante del sistema es un respaldo de compra y no una factura electrónica
autorizada. Para emitir factura tributaria se debe integrar un proveedor de
facturación electrónica autorizado y registrar los datos fiscales del negocio y
del cliente.

---

## Instalación final del servidor y las impresoras

En la computadora principal, ejecutar `instalar.bat` y luego hacer clic derecho
sobre `configurar_servidor.bat` → **Ejecutar como administrador**. Esto desactiva
la suspensión cuando está conectada, inicia River Paradise al entrar a Windows y
crea un respaldo diario a las 23:30. Se conservan los últimos 30 respaldos en
`respaldos`. La IP debe reservarse una sola vez desde el router para que los
teléfonos y tablets mantengan siempre el mismo acceso directo.

En la computadora de cada local, copiar el proyecto y ejecutar
`impresion\configurar_agente.bat`. El asistente muestra las impresoras de Windows
y solicita: local (`restaurante` o `cafeteria`), dirección del servidor y nombre
exacto de la impresora. Cada agente recoge solamente sus trabajos. Las comandas
salen una vez y los comprobantes dos veces. Si la computadora o impresora no está
disponible, el trabajo queda en la cola central para reintentarse.
El agente consulta la cola cuatro veces por segundo para que las comandas lleguen
a la impresora prácticamente de inmediato dentro de la red local.

## Checklist de pruebas

  [ ] Abrir mesa → agregar ítems → cobrar → confirmar pago
  [ ] Ir a Ventas → verificar que aparece la venta con el total correcto
  [ ] Descargar Excel de ventas → verificar que tiene los datos
  [ ] Registrar 2-3 ventas → ir a Cierre → ingresar fondo → cerrar caja
  [ ] Verificar que el cierre aparece en el historial
  [ ] Descargar Excel del cierre → verificar las tres hojas
  [ ] Cerrar el navegador con una mesa abierta → reabrir → la mesa sigue ocupada
  [ ] Cancelar pedido → confirmar → NO debe aparecer en ventas

---

## Estructura del proyecto

  river-paradise\
  ├── instalar.bat              ← Ejecutar solo la primera vez
  ├── configurar_servidor.bat   ← Ejecutar como administrador una sola vez
  ├── iniciar.bat               ← Inicio manual opcional
  ├── servidor.ps1              ← Supervisor automático del servidor
  ├── backend\
  │   ├── server.js             ← API completa
  │   ├── river_paradise.sqlite ← Base de datos (NO borrar)
  │   └── package.json
  └── frontend\
      ├── src\
      │   ├── data\menu.js      ← Carga la carta compartida
      │   └── pages\            ← Mesas, Ventas, Cierre
      └── package.json
  └── menu.json                 ← Carta del restaurante (editable)
