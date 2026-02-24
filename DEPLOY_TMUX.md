# 🚀 Guía de Despliegue de OLAWEE 2.0 usando `tmux`

Ya que utilizáis un VPS (Servidor Linux) y preferís manejar la ejecución de fondo a través de sesiones de `tmux` en lugar de contenedores Docker, aquí os dejo los pasos exactos y comandos para clonar, compilar y dejar el "Cerebro de OLAWEE" ejecutándose 24/7 en el servidor.

---

### Paso 1: Preparación Inicial del Servidor
Conéctate por SSH a tu servidor y asegúrate de tener Node.js instalado (versión 20+ recomendada).

```bash
# Refrescar e instalar dependencias base
sudo apt update
sudo apt install -y curl git tmux

# Instalar Node.js v20 (Si no lo tienes)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Paso 2: Descargar y Preparar el Código de OLAWEE
Descarga el código o súbelo por FTP/SCP. Si usas Git:

```bash
# 1. Clonar el repositorio
git clone <URL-DE-TU-REPOSITORIO> olawee-backend
cd olawee-backend

# 2. Instalar dependencias limpias (ignorar dependencias dev si quieres)
npm ci
```

### Paso 3: Configurar Entorno (Las variables Críticas)
Dado que el archivo `.env` está en `.gitignore` por seguridad, tendrás que crearlo manualmente en el servidor.

```bash
nano .env
```

Pega ahí tus claves. **Recuerda:**
- `DATABASE_URL` y `DIRECT_URL` (Supabase).
- APIS de OpenAI, Gemini, etc.
- Claves de `SMTP_USER` y `SMTP_PASS` para el **Protocolo 5**.
- *Guarda pulsando `Ctrl+O`, `Enter` y luego cierra con `Ctrl+X`.*

### Paso 4: Generar el Motor Prisma y Compilar el Código
Para que Node pueda arrancar el servidor a máxima velocidad sin depender del "modo inspector", tenemos que pre-compilar el TypeScript a puro JavaScript en la carpeta `dist`.

```bash
# 1. Conectar las bases de datos (Generar los Types y Clientes)
npx prisma generate

# 2. Transpilar TypeScript a código estricto de Producción
npm run build
```

---

### Paso 5: 🟢 Levantar OLAWEE 2.0 Inmortal con `tmux`
Ahora que el código está pre-compilado en la carpeta `dist`, crearemos la sesión que quedará enganchada al servidor para siempre.

```bash
# 1. Crear una nueva 'ventana irrompible' llamada "olawee"
tmux new -s olawee

# 2. (Dentro de tmux) Ejecutar el Modo Start (El servidor de Producción rápido)
npm start

# -> Verás que la consola dice: "Server is running on port 3000"
```

### Paso 6: Desconectar (Dejando todo Creciendo en la Sombra)
- Mientras el servidor marque "Running", pulsa en tu teclado: **`Ctrl+B` y luego suelta y pulsa la tecla `D`**.
- Verás el mensaje `[detached (from session olawee)]`.
- ¡Felicidades! Ya puedes cerrar la terminal, apagar tu PC o salir del SSH. El servidor seguirá viviendo de fondo.

---

### 🧰 Comandos Útiles de Rescate para `tmux`

Manejar `tmux` es un arte. Si algo se rompe, o necesitas leer qué error soltó en tiempo real, usa esto:

- **Volver a entrar** para ver cómo la IA responde en tiempo real:
  ```bash
  tmux attach -t olawee
  ```

- **Ver qué otras mentes/sesiones tienes corriendo en el servidor:**
  ```bash
  tmux ls
  ```

- **Matar OLAWEE violentamente (borrar la sesión):**
  ```bash
  tmux kill-session -t olawee
  ```

---
*Si además vas a servir las páginas visuales (El panel Frontend N8N y el Pymes) y quieres que también vivan allí por el puerto 8080, puedes abrir otra sesión diferente con `tmux new -s olawee-frontend` y correr el comando de Python: `python -m http.server 8080 --directory frontend` y volver a desacoplarte con `Ctrl+B -> D`.*
