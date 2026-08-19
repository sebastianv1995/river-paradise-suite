# Instalación definitiva en Windows

## Antes de comenzar

- Instalar **Git para Windows** y **Node.js 22 LTS o posterior** en la computadora servidor.
- Instalar **Git para Windows** en la laptop del restaurante. La laptop no necesita Node.js porque solo usa el navegador y el agente de impresión.
- Mantener la computadora de cafetería conectada por cable de red si es posible.
- Reservar en el router la dirección `192.168.0.18` para la computadora servidor.
- Configurar la red de Windows como **Privada**.

## Computadora servidor de cafetería

Abrir CMD como administrador y ejecutar:

```bat
cd /d C:\
git clone https://github.com/sebastianv1995/river-paradise-suite.git RiverParadise
cd /d C:\RiverParadise
instalar.bat
```

Después:

1. Hacer clic derecho en `C:\RiverParadise\configurar_servidor.bat`.
2. Seleccionar **Ejecutar como administrador**.
3. Reiniciar Windows una vez para comprobar el inicio automático.
4. Abrir `http://localhost:8080` en el servidor.
5. Desde otra computadora o tablet abrir `http://192.168.0.18:8080`.

No se debe ejecutar Vite ni usar el puerto 5173. El backend del puerto 8080 entrega también la interfaz compilada.

### Actualizaciones posteriores del servidor

Hacer clic derecho en `C:\RiverParadise\actualizar_desde_git.bat` y seleccionar **Ejecutar como administrador**.

El script crea un respaldo, detiene el servicio, ejecuta `git pull --ff-only origin main`, instala dependencias, compila la interfaz y vuelve a iniciar el servidor. Conserva:

- `backend\river_paradise.sqlite`
- `menu.json`
- `impresion\config.json`
- respaldos y registros

Un `git pull` aislado no es suficiente cuando cambia la interfaz, porque después también debe ejecutarse `npm run build`.

## Laptop del restaurante

Abrir CMD como administrador y ejecutar:

```bat
cd /d C:\
git clone https://github.com/sebastianv1995/river-paradise-suite.git RiverParadise
```

Después:

1. Instalar normalmente la impresora en Windows y realizar una página de prueba.
2. Conectar siempre la impresora al mismo puerto USB cuando sea posible.
3. Hacer clic derecho en `C:\RiverParadise\impresion\configurar_agente.bat`.
4. Seleccionar **Ejecutar como administrador**.
5. Escribir `restaurante` como local.
6. Escribir `http://192.168.0.18:8080` como servidor.
7. Copiar exactamente el nombre de la impresora mostrado por el asistente.
8. Reiniciar la laptop y hacer una comanda de prueba.

La configuración queda en `impresion\config.json` y no se borra con `git pull`. El agente inicia oculto 15 segundos después de entrar a Windows, se reinicia si falla y espera si la impresora todavía no está conectada. Al conectar nuevamente el USB, la reconoce usando el mismo nombre de Windows y continúa automáticamente.

Solo se vuelve a ejecutar `configurar_agente.bat` si cambia alguno de estos datos:

- nombre de la impresora en Windows;
- dirección IP del servidor;
- local asignado a la computadora.

### Actualizaciones posteriores del agente

Hacer clic derecho en `C:\RiverParadise\impresion\actualizar_agente_desde_git.bat` y seleccionar **Ejecutar como administrador**. El archivo descarga los cambios, conserva `config.json` y reinicia el agente.

## Tablets

No se instala nada. Conectarlas a la misma red local y abrir:

`http://192.168.0.18:8080`

Se puede agregar esa página a la pantalla de inicio para abrirla como una aplicación.

## Ventanas negras

En el uso diario no deben aparecer ventanas negras. El servidor y el agente se ejecutan mediante tareas de Windows con PowerShell oculto. Solo aparecen ventanas al ejecutar manualmente un instalador, una actualización o una herramienta de diagnóstico.

No usar diariamente `iniciar.bat`, `npm start` ni `npm run dev`; esos métodos manuales sí pueden mostrar una consola.

## Prueba final obligatoria

1. Apagar servidor y laptop.
2. Encender primero servidor y esperar un minuto.
3. Confirmar `http://192.168.0.18:8080` desde el teléfono.
4. Encender la laptop con la impresora desconectada.
5. Conectar la impresora después de iniciar sesión.
6. Enviar una comanda desde una tablet.
7. Confirmar que se imprime sin abrir ni configurar nuevamente el agente.
8. Reiniciar otra vez la laptop y repetir una comanda.

Si no imprime, revisar `C:\RiverParadise\logs\impresion.log` y confirmar en Windows que el nombre de la impresora no haya cambiado.
