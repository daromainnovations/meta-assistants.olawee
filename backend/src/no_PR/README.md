# 🚫 Carpeta NO_PR — Solo para entorno QA

> **Esta carpeta NO debe llegar a producción.**

## ¿Por qué existe?

En **producción real**, el frontend de la plataforma OLAWEE ya se encarga de:
1. Leer el campo `systemprompt_doc` de la tabla de chats para la sesión activa.
2. Enviarlo en el body de cada petición al webhook.

Por tanto, el webhook siempre recibe el contexto de documentos previos junto con el mensaje del usuario, **sin necesidad de consultar la BD de nuevo**.

---

## ¿Qué hace el código de esta carpeta?

En el entorno **QA** (este frontend simplificado), ese paso del frontend no existe.
Para simular el mismo comportamiento, el middleware `qa-doc-injector.middleware.ts` intercepta
cada petición **antes** de que llegue al webhook y:

1. Lee el `session_id` del body.
2. Consulta la tabla de chats correspondiente (`prueba_chatsllms`, `prueba_chatsassistants`, etc).
3. Si existe `systemprompt_doc` guardado para esa sesión:
   - Si el request **no trae** nuevo documento → lo inyecta en `req.body.systemprompt_doc`.
   - Si el request **sí trae** nuevo documento → **concatena** el histórico + el nuevo (separados por `---`).

## Middlewares incluidos

| Archivo | Descripción |
|---|---|
| `qa-doc-injector.middleware.ts` | Inyección/concatenación de systemprompt_doc desde BD |

## Cómo identificarlo para eliminar en producción

Busca en `webhook.routes.ts` los imports de `../no_PR/` y las líneas con `qaDocInjector(...)`.
Elimínalas y el sistema funcionará solo con lo que ya envía el frontend real.
