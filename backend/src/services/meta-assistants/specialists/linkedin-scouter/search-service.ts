import * as cheerio from 'cheerio';
import { TavilySearch } from "@langchain/tavily";

export interface SearchResult {
    title: string;
    link: string;
    snippet: string;
}

/**
 * Busca perfiles de LinkedIn utilizando Tavily AI con fallback a DuckDuckGo.
 * Se ha eliminado la integración con Google Custom Search por errores persistentes de permisos.
 */
export async function searchLinkedInProfiles(query: string): Promise<SearchResult[]> {
    const tavilyKey = process.env.TAVILY_API_KEY;

    if (!tavilyKey) {
        console.warn('[SearchService] TAVILY_API_KEY no configurada en .env. Usando DuckDuckGo como fallback.');
        return await searchDuckDuckGo(`site:linkedin.com/in/ ${query}`);
    }

    try {
        console.log(`[SearchService] 🔍 Buscando en Tavily: ${query}`);
        
        // Inicializamos la herramienta de Tavily desde LangChain
        const tool = new TavilySearch({ 
            maxResults: 10,
            searchDepth: "advanced"
        });

        // Ejecutar búsqueda - Usamos ambas variaciones (underscore y camelCase) por seguridad según versión
        console.log(`[SearchService] 🛠️  Llamando a Tavily con query: "${query}"...`);
        const rawResults = await tool.invoke({ 
            query: query,
            include_domains: ["linkedin.com/in"],
            includeDomains: ["linkedin.com/in"]
        } as any);

        console.log(`[SearchService] 🛰️  Tavily response type: ${typeof rawResults}`);
        if (typeof rawResults === 'object' && rawResults !== null) {
            console.log(`[SearchService] 🛠️  Object keys:`, Object.keys(rawResults));
        }

        // Procesar resultados
        let items: any[] = [];
        if (typeof rawResults === 'string') {
            try {
                items = JSON.parse(rawResults);
            } catch (e) {
                // Si Tavily devuelve un string directo (ej: resumen), intentamos DDG para obtener la lista estructurada
                console.warn('[SearchService] Tavily devolvió un formato no estructurado. Usando DDG para el listado.');
                return await searchDuckDuckGo(`site:linkedin.com/in/ ${query}`);
            }
        } else if (Array.isArray(rawResults)) {
            items = rawResults;
        } else if (typeof rawResults === 'object' && rawResults !== null && (rawResults as any).results) {
            // Caso en el que devuelve { results: [...] }
            items = (rawResults as any).results;
        }
        
        console.log(`[SearchService] ✅ Resultados procesados: ${items.length}`);

        if (!items || items.length === 0) {
            console.warn('[SearchService] Tavily no encontró resultados con restricción de dominio. Reintentando consulta directa...');
            const fallbackResults = await tool.invoke({ 
                query: `site:linkedin.com/in/ ${query}`,
                search_depth: "advanced"
            } as any);
            
            if (typeof fallbackResults === 'string') {
                try { items = JSON.parse(fallbackResults); } catch(e) {}
            } else if (Array.isArray(fallbackResults)) {
                items = fallbackResults;
            }

            if (!items || items.length === 0) {
                console.warn('[SearchService] Tavily tampoco encontró nada con consulta directa. Probando DDG...');
                return await searchDuckDuckGo(`site:linkedin.com/in/ ${query}`);
            }
        }

        return items.map((item: any) => ({
            title: item.title || 'Perfil de LinkedIn',
            link: item.url || item.link || '',
            snippet: item.content || item.snippet || ''
        }));

    } catch (error: any) {
        console.error('[SearchService] ❌ Error en Tavily:', error.message);
        console.log('[SearchService] 🔄 Reintentando con DuckDuckGo...');
        return await searchDuckDuckGo(`site:linkedin.com/in/ ${query}`);
    }
}

/**
 * Buscador de respaldo (DuckDuckGo HTML) que no requiere API Key.
 * Útil para asegurar que el agente siempre devuelva algo si las APIs fallan.
 */
async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
    try {
        console.log(`[DuckDuckGo] 🔍 Buscando: ${query}`);
        const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
            }
        });

        if (!response.ok) {
            console.error('[DuckDuckGo] Error HTTP:', response.status);
            return [];
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        const results: SearchResult[] = [];

        $('.result').each((i: number, el: any) => {
            if (results.length >= 10) return;
            
            const titleEl = $(el).find('.result__a');
            const title = titleEl.text().trim();
            let link = titleEl.attr('href') || '';
            const snippet = $(el).find('.result__snippet').text().trim();

            // Limpiar los links de redirección de DuckDuckGo
            if (link.includes('uddg=')) {
                try {
                    const urlObj = new URL('https:' + link);
                    const cleanUrl = urlObj.searchParams.get('uddg');
                    if (cleanUrl) link = cleanUrl;
                } catch (e) {
                    if (link.startsWith('//')) link = 'https:' + link;
                }
            }

            if (title && link) {
                results.push({ title, link, snippet });
            }
        });

        console.log(`[DuckDuckGo] ✅ Encontrados ${results.length} resultados.`);
        return results;
    } catch (err) {
        console.error('[DuckDuckGo] El fallback ha fallado:', err);
        return [];
    }
}
