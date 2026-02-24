FROM node:20-alpine

# Directorio de trabajo en el contenedor
WORKDIR /app

# Copiamos primero el package.json y lock para optimizar la cache de dependencias
COPY package*.json ./

# Instalamos dependencias
RUN npm ci

# Copiamos todo el codigo fuente y carpetas estaticas
COPY . .

# Generamos el Cliente de Prisma
RUN npx prisma generate

# Compilamos TypeScript a JavaScript (dist/)
RUN npm run build

# Exponemos el puerto 3000 y el 8080 si quieres servir frontend estatico
EXPOSE 3000

# Iniciamos la aplicacion
CMD ["npm", "start"]
